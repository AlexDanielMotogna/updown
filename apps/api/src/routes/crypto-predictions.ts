import { Router, type Router as RouterType, type Request } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { PublicKey } from '@solana/web3.js';
import { prisma } from '../db';
import { verifyPrivyDid, bearerToken } from '../services/worldcup-auth';
import { registerUser } from '../services/rewards';
import { mintTestFunds } from '../services/test-funds';

/**
 * Crypto Predictions event — public API (Privy-authed), /api/crypto-predictions.
 * Same on-chain mechanic as the main app, crypto-only (5-min BTC/ETH/SOL pools),
 * with one-time auto-funded users and a weekly PNL leaderboard.
 * See docs/PLAN-CRYPTO-PREDICTIONS.md.
 */
export const cryptoPredictionsRouter: RouterType = Router();

const ASSETS = ['BTC', 'ETH', 'SOL'];
const INTERVAL = '5m';
const BETTABLE = ['JOINING', 'ACTIVE'] as const;
const SETTLED = ['RESOLVED', 'CLAIMABLE', 'CANCELLED'];

/** Verify the Privy token → the user's DID (auth anchor). Null if unauthenticated. */
export async function resolveEventDid(req: Request): Promise<string | null> {
  return verifyPrivyDid(bearerToken(req.headers.authorization));
}

/** Start of the current week (Monday 00:00 UTC) — the weekly leaderboard window. */
function weekStartUtc(now = new Date()): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dow = d.getUTCDay(); // 0=Sun..6=Sat
  d.setUTCDate(d.getUTCDate() - (dow === 0 ? 6 : dow - 1));
  return d;
}

/**
 * Realized PNL (Σ payout − stake) over settled CRYPTO pools. Optional week window
 * (`since` = pool end_time) and wallet scope. Mirrors routes/users.ts realizedProfitMap.
 */
async function cryptoProfitMap(opts: { since?: Date; wallets?: string[] } = {}): Promise<Map<string, bigint>> {
  if (opts.wallets && opts.wallets.length === 0) return new Map();
  const conds: Prisma.Sql[] = [
    Prisma.sql`p.status::text IN (${Prisma.join(SETTLED)})`,
    Prisma.sql`p.pool_type = 'CRYPTO'`,
  ];
  if (opts.since) conds.push(Prisma.sql`p.end_time >= ${opts.since}`);
  if (opts.wallets) conds.push(Prisma.sql`b.wallet_address IN (${Prisma.join(opts.wallets)})`);
  const where = Prisma.join(conds, ' AND ');
  const rows = await prisma.$queryRaw<{ wallet: string; profit: string }[]>`
    SELECT b.wallet_address AS wallet,
           COALESCE(SUM(COALESCE(b.payout_amount, 0) - b.amount), 0)::text AS profit
    FROM bets b JOIN pools p ON p.id = b.pool_id
    WHERE ${where}
    GROUP BY b.wallet_address`;
  return new Map(rows.map((r) => [r.wallet, BigInt(r.profit)]));
}

function sortedBoard(map: Map<string, bigint>): [string, bigint][] {
  return [...map.entries()].sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0));
}

// ---------------------------------------------------------------------------
// POST /join — ensure the user + one-time auto-fund (1000 test USDC + SOL).
// ---------------------------------------------------------------------------
const joinSchema = z.object({ walletAddress: z.string().min(32).max(64) });

cryptoPredictionsRouter.post('/join', async (req, res) => {
  try {
    const did = await resolveEventDid(req);
    if (!did) return res.status(401).json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Sign in to play' } });
    const parsed = joinSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'walletAddress required' } });
    const { walletAddress } = parsed.data;
    try {
      if (!PublicKey.isOnCurve(new PublicKey(walletAddress))) throw new Error();
    } catch {
      return res.status(400).json({ success: false, error: { code: 'BAD_WALLET', message: 'Invalid Solana wallet address' } });
    }

    const user = await registerUser(walletAddress);
    let funded = false;

    // Optimistic lock: only the writer that flips autoFundedAt from null wins the mint,
    // so concurrent /join calls never double-fund.
    const lock = await prisma.user.updateMany({
      where: { walletAddress, autoFundedAt: null },
      data: { autoFundedAt: new Date() },
    });
    if (lock.count === 1) {
      try {
        await mintTestFunds(walletAddress);
        funded = true;
      } catch (e) {
        // Roll back the marker so the next load can retry.
        await prisma.user.updateMany({ where: { walletAddress }, data: { autoFundedAt: null } }).catch(() => {});
        console.error('[CryptoPredictions] auto-fund failed:', e instanceof Error ? e.message : e);
      }
    }

    res.json({ success: true, data: { funded, alreadyFunded: user.autoFundedAt != null } });
  } catch (error) {
    console.error('[CryptoPredictions] join error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to join' } });
  }
});

