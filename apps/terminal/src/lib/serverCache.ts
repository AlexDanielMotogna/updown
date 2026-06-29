/**
 * Server-side cache for read routes that hit HyperLiquid's info endpoint. Collapses
 * many client polls into one upstream call per TTL window, de-dupes concurrent
 * callers, and serves the last good value when the upstream errors (e.g. HL 429)
 * — but only briefly, so a persistently rate-limited server can't pin ancient data.
 */
interface Entry<T> { data: T; storedAt: number; expires: number }

// How long a stale value may be served on upstream error before we give up on it
// (and let the route return empty / retry fresh). Prevents the "frozen old data"
// case where a long-running dev server keeps 429-ing and serves a days-old snapshot.
const MAX_STALE_MS = 90_000;

const store = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

export async function cached<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = store.get(key) as Entry<T> | undefined;
  if (hit && hit.expires > now) return hit.data;

  let p = inflight.get(key) as Promise<T> | undefined;
  if (!p) {
    p = fetcher()
      .then((data) => { store.set(key, { data, storedAt: Date.now(), expires: Date.now() + ttlMs }); return data; })
      .catch((e) => {
        // Serve stale on error, but only if it's still recent — otherwise re-throw so
        // we don't keep returning a frozen old snapshot under sustained rate-limiting.
        const stale = store.get(key) as Entry<T> | undefined;
        if (stale && Date.now() - stale.storedAt < MAX_STALE_MS) return stale.data;
        if (stale) store.delete(key); // drop the too-old snapshot
        throw e;
      })
      .finally(() => { inflight.delete(key); });
    inflight.set(key, p);
  }
  return p;
}
