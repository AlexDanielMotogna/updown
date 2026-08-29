import { Request, Response, NextFunction } from 'express';

import { prisma } from '../db';
import { verifyPrivyDid, bearerToken } from '../services/worldcup-auth';

/**
 * Authentication for the money routes.
 *
 * Every /api/exchange route used to take its acting identity from a
 * `walletAddress` field in the request body, with nothing to prove the caller
 * owned it. Wallet addresses are public (the leaderboard hands them out), so
 * anyone could place orders, rotate agent keys or read positions for any user.
 *
 * Here the identity comes from a verified Privy access token instead. The token
 * yields a DID; `User.privyDid` maps that DID to exactly one UpDown user; the
 * route then uses `req.authUser.walletAddress` and ignores whatever the body
 * claimed.
 *
 * BINDING. Accounts predate this, so most have `privyDid = null` and have to be
 * bound once. Binding is NOT trust-on-first-use: that would just move the hole,
 * since anyone with their own Privy account could claim someone else's wallet.
 * Instead we ask Privy which wallets that DID actually owns (server-to-server,
 * app id + secret) and only bind to a user whose wallet is in that list.
 *
 * FAILS CLOSED. Without PRIVY_APP_ID / PRIVY_APP_SECRET nothing can be verified,
 * so every request is refused rather than silently falling back to the old
 * trust-the-body behaviour.
 */

const PRIVY_API = 'https://auth.privy.io/api/v1';

export interface AuthUser {
  id: string;
  walletAddress: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      authUser?: AuthUser;
    }
  }
}

function appCreds(): { appId: string; appSecret: string } | null {
  const appId = (process.env.PRIVY_APP_ID || process.env.NEXT_PUBLIC_PRIVY_APP_ID || '').trim();
  const appSecret = (process.env.PRIVY_APP_SECRET || '').trim();
  if (!appId || !appSecret) return null;
  return { appId, appSecret };
}

interface PrivyLinkedAccount {
  type?: string;
  address?: string;
  chain_type?: string;
}

/**
 * Every wallet address Privy says this DID owns, lowercased. Returns null when
 * the lookup could not be performed (missing creds, Privy unreachable) so the
 * caller can tell "no wallets" from "could not check" and refuse either way.
 */
async function privyWalletsFor(did: string): Promise<string[] | null> {
  const creds = appCreds();
  if (!creds) return null;
  try {
    const auth = Buffer.from(`${creds.appId}:${creds.appSecret}`).toString('base64');
    const res = await fetch(`${PRIVY_API}/users/${encodeURIComponent(did)}`, {
      headers: {
        Authorization: `Basic ${auth}`,
        'privy-app-id': creds.appId,
        'Content-Type': 'application/json',
      },
    });
    if (!res.ok) {
      console.warn(`[privy-auth] user lookup failed for ${did}: ${res.status}`);
      return null;
    }
    const body = (await res.json()) as { linked_accounts?: PrivyLinkedAccount[] };
    return (body.linked_accounts ?? [])
      .filter((a) => a.type === 'wallet' && typeof a.address === 'string')
      .map((a) => a.address!.toLowerCase());
  } catch (e) {
    console.warn('[privy-auth] user lookup threw:', e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * Find the UpDown user for a DID, binding it on first use when Privy confirms
 * ownership. Returns null when no user could be safely resolved.
 */
async function resolveAuthUser(did: string): Promise<AuthUser | null> {
  const bound = await prisma.user.findUnique({
    where: { privyDid: did },
    select: { id: true, walletAddress: true },
  });
  if (bound) return bound;

  // Not bound yet. Ask Privy which wallets this DID owns, then find the UpDown
  // user behind any of them: the Solana wallet IS the identity, and an EVM one
  // reaches the same user through wallet_links.
  const owned = await privyWalletsFor(did);
  if (!owned || owned.length === 0) return null;

  const candidate =
    (await prisma.user.findFirst({
      where: { walletAddress: { in: owned, mode: 'insensitive' } },
      select: { id: true, walletAddress: true, privyDid: true },
    })) ??
    (await prisma.walletLink
      .findFirst({
        where: { address: { in: owned, mode: 'insensitive' } },
        select: { user: { select: { id: true, walletAddress: true, privyDid: true } } },
      })
      .then((l) => l?.user ?? null));

  if (!candidate) return null;
  // Already claimed by a different Privy account: refuse rather than re-point it.
  if (candidate.privyDid && candidate.privyDid !== did) {
    console.warn(`[privy-auth] user ${candidate.id} is already bound to another DID`);
    return null;
  }

  // Conditional write, so two concurrent first-requests cannot both bind.
  const claimed = await prisma.user.updateMany({
    where: { id: candidate.id, privyDid: null },
    data: { privyDid: did },
  });
  if (claimed.count === 0 && !candidate.privyDid) return null;

  return { id: candidate.id, walletAddress: candidate.walletAddress };
}

export async function requirePrivyUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!appCreds()) {
    console.error('[privy-auth] PRIVY_APP_ID / PRIVY_APP_SECRET not configured — refusing money requests');
    res.status(503).json({
      success: false,
      error: { code: 'AUTH_NOT_CONFIGURED', message: 'Authentication is not configured' },
    });
    return;
  }

  const did = await verifyPrivyDid(bearerToken(req.headers.authorization));
  if (!did) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue' },
    });
    return;
  }

  const user = await resolveAuthUser(did);
  if (!user) {
    res.status(403).json({
      success: false,
      error: { code: 'NO_LINKED_ACCOUNT', message: 'No UpDown account is linked to this login' },
    });
    return;
  }

  req.authUser = user;
  next();
}
