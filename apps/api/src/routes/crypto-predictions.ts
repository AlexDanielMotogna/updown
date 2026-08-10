import { Router, type Router as RouterType, type Request } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { PublicKey } from '@solana/web3.js';
import { prisma } from '../db';
import { verifyPrivyDid, bearerToken } from '../services/worldcup-auth';
import { registerUser } from '../services/rewards';
import { mintTestFunds, TestFundsCapError } from '../services/test-funds';
import { acceptReferral, ensureReferralCode, getReferralLeaderboard } from '../services/referrals';
import { ACTIVE_BET_THRESHOLD } from '../utils/testing';

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

/** Anti-abuse: max funded accounts allowed per signup IP (extras register but aren't funded). */
const MAX_FUNDED_PER_IP = Math.max(1, Number(process.env.CRYPTO_MAX_ACCOUNTS_PER_IP ?? 3));

/** Weekly prize labels (shared by the winner popup + Telegram). Overridable via env. */
const PREDICTION_PRIZE_LABEL = process.env.CRYPTO_PREDICTION_PRIZE_LABEL ?? '$100';
const REFERRAL_PRIZE_LABEL = process.env.CRYPTO_REFERRAL_PRIZE_LABEL ?? '$50';
const usdFromLabel = (s: string) => Number(s.replace(/[^0-9.]/g, '')) || 0;

/** The referral prize is only awarded once at least this many DISTINCT referrers
 *  have referred real players (valid referrals) that week. Prevents crowning a
 *  winner on trivial participation. Overridable via env. */
export const REFERRAL_MIN_REFERRERS = Math.max(1, Number(process.env.CRYPTO_REFERRAL_MIN_REFERRERS ?? 10));

/** The weekly PNL prize is only awarded once at least this many distinct players
 *  are on the board that week. Overridable via env. */
export const PREDICTION_MIN_PLAYERS = Math.max(1, Number(process.env.CRYPTO_PREDICTION_MIN_PLAYERS ?? 50));

/** Real client IP (Express `trust proxy` is on, so req.ip is the X-Forwarded-For client). */
function clientIp(req: Request): string | null {
  return req.ip ?? null;
}

/** Verify the Privy token → the user's DID (auth anchor). Null if unauthenticated. */
export async function resolveEventDid(req: Request): Promise<string | null> {
  return verifyPrivyDid(bearerToken(req.headers.authorization));
}

/** Start of the current week (Monday 00:00 UTC) — the weekly leaderboard window. */
export function weekStartUtc(now = new Date()): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dow = d.getUTCDay(); // 0=Sun..6=Sat
  d.setUTCDate(d.getUTCDate() - (dow === 0 ? 6 : dow - 1));
  return d;
}

/**
 * Event launch epoch. On the launch week the leaderboard starts here instead of
 * the Monday 00:00 UTC boundary, so pre-launch bot/test activity doesn't seed the
 * board with PNL. It only affects the week that contains the epoch; every later
 * week uses the normal Monday boundary (max() below picks the Monday). Overridable
 * via CRYPTO_LAUNCH_EPOCH; default is the crypto event's public launch moment.
 */
export const CRYPTO_LAUNCH_EPOCH = new Date(process.env.CRYPTO_LAUNCH_EPOCH ?? '2026-08-03T08:00:00.000Z');

/** Lower bound of the weekly window: the later of this week's Monday and the launch epoch. */
export function weekWindowStart(now = new Date()): Date {
  const ws = weekStartUtc(now);
  return CRYPTO_LAUNCH_EPOCH > ws ? CRYPTO_LAUNCH_EPOCH : ws;
}

/**
 * Realized PNL (Σ payout − stake) over settled CRYPTO pools. Optional week window
 * (`since` = pool end_time) and wallet scope. Mirrors routes/users.ts realizedProfitMap.
 */
