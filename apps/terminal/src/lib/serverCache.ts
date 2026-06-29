/**
 * Server-side cache for read routes that hit HyperLiquid's info endpoint. Collapses
 * many client polls into one upstream call per TTL window, de-dupes concurrent
 * callers, and — crucially — serves the last good value when the upstream errors
 * (e.g. HL 429 rate-limit) instead of failing the request.
 */
interface Entry<T> { data: T; expires: number }

const store = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

export async function cached<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = store.get(key) as Entry<T> | undefined;
  if (hit && hit.expires > now) return hit.data;

  let p = inflight.get(key) as Promise<T> | undefined;
  if (!p) {
    p = fetcher()
      .then((data) => { store.set(key, { data, expires: Date.now() + ttlMs }); return data; })
      .catch((e) => {
        // Serve stale (even expired) on upstream error so a 429 doesn't break the UI.
        const stale = store.get(key) as Entry<T> | undefined;
        if (stale) return stale.data;
        throw e;
      })
      .finally(() => { inflight.delete(key); });
    inflight.set(key, p);
  }
  return p;
}
