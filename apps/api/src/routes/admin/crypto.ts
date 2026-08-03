import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';
import { prisma } from '../../db';
import { cryptoProfitMap, weekWindowStart } from '../crypto-predictions';
import { drawCryptoWeek } from '../../services/crypto-weekly';

/**
 * Crypto Predictions event admin — /api/admin/crypto (x-admin-key, back-office).
 * Participant list with anti-abuse flags + manual ban, and the weekly $100 prize
 * winner (top-1 realized PNL): draw → Telegram announce → pay manually → mark paid.
 */
export const adminCryptoRouter: RouterType = Router();

const BURST_MIN = Math.max(2, Number(process.env.CRYPTO_BURST_MIN ?? 4));
const BURST_WINDOW_MS = Math.max(1, Number(process.env.CRYPTO_BURST_WINDOW_MIN ?? 10)) * 60_000;

/** Event participants = anyone who joined the event (has a signup IP or was funded). */
async function eventUsers() {
  return prisma.user.findMany({
    where: { OR: [{ signupIp: { not: null } }, { autoFundedAt: { not: null } }] },
    select: { walletAddress: true, displayName: true, email: true, signupIp: true, banned: true, bannedAt: true, autoFundedAt: true, createdAt: true },
  });
}

/** Compute per-wallet suspicion flags: shared IP (≥2 accounts) + creation burst. */
function computeFlags(users: Awaited<ReturnType<typeof eventUsers>>) {
  const ipCount = new Map<string, number>();
  for (const u of users) if (u.signupIp) ipCount.set(u.signupIp, (ipCount.get(u.signupIp) ?? 0) + 1);

  const burst = new Set<string>();
  const sorted = [...users].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  let start = 0;
  for (let end = 0; end < sorted.length; end++) {
    while (sorted[end].createdAt.getTime() - sorted[start].createdAt.getTime() > BURST_WINDOW_MS) start++;
    if (end - start + 1 >= BURST_MIN) for (let k = start; k <= end; k++) burst.add(sorted[k].walletAddress);
  }

  const flagsOf = (u: (typeof users)[number]): string[] => {
    const f: string[] = [];
    if (u.signupIp && (ipCount.get(u.signupIp) ?? 0) >= 2) f.push('shared-ip');
    if (burst.has(u.walletAddress)) f.push('burst');
    return f;
  };
  return flagsOf;
}

// GET / — overview counts.
adminCryptoRouter.get('/', async (_req, res) => {
  try {
    const [users, funded, banned, bets] = await Promise.all([
      prisma.user.count({ where: { OR: [{ signupIp: { not: null } }, { autoFundedAt: { not: null } }] } }),
      prisma.user.count({ where: { autoFundedAt: { not: null } } }),
      prisma.user.count({ where: { banned: true } }),
      prisma.bet.count({ where: { pool: { poolType: 'CRYPTO' } } }),
    ]);
    const weekly = (await cryptoProfitMap({ since: weekWindowStart() })).size;
    res.json({ success: true, data: { users, funded, banned, bets, weeklyParticipants: weekly } });
  } catch (e) {
    console.error('[AdminCrypto] overview error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to load overview' } });
  }
});

// GET /users?offset&limit&search&flaggedOnly — participants + flags, paginated.
adminCryptoRouter.get('/users', async (req, res) => {
  try {
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const search = (typeof req.query.search === 'string' ? req.query.search : '').trim().toLowerCase();
    const flaggedOnly = req.query.flaggedOnly === 'true';

    const users = await eventUsers();
    const flagsOf = computeFlags(users);
    const betRows = await prisma.bet.groupBy({ by: ['walletAddress'], where: { pool: { poolType: 'CRYPTO' } }, _count: { _all: true } });
    const betCount = new Map(betRows.map((r) => [r.walletAddress, r._count._all]));

    let rows = users.map((u) => ({
      walletAddress: u.walletAddress,
      displayName: u.displayName,
      email: u.email,
      signupIp: u.signupIp,
      banned: u.banned,
      funded: u.autoFundedAt != null,
      createdAt: u.createdAt.toISOString(),
      bets: betCount.get(u.walletAddress) ?? 0,
      flags: flagsOf(u),
    }));

    if (search) rows = rows.filter((r) => r.walletAddress.toLowerCase().includes(search) || (r.email ?? '').toLowerCase().includes(search) || (r.displayName ?? '').toLowerCase().includes(search) || (r.signupIp ?? '').toLowerCase().includes(search));
    if (flaggedOnly) rows = rows.filter((r) => r.flags.length > 0 || r.banned);
    rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

    res.json({ success: true, data: rows.slice(offset, offset + limit), total: rows.length });
  } catch (e) {
    console.error('[AdminCrypto] users error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to load users' } });
  }
});

// POST /user/:wallet/ban — toggle the manual ban.
const banSchema = z.object({ banned: z.boolean() });
adminCryptoRouter.post('/user/:wallet/ban', async (req, res) => {
  try {
    const parsed = banSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'banned required' } });
    const wallet = req.params.wallet;
    const updated = await prisma.user.updateMany({ where: { walletAddress: wallet }, data: { banned: parsed.data.banned, bannedAt: parsed.data.banned ? new Date() : null } });
    if (updated.count === 0) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
    res.json({ success: true, data: { walletAddress: wallet, banned: parsed.data.banned } });
  } catch (e) {
    console.error('[AdminCrypto] ban error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update ban' } });
  }
});

// GET /winners — weekly winners, newest first.
adminCryptoRouter.get('/winners', async (_req, res) => {
  try {
    const rows = await prisma.cryptoEventWinner.findMany({ orderBy: { weekStart: 'desc' }, take: 52 });
    res.json({ success: true, data: rows.map((w) => ({ id: w.id, weekStart: w.weekStart.toISOString(), walletAddress: w.walletAddress, displayName: w.displayName, email: w.email, payoutWallet: w.payoutWallet, pnl: w.pnl.toString(), paid: w.paid, paidAt: w.paidAt?.toISOString() ?? null, paidTx: w.paidTx })) });
  } catch (e) {
    console.error('[AdminCrypto] winners error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to load winners' } });
  }
});

// POST /draw — snapshot the top-1 winner for a week (default current) + announce.
const drawSchema = z.object({ weekStart: z.string().optional() });
adminCryptoRouter.post('/draw', async (req, res) => {
  try {
    const parsed = drawSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input' } });
    const ws = parsed.data.weekStart ? new Date(parsed.data.weekStart) : new Date();
    if (Number.isNaN(ws.getTime())) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid weekStart' } });

    const { winner, note } = await drawCryptoWeek(ws);
    res.json({ success: true, data: { winner, note } });
  } catch (e) {
    console.error('[AdminCrypto] draw error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to draw winner' } });
  }
});

// POST /winner/:id/paid — mark a winner paid/unpaid (manual payout + tx).
const paidSchema = z.object({ paid: z.boolean(), tx: z.string().max(120).optional() });
adminCryptoRouter.post('/winner/:id/paid', async (req, res) => {
  try {
    const parsed = paidSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input' } });
    const { paid, tx } = parsed.data;
    const updated = await prisma.cryptoEventWinner.update({
      where: { id: req.params.id },
      data: { paid, paidAt: paid ? new Date() : null, paidTx: paid ? (tx ?? null) : null },
    }).catch(() => null);
    if (!updated) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Winner not found' } });
    res.json({ success: true, data: { id: updated.id, paid: updated.paid } });
  } catch (e) {
    console.error('[AdminCrypto] paid error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update' } });
  }
});
