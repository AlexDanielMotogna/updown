import { Router, type Router as RouterType, type Request } from 'express';
import { verifyPrivyDid, bearerToken } from '../services/worldcup-auth';

/**
 * Crypto Predictions event — public API (Privy-authed), mounted at
 * /api/crypto-predictions. Same on-chain mechanic as the main app, crypto-only,
 * with auto-funded users and a weekly PNL leaderboard. Endpoints are filled in P1
 * (join/auto-fund, me, pools, leaderboard). See docs/PLAN-CRYPTO-PREDICTIONS.md.
 */
export const cryptoPredictionsRouter: RouterType = Router();

/** Verify the Privy token → the user's DID (auth anchor). Null if unauthenticated. */
export async function resolveEventDid(req: Request): Promise<string | null> {
  return verifyPrivyDid(bearerToken(req.headers.authorization));
}

cryptoPredictionsRouter.get('/health', (_req, res) => {
  res.json({ success: true, event: 'crypto-predictions' });
});
