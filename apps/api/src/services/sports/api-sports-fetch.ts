/**
 * Rate-limited fetch utility for TheSportsDB.com
 * V1 API with paid key — 100 req/min, all sports.
 */

const API_KEY = process.env.THESPORTSDB_KEY || process.env.API_FOOBTALL_ALL_SPORTS || '';
const BASE_URL = `https://www.thesportsdb.com/api/v1/json/${API_KEY}`;
const BASE_URL_V2 = 'https://www.thesportsdb.com/api/v2/json';
const RATE_LIMIT_MS = 1_000; // 1s between calls (safe for 100/min)

let lastCallAt = 0;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch from TheSportsDB V1 API (key in URL path).
 */
export async function sportsDbFetch(path: string): Promise<any> {
  if (!API_KEY) {
    throw new Error('THESPORTSDB_KEY not configured');
  }

  const elapsed = Date.now() - lastCallAt;
  if (elapsed < RATE_LIMIT_MS) {
    await sleep(RATE_LIMIT_MS - elapsed);
  }

  const url = `${BASE_URL}/${path}`;
  lastCallAt = Date.now();

  const res = await fetch(url);

  if (res.ok) {
    const text = await res.text();
    if (!text || text.trim() === '') return { events: null };
    return JSON.parse(text);
  }

  if (res.status === 429) {
    console.warn('[SportsDB] Rate limited (429), backing off 5s...');
    await sleep(5_000);
    throw new Error('SPORTSDB_RATE_LIMITED');
  }

  throw new Error(`SportsDB API error: ${res.status} ${res.statusText}`);
}

/**
 * Fetch from TheSportsDB V2 API (key in header).
 */
export async function sportsDbFetchV2(path: string): Promise<any> {
  if (!API_KEY) {
    throw new Error('THESPORTSDB_KEY not configured');
  }

  const elapsed = Date.now() - lastCallAt;
  if (elapsed < RATE_LIMIT_MS) {
    await sleep(RATE_LIMIT_MS - elapsed);
  }

  const url = `${BASE_URL_V2}/${path}`;
  lastCallAt = Date.now();

  const res = await fetch(url, {
    headers: { 'X-API-KEY': API_KEY },
  });

  if (res.ok) {
    const text = await res.text();
    if (!text || text.trim() === '') return {};
    return JSON.parse(text);
  }

  throw new Error(`SportsDB V2 error: ${res.status} ${res.statusText}`);
}