export async function cryptoProfitMap(opts: { since?: Date; until?: Date; wallets?: string[] } = {}): Promise<Map<string, bigint>> {
  if (opts.wallets && opts.wallets.length === 0) return new Map();
  const conds: Prisma.Sql[] = [
    Prisma.sql`p.status::text IN (${Prisma.join(SETTLED)})`,
    Prisma.sql`p.pool_type = 'CRYPTO'`,
    // Exclude pools mid-settlement: a RESOLVED/CLAIMABLE pool becomes "settled"
    // the instant it resolves, but the winners' payout_amount is stamped a few
    // seconds later by the async auto-claim. In that gap winners read as a full
    // stake loss, so the board flickers through a wrong "everyone lost" state.
    // Only count a pool once every winning-side bet is paid (or permanently
    // failed) — the pool then appears atomically with correct PNL.
    Prisma.sql`NOT EXISTS (SELECT 1 FROM bets w WHERE w.pool_id = p.id AND w.side = p.winner AND w.claimed = false AND w.payout_failed = false)`,
    // Banned accounts never appear on the board or get drawn as winners.
    Prisma.sql`NOT EXISTS (SELECT 1 FROM users u WHERE u.wallet_address = b.wallet_address AND u.banned = true)`,
  ];
  if (opts.since) conds.push(Prisma.sql`p.end_time >= ${opts.since}`);
  if (opts.until) conds.push(Prisma.sql`p.end_time < ${opts.until}`);
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
const joinSchema = z.object({
  walletAddress: z.string().min(32).max(64),
  email: z.string().email().max(200).optional(),
  ref: z.string().min(4).max(32).optional(), // referral code from ?ref= on the invite link
});

cryptoPredictionsRouter.post('/join', async (req, res) => {
  try {
    const did = await resolveEventDid(req);
    if (!did) return res.status(401).json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Sign in to play' } });
    const parsed = joinSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'walletAddress required' } });
    const { walletAddress, email, ref } = parsed.data;
    try {
      if (!PublicKey.isOnCurve(new PublicKey(walletAddress))) throw new Error();
    } catch {
      return res.status(400).json({ success: false, error: { code: 'BAD_WALLET', message: 'Invalid Solana wallet address' } });
    }

    await registerUser(walletAddress);
    const ip = clientIp(req);

    // Current anti-abuse state + record signup IP / contact email on first sight.
    const u = await prisma.user.findUnique({ where: { walletAddress }, select: { banned: true, signupIp: true, email: true, autoFundedAt: true } });
    if (u?.banned) return res.status(403).json({ success: false, error: { code: 'BANNED', message: 'This account is banned from the event.' } });

    const patch: { signupIp?: string; email?: string } = {};
    if (ip && !u?.signupIp) patch.signupIp = ip;
    if (email && !u?.email) patch.email = email;
    if (Object.keys(patch).length) await prisma.user.update({ where: { walletAddress }, data: patch }).catch(() => {});

    // Link the referral (event-native: NO UP/XP granted — grantRewards:false). The
    // referred user only counts once funded + active, and the anti-cheat still flags
    // shared IP/device. Best-effort: a bad code never blocks joining.
    if (ref) {
      await acceptReferral(walletAddress, ref, { ip, deviceFingerprint: null }, { grantRewards: false }).catch(() => {});
    }

    // Per-IP funding cap: extra accounts from the same network register but don't get funded.
    let accountsFromIp = 0;
    let blockedByIp = false;
    if (ip) {
      accountsFromIp = await prisma.user.count({ where: { signupIp: ip, walletAddress: { not: walletAddress }, autoFundedAt: { not: null } } });
      blockedByIp = accountsFromIp >= MAX_FUNDED_PER_IP;
    }

    let funded = false;
    if (!blockedByIp) {
      // mintTestFunds enforces the hard one-time 1000 cap internally (atomic claim +
      // on-chain balance guard), so concurrent /join calls never double-fund and a
      // wallet can never mint more than 1000. A TestFundsCapError just means it was
      // already funded — not an error worth logging.
      try {
        await mintTestFunds(walletAddress);
        funded = true;
      } catch (e) {
        if (!(e instanceof TestFundsCapError)) {
          console.error('[CryptoPredictions] auto-fund failed:', e instanceof Error ? e.message : e);
        }
      }
    }

    res.json({ success: true, data: { funded, alreadyFunded: u?.autoFundedAt != null, blockedByIp, accountsFromIp } });
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

    const ws = weekWindowStart();
    const [allTime, weeklyBoard, self, predWin, refWin] = await Promise.all([
      cryptoProfitMap({ wallets: [wallet] }),
      cryptoProfitMap({ since: ws }),
      prisma.user.findUnique({ where: { walletAddress: wallet }, select: { banned: true } }),
      prisma.cryptoEventWinner.findFirst({ where: { walletAddress: wallet, paid: false }, orderBy: { weekStart: 'desc' } }),
      prisma.cryptoReferralWinner.findFirst({ where: { walletAddress: wallet, paid: false }, orderBy: { weekStart: 'desc' } }),
    ]);
    const ranked = sortedBoard(weeklyBoard);
    const idx = ranked.findIndex(([w]) => w === wallet);

    // Unified winner popup: any unpaid prize (prediction and/or referral) makes the
    // user submit a payout wallet through the SAME dialog — like the WorldCup claim.
    const prizes: Array<Record<string, unknown>> = [];
    if (predWin) prizes.push({ kind: 'prediction', label: PREDICTION_PRIZE_LABEL, amountUsd: usdFromLabel(PREDICTION_PRIZE_LABEL), pnl: predWin.pnl.toString() });
    if (refWin) prizes.push({ kind: 'referral', label: REFERRAL_PRIZE_LABEL, amountUsd: usdFromLabel(REFERRAL_PRIZE_LABEL), validReferrals: refWin.validReferrals });
    const totalUsd = prizes.reduce((s, p) => s + (p.amountUsd as number), 0);
    const win = prizes.length > 0
      ? {
          weekStart: (predWin ?? refWin)!.weekStart.toISOString(),
          paid: false,
          payoutWallet: predWin?.payoutWallet ?? refWin?.payoutWallet ?? null,
          pnl: predWin?.pnl.toString() ?? '0', // back-compat
          prizes,
          totalUsd,
          totalLabel: `$${totalUsd}`,
        }
      : null;

    res.json({
      success: true,
      data: {
        realizedPnl: (allTime.get(wallet) ?? 0n).toString(),
        weeklyPnl: (weeklyBoard.get(wallet) ?? 0n).toString(),
        rank: idx >= 0 ? idx + 1 : null,
        players: ranked.length,
        banned: self?.banned ?? false,
        win,
      },
    });
  } catch (error) {
    console.error('[CryptoPredictions] me error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to load' } });
  }
});

