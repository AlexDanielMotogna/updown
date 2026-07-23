import { createRemoteJWKSet, jwtVerify } from 'jose';

/**
 * Verify a Privy access token server-side and return the user's DID (the contest
 * identity). Uses Privy's public JWKS for the app — needs only the (public) app id,
 * NOT the app secret. Returns null on any failure (missing config, bad/expired token).
 */
const APP_ID = process.env.PRIVY_APP_ID || process.env.NEXT_PUBLIC_PRIVY_APP_ID || '';

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJwks() {
  if (!APP_ID) return null;
  if (!jwks) jwks = createRemoteJWKSet(new URL(`https://auth.privy.io/api/v1/apps/${APP_ID}/jwks.json`));
  return jwks;
}

export async function verifyPrivyDid(token: string | undefined | null): Promise<string | null> {
  if (!token) return null;
  const set = getJwks();
  if (!set) {
    console.warn('[WorldCupAuth] PRIVY_APP_ID not set — cannot verify contest tokens');
    return null;
  }
  try {
    const { payload } = await jwtVerify(token, set, { issuer: 'privy.io', audience: APP_ID });
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

/** Extract a Bearer token from an Authorization header. */
export function bearerToken(authHeader: string | undefined): string | undefined {
  if (!authHeader) return undefined;
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
}
