import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';
import {
  getWorldCupAdminOverview,
  getWorldCupContestUsers,
  getWorldCupMatchDetail,
  saveWorldCupResult,
  runWorldCupRaffle,
  askWorldCupResultLlm,
  setWorldCupWinnerPaid,
} from '../../services/worldcup-admin';

/** Admin: grade World Cup predictions + raffle winners. */
export const adminWorldCupRouter: RouterType = Router();

/** GET /api/admin/worldcup — overview of all matches (predictions, result, winners). */
adminWorldCupRouter.get('/', async (_req, res) => {
  try {
    res.json({ success: true, data: await getWorldCupAdminOverview() });
  } catch (error) {
    console.error('[Admin WorldCup] overview error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to load overview' } });
  }
});

/** GET /api/admin/worldcup/users — all contest signups (join date + pick count). */
adminWorldCupRouter.get('/users', async (_req, res) => {
  try {
    res.json({ success: true, data: await getWorldCupContestUsers() });
  } catch (error) {
    console.error('[Admin WorldCup] users error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to load contest users' } });
  }
});

/** GET /api/admin/worldcup/match/:matchId — predictions + grading + result for one match. */
adminWorldCupRouter.get('/match/:matchId', async (req, res) => {
  try {
    res.json({ success: true, data: await getWorldCupMatchDetail(req.params.matchId) });
  } catch (error) {
    console.error('[Admin WorldCup] detail error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to load match' } });
  }
});

const resultSchema = z.object({
  homeScore: z.coerce.number().int().min(0).max(30),
  awayScore: z.coerce.number().int().min(0).max(30),
  phase: z.enum(['REGULATION', 'EXTRA_TIME', 'PENALTIES']),
  homePens: z.coerce.number().int().min(0).max(30).nullish(),
  awayPens: z.coerce.number().int().min(0).max(30).nullish(),
});

/** POST /api/admin/worldcup/match/:matchId/result — set the official result (grades picks). */
adminWorldCupRouter.post('/match/:matchId/result', async (req, res) => {
  try {
    const parsed = resultSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0]?.message ?? 'Invalid input' } });
    }
    const { homeScore, awayScore, phase, homePens, awayPens } = parsed.data;
    await saveWorldCupResult(req.params.matchId, homeScore, awayScore, phase, homePens, awayPens);
    res.json({ success: true, data: await getWorldCupMatchDetail(req.params.matchId) });
  } catch (error) {
    console.error('[Admin WorldCup] save result error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to save result' } });
  }
});

/** POST /api/admin/worldcup/match/:matchId/ask-llm — ChatGPT web-search suggestion (no save). */
adminWorldCupRouter.post('/match/:matchId/ask-llm', async (req, res) => {
  try {
    res.json({ success: true, data: await askWorldCupResultLlm(req.params.matchId) });
  } catch (error) {
    console.error('[Admin WorldCup] ask-llm error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'ChatGPT lookup failed' } });
  }
});

const paidSchema = z.object({
  paid: z.boolean(),
  paidTx: z.string().max(120).nullish(),
});

/** POST /api/admin/worldcup/match/:matchId/winner/:contestUserId/paid — mark a winner's prize paid/unpaid. */
adminWorldCupRouter.post('/match/:matchId/winner/:contestUserId/paid', async (req, res) => {
  try {
    const parsed = paidSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0]?.message ?? 'Invalid input' } });
    }
    const result = await setWorldCupWinnerPaid(req.params.matchId, req.params.contestUserId, parsed.data.paid, parsed.data.paidTx);
    if (!result.ok) {
      return res.status(404).json({ success: false, error: { code: 'NOT_A_WINNER', message: 'No winner row for this match + user' } });
    }
    res.json({ success: true, data: await getWorldCupMatchDetail(req.params.matchId) });
  } catch (error) {
    console.error('[Admin WorldCup] mark-paid error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update payout status' } });
  }
});

/** POST /api/admin/worldcup/match/:matchId/raffle — raffle 2 winners among correct picks. */
adminWorldCupRouter.post('/match/:matchId/raffle', async (req, res) => {
  try {
    const result = await runWorldCupRaffle(req.params.matchId);
    if (!result.ok) {
      const msg = result.reason === 'NO_RESULT' ? 'Set the official result first' : 'No correct predictions to raffle';
      return res.status(409).json({ success: false, error: { code: result.reason, message: msg } });
    }
    res.json({ success: true, data: { winners: result.winners } });
  } catch (error) {
    console.error('[Admin WorldCup] raffle error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to run raffle' } });
  }
});
