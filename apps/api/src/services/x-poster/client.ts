import { TwitterApi } from 'twitter-api-v2';

/**
 * Thin wrapper around the X (Twitter) v2 write API. We only ever PUBLISH our own
 * announcements — never read/store X data (see the developer-app use case). Auth
 * is OAuth 1.0a user context (the 4 app keys), which `POST /2/tweets` requires.
 *
 * Keys live in env, never in the DB/repo:
 *   X_API_KEY / X_API_SECRET           — app consumer key + secret
 *   X_ACCESS_TOKEN / X_ACCESS_SECRET   — access token + secret (Read+Write)
 */

let client: TwitterApi | null = null;

/** True when all 4 OAuth 1.0a credentials are present in env. */
export function hasXCredentials(): boolean {
  return Boolean(
    process.env.X_API_KEY &&
      process.env.X_API_SECRET &&
      process.env.X_ACCESS_TOKEN &&
      process.env.X_ACCESS_SECRET,
  );
}

/** Lazily build (and memoize) the write-capable client. Returns null if unconfigured. */
function getClient(): TwitterApi | null {
  if (client) return client;
  if (!hasXCredentials()) return null;
  client = new TwitterApi({
    appKey: process.env.X_API_KEY!,
    appSecret: process.env.X_API_SECRET!,
    accessToken: process.env.X_ACCESS_TOKEN!,
    accessSecret: process.env.X_ACCESS_SECRET!,
  });
  return client;
}

/**
 * Publish a single tweet. Returns the new tweet id.
 * Throws if X is unconfigured or the API call fails (caller logs + leaves the
 * pool unmarked so it retries next cycle).
 */
export async function postTweet(text: string): Promise<string> {
  const c = getClient();
  if (!c) throw new Error('X poster: missing X_API_KEY/X_API_SECRET/X_ACCESS_TOKEN/X_ACCESS_SECRET');
  const res = await c.v2.tweet(text);
  return res.data.id;
}

/**
 * Identify the account these credentials post AS — i.e. which @handle the Access
 * Token belongs to. Use it to confirm the target account before tweeting for real.
 */
export async function getAuthedAccount(): Promise<{ id: string; username: string; name: string }> {
  const c = getClient();
  if (!c) throw new Error('X poster: missing X_API_KEY/X_API_SECRET/X_ACCESS_TOKEN/X_ACCESS_SECRET');
  const me = await c.v2.me();
  return { id: me.data.id, username: me.data.username, name: me.data.name };
}