// ---------------------------------------------------------------------------
// POST /claim — winner submits the wallet where they want the $100 prize sent.
// ---------------------------------------------------------------------------
const claimSchema = z.object({ walletAddress: z.string().min(32).max(64), payoutWallet: z.string().min(32).max(64) });

cryptoPredictionsRouter.post('/claim', async (req, res) => {
  try {
    const did = await resolveEventDid(req);
    if (!did) return res.status(401).json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Sign in' } });
    const parsed = claimSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'walletAddress + payoutWallet required' } });
    const { walletAddress, payoutWallet } = parsed.data;
    try {
      if (!PublicKey.isOnCurve(new PublicKey(payoutWallet))) throw new Error();
    } catch {
      return res.status(400).json({ success: false, error: { code: 'BAD_WALLET', message: 'Invalid Solana wallet address' } });
    }

    // Attach the payout wallet to this player's most recent unpaid prize(s) — both
    // the prediction ($100) and the referral ($50) winner, so one submission covers
    // whichever they won that week.
    const [predWin, refWin] = await Promise.all([
      prisma.cryptoEventWinner.findFirst({ where: { walletAddress, paid: false }, orderBy: { weekStart: 'desc' } }),
      prisma.cryptoReferralWinner.findFirst({ where: { walletAddress, paid: false }, orderBy: { weekStart: 'desc' } }),
    ]);
    if (!predWin && !refWin) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'No prize to claim' } });
    await Promise.all([
      predWin ? prisma.cryptoEventWinner.update({ where: { id: predWin.id }, data: { payoutWallet } }) : null,
      refWin ? prisma.cryptoReferralWinner.update({ where: { id: refWin.id }, data: { payoutWallet } }) : null,
    ]);
    res.json({ success: true, data: { payoutWallet } });
  } catch (error) {
    console.error('[CryptoPredictions] claim error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to submit wallet' } });
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
    const since = req.query.window === 'all' ? undefined : weekWindowStart();
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
    res.json({
      success: true,
      data,
      window: since ? 'week' : 'all',
      players: board.length,
      minPlayers: PREDICTION_MIN_PLAYERS,
      prizeActive: board.length >= PREDICTION_MIN_PLAYERS,
    });
  } catch (error) {
    console.error('[CryptoPredictions] leaderboard error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to load leaderboard' } });
  }
});

