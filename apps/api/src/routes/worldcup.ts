import { Router, type Router as RouterType, type Request } from 'express';
import { z } from 'zod';
import { PublicKey } from '@solana/web3.js';
import { prisma } from '../db';
import { getWorldCupMatches, getWorldCupTimeline } from '../services/worldcup';
import { verifyPrivyDid, bearerToken } from '../services/worldcup-auth';

/** Public World Cup predictions endpoints (free-to-play). */
export const worldcupRouter: RouterType = Router();

/** GET /api/worldcup/matches — FWC fixtures + live scores for the predictions page. */
worldcupRouter.get('/matches', async (_req, res) => {
  try {
    const matches = await getWorldCupMatches();
    res.json({ success: true, data: matches });
  } catch (error) {
    console.error('[WorldCup] matches error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to load matches' } });
  }
});

/** GET /api/worldcup/match/:matchId/timeline — goals (scorer + minute) for a match. */
worldcupRouter.get('/match/:matchId/timeline', async (req, res) => {
  try {
    res.json({ success: true, data: await getWorldCupTimeline(req.params.matchId) });
  } catch (error) {
    console.error('[WorldCup] timeline error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to load goals' } });
  }
});

const identitySchema = z
  .object({
    provider: z.string().max(20).optional(),
    xHandle: z.string().max(50).optional(),
    email: z.string().max(200).optional(),
    displayName: z.string().max(100).optional(),
  })
  .optional();

/**
 * Verify the Privy token and upsert the ContestUser (identity is best-effort from
 * the client — used to contact promo winners; the verified DID is the anti-abuse
 * anchor). Returns the ContestUser id, or null if unauthenticated.
 */
async function resolveContestUser(req: Request): Promise<string | null> {
  const did = await verifyPrivyDid(bearerToken(req.headers.authorization));
  if (!did) return null;
  const idn = (req.body?.identity ?? {}) as z.infer<typeof identitySchema> & object;
  const user = await prisma.contestUser.upsert({
    where: { privyDid: did },
    update: {
      ...(idn?.provider ? { provider: idn.provider } : {}),
      ...(idn?.xHandle ? { xHandle: idn.xHandle } : {}),
      ...(idn?.email ? { email: idn.email } : {}),
      ...(idn?.displayName ? { displayName: idn.displayName } : {}),
    },
    create: {
      privyDid: did,
      provider: idn?.provider ?? null,
      xHandle: idn?.xHandle ?? null,
      email: idn?.email ?? null,
      displayName: idn?.displayName ?? null,
    },
    select: { id: true },
  });
  return user.id;
}

/** GET /api/worldcup/predictions — the signed-in user's predictions. */
worldcupRouter.get('/predictions', async (req, res) => {
  try {
    const userId = await resolveContestUser(req);
    if (!userId) return res.status(401).json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Sign in to view your predictions' } });
    const preds = await prisma.worldCupPrediction.findMany({ where: { contestUserId: userId }, orderBy: { updatedAt: 'desc' } });
    res.json({ success: true, data: preds.map((p) => ({ matchId: p.matchId, homeScore: p.homeScore, awayScore: p.awayScore, phase: p.phase })) });
  } catch (error) {
    console.error('[WorldCup] get predictions error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to load predictions' } });
  }
});

const predictionSchema = z.object({
  matchId: z.string().min(1).max(40),
  homeScore: z.coerce.number().int().min(0).max(30),
  awayScore: z.coerce.number().int().min(0).max(30),
  phase: z.enum(['REGULATION', 'EXTRA_TIME', 'PENALTIES']),
  identity: identitySchema,
});

