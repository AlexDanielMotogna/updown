const API_BASE = 'https://api.football-data.org/v4';

/**
 * Parses comma-separated API keys from FOOTBALL_DATA_API_KEYS (preferred)
 * or falls back to single FOOTBALL_DATA_API_KEY.
 */
function getKeys(): string[] {
  const multi = process.env.FOOTBALL_DATA_API_KEYS;
  if (multi) return multi.split(',').map(k => k.trim()).filter(Boolean);
  const single = process.env.FOOTBALL_DATA_API_KEY;
  if (single) return [single.trim()];
  return [];
}

let keyIndex = 0;

/**
 * Fetch from football-data.org with automatic key rotation on 429.
 * Tries each key once before giving up.
 */
export async function footballFetch(path: string): Promise<any> {
  const keys = getKeys();
  if (keys.length === 0) {
    throw new Error('No FOOTBALL_DATA_API_KEYS configured');
  }

  const startIndex = keyIndex % keys.length;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < keys.length; attempt++) {
    const idx = (startIndex + attempt) % keys.length;
    const token = keys[idx];

    const res = await fetch(`${API_BASE}${path}`, {
      headers: { 'X-Auth-Token': token },
    });

    if (res.ok) {
      // Advance to next key for next call (round-robin)
      keyIndex = (idx + 1) % keys.length;
      return res.json();
    }

    if (res.status === 429) {
      console.warn(`[Football API] Key ${idx + 1}/${keys.length} rate-limited, trying next...`);
      lastError = new Error(`Rate limited (429)`);
      continue;
    }

    // Non-429 error — don't retry with another key
    throw new Error(`Football API error: ${res.status} ${res.statusText}`);
  }

  throw lastError ?? new Error('All football API keys exhausted (429)');
}