// ---------------------------------------------------------------------------
// GET /me?wallet= — realized + weekly PNL and weekly rank (balance/open PNL live on client).
// ---------------------------------------------------------------------------
cryptoPredictionsRouter.get('/me', async (req, res) => {
  try {
    const did = await resolveEventDid(req);
    if (!did) return res.status(401).json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Sign in' } });
    const wallet = typeof req.query.wallet === 'string' ? req.query.wallet : '';
    if (!wallet) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'wallet required' } });

    const ws = weekStartUtc();
    const [allTime, weeklyBoard] = await Promise.all([
      cryptoProfitMap({ wallets: [wallet] }),
      cryptoProfitMap({ since: ws }),
    ]);
    const ranked = sortedBoard(weeklyBoard);
    const idx = ranked.findIndex(([w]) => w === wallet);

    res.json({
      success: true,
      data: {
        realizedPnl: (allTime.get(wallet) ?? 0n).toString(),
        weeklyPnl: (weeklyBoard.get(wallet) ?? 0n).toString(),
        rank: idx >= 0 ? idx + 1 : null,
        players: ranked.length,
      },
    });
  } catch (error) {
    console.error('[CryptoPredictions] me error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to load' } });
  }
});

// ---------------------------------------------------------------------------
// GET /pools — the current bettable 5-min pool per asset (BTC/ETH/SOL).
// ---------------------------------------------------------------------------
cryptoPredictionsRouter.get('/pools', async (_req, res) => {
  try {
    const pools = await prisma.pool.findMany({
      where: { poolType: 'CRYPTO', interval: INTERVAL, asset: { in: ASSETS }, status: { in: [...BETTABLE] } },
      orderBy: { startTime: 'desc' },
      select: {
        id: true, poolId: true, asset: true, status: true, strikePrice: true,
        startTime: true, lockTime: true, endTime: true, totalUp: true, totalDown: true, durationSeconds: true,
      },
    });
    const byAsset = new Map<string, (typeof pools)[number]>();
    for (const p of pools) if (!byAsset.has(p.asset)) byAsset.set(p.asset, p);
    const data = ASSETS.map((a) => byAsset.get(a)).filter((p): p is (typeof pools)[number] => !!p).map((p) => ({
      id: p.id, poolId: p.poolId, asset: p.asset, status: p.status,
      strikePrice: p.strikePrice?.toString() ?? null,
      startTime: p.startTime, lockTime: p.lockTime, endTime: p.endTime,
      totalUp: p.totalUp.toString(), totalDown: p.totalDown.toString(), durationSeconds: p.durationSeconds,
    }));
    res.json({ success: true, data });
  } catch (error) {
    console.error('[CryptoPredictions] pools error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to load pools' } });
  }
});

// ---------------------------------------------------------------------------
// GET /leaderboard?window=week|all — weekly PNL board (default week).
// ---------------------------------------------------------------------------
cryptoPredictionsRouter.get('/leaderboard', async (req, res) => {
  try {
    const since = req.query.window === 'all' ? undefined : weekStartUtc();
    const board = sortedBoard(await cryptoProfitMap({ since })).slice(0, 100);
    const wallets = board.map(([w]) => w);
    const users = wallets.length
      ? await prisma.user.findMany({ where: { walletAddress: { in: wallets } }, select: { walletAddress: true, displayName: true, avatarUrl: true } })
      : [];
    const byWallet = new Map(users.map((u) => [u.walletAddress, u]));
    const data = board.map(([wallet, pnl], i) => ({
      rank: i + 1,
      walletAddress: wallet,
      displayName: byWallet.get(wallet)?.displayName ?? null,
      avatarUrl: byWallet.get(wallet)?.avatarUrl ?? null,
      pnl: pnl.toString(),
    }));
    res.json({ success: true, data, window: since ? 'week' : 'all' });
  } catch (error) {
    console.error('[CryptoPredictions] leaderboard error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to load leaderboard' } });
  }
});

cryptoPredictionsRouter.get('/health', (_req, res) => {
  res.json({ success: true, event: 'crypto-predictions' });
});
