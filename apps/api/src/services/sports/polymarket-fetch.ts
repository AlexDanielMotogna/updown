const GAMMA_BASE = 'https://gamma-api.polymarket.com';
const RATE_LIMIT_MS = 3_000; // 3s between calls (Gamma caches 180s anyway)

let lastCallAt = 0;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch from Polymarket Gamma API with rate limiting.
 * No auth required — Gamma is public for reads.
 */
export async function polymarketFetch(path: string): Promise<any> {
  // Rate limit: wait if needed
  const elapsed = Date.now() - lastCallAt;
  if (elapsed < RATE_LIMIT_MS) {
    await sleep(RATE_LIMIT_MS - elapsed);
  }

  const url = `${GAMMA_BASE}${path}`;
  lastCallAt = Date.now();

  const res = await fetch(url);

  if (res.ok) {
    return res.json();
  }

  if (res.status === 429) {
    // Back off and retry once
    console.warn('[Polymarket] Rate limited (429), backing off 10s...');
    await sleep(10_000);
    lastCallAt = Date.now();
    const retry = await fetch(url);
    if (retry.ok) return retry.json();
    throw new Error(`Polymarket API 429 after retry: ${retry.statusText}`);
  }

  throw new Error(`Polymarket API error: ${res.status} ${res.statusText}`);
}