// ---------------------------------------------------------------------------
// GET /referrals?wallet= — event-native referral: my invite link + weekly board.
// ---------------------------------------------------------------------------
const EVENT_URL = process.env.CRYPTO_EVENT_URL ?? 'https://updown.my/crypto-predictions';

cryptoPredictionsRouter.get('/referrals', async (req, res) => {
  try {
    const did = await resolveEventDid(req);
    if (!did) return res.status(401).json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Sign in' } });
    const wallet = typeof req.query.wallet === 'string' ? req.query.wallet : '';
    if (!wallet) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'wallet required' } });

    const [code, board] = await Promise.all([
      ensureReferralCode(wallet),
      getReferralLeaderboard({ since: weekWindowStart() }),
    ]);
    const top = board.slice(0, 20).map((r) => ({ rank: r.rank, walletAddress: r.walletAddress, displayName: r.displayName, validReferrals: r.validReferrals }));
    const mine = board.find((r) => r.walletAddress === wallet);
    // Prize only activates once ≥ REFERRAL_MIN_REFERRERS distinct referrers have valid referrals.
    const activeReferrers = board.filter((r) => r.validReferrals > 0).length;

    res.json({
      success: true,
      data: {
        code,
        link: `${EVENT_URL}?ref=${code}`,
        prizeLabel: REFERRAL_PRIZE_LABEL,
        activeThreshold: ACTIVE_BET_THRESHOLD, // referred user needs this many bets to count
        myValidReferrals: mine?.validReferrals ?? 0,
        myTotalReferrals: mine?.totalReferrals ?? 0,
        myRank: mine?.rank ?? null,
        board: top,
        minReferrers: REFERRAL_MIN_REFERRERS,
        activeReferrers,
        prizeActive: activeReferrers >= REFERRAL_MIN_REFERRERS,
      },
    });
  } catch (error) {
    console.error('[CryptoPredictions] referrals error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to load referrals' } });
  }
});

// ---------------------------------------------------------------------------
// GET /activity — recent bets across the crypto pools (Live Activity feed).
// ---------------------------------------------------------------------------
cryptoPredictionsRouter.get('/activity', async (_req, res) => {
  try {
    const rows = await prisma.bet.findMany({
      where: { pool: { poolType: 'CRYPTO' } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { walletAddress: true, side: true, amount: true, createdAt: true, pool: { select: { asset: true } } },
    });
    const data = rows.map((b) => ({
      walletAddress: b.walletAddress,
      side: b.side,
      asset: b.pool.asset,
      amount: b.amount.toString(),
      createdAt: b.createdAt,
    }));
    res.json({ success: true, data });
  } catch (error) {
    console.error('[CryptoPredictions] activity error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to load activity' } });
  }
});

cryptoPredictionsRouter.get('/health', (_req, res) => {
  res.json({ success: true, event: 'crypto-predictions' });
});