/** POST /api/worldcup/predictions — upsert a prediction (locked once the match starts). */
worldcupRouter.post('/predictions', async (req, res) => {
  try {
    const parsed = predictionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0]?.message ?? 'Invalid input' } });
    }
    const userId = await resolveContestUser(req);
    if (!userId) return res.status(401).json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Sign in to predict' } });

    const { matchId, homeScore, awayScore, phase } = parsed.data;

    // Lock once the match is live/finished. Rely on the classified status (which trusts SDB's
    // NS flag + the live-score overlay) rather than the stored kickoff time, which can be off.
    const match = (await getWorldCupMatches()).find((m) => m.matchId === matchId);
    if (!match) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Match not found' } });
    if (match.status !== 'SCHEDULED') return res.status(409).json({ success: false, error: { code: 'LOCKED', message: 'Predictions are closed — the match has started' } });

    await prisma.worldCupPrediction.upsert({
      where: { contestUserId_matchId: { contestUserId: userId, matchId } },
      update: { homeScore, awayScore, phase },
      create: { contestUserId: userId, matchId, homeScore, awayScore, phase },
    });
    res.json({ success: true, data: { matchId, homeScore, awayScore, phase } });
  } catch (error) {
    console.error('[WorldCup] post prediction error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to save prediction' } });
  }
});

/**
 * GET /api/worldcup/my-winnings — raffle prizes the signed-in user has won, with
 * their claim status. Backs the in-app "you won, enter your wallet" banner.
 */
worldcupRouter.get('/my-winnings', async (req, res) => {
  try {
    const userId = await resolveContestUser(req);
    if (!userId) return res.status(401).json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Sign in to view your prizes' } });

    const wins = await prisma.worldCupWinner.findMany({ where: { contestUserId: userId }, orderBy: { createdAt: 'desc' } });
    if (wins.length === 0) return res.json({ success: true, data: [] });

    // Match labels (home/away) come from the live fixture list, matched by id.
    const matches = await getWorldCupMatches();
    const byId = new Map(matches.map((m) => [m.matchId, m]));

    res.json({
      success: true,
      data: wins.map((w) => {
        const m = byId.get(w.matchId);
        return {
          matchId: w.matchId,
          homeTeam: m?.homeTeam ?? null,
          awayTeam: m?.awayTeam ?? null,
          round: m?.round ?? null,
          claimed: w.claimedAt != null,
          payoutWallet: w.payoutWallet,
        };
      }),
    });
  } catch (error) {
    console.error('[WorldCup] my-winnings error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to load prizes' } });
  }
});

const claimSchema = z.object({
  payoutWallet: z.string().trim().min(32).max(50),
  identity: identitySchema,
});

/**
 * POST /api/worldcup/winnings/:matchId/claim — the winner submits the Solana
 * address to receive their prize. Idempotent: re-submitting updates the wallet as
 * long as it hasn't been paid out yet (paidTx still null).
 */
worldcupRouter.post('/winnings/:matchId/claim', async (req, res) => {
  try {
    const parsed = claimSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0]?.message ?? 'Invalid input' } });
    }
    const userId = await resolveContestUser(req);
    if (!userId) return res.status(401).json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Sign in to claim' } });

    const { payoutWallet } = parsed.data;
    // Reject anything that isn't a valid Solana address before we store it.
    try {
      // eslint-disable-next-line no-new
      new PublicKey(payoutWallet);
    } catch {
      return res.status(400).json({ success: false, error: { code: 'INVALID_WALLET', message: 'That is not a valid Solana address' } });
    }

    const win = await prisma.worldCupWinner.findUnique({
      where: { matchId_contestUserId: { matchId: req.params.matchId, contestUserId: userId } },
    });
    if (!win) return res.status(404).json({ success: false, error: { code: 'NOT_A_WINNER', message: 'No prize to claim for this match' } });
    if (win.paidTx) return res.status(409).json({ success: false, error: { code: 'ALREADY_PAID', message: 'This prize has already been paid out' } });

    await prisma.worldCupWinner.update({
      where: { id: win.id },
      data: { payoutWallet, claimedAt: win.claimedAt ?? new Date() },
    });
    res.json({ success: true, data: { matchId: req.params.matchId, payoutWallet, claimed: true } });
  } catch (error) {
    console.error('[WorldCup] claim error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to submit claim' } });
  }
});
