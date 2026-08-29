import type { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';

/**
 * Per-IP rate limits.
 *
 * The API had none anywhere except the hand-rolled bucket inside admin-auth, so
 * credential stuffing, faucet draining and DB-write floods were all free and
 * unbounded. These are deliberately generous: the goal is to stop scripted abuse
 * without tripping a normal user on a polling UI.
 *
 * Counting is per IP, so it only means anything because `trust proxy` is now `1`
 * rather than `true` (see index.ts). While the whole forwarded chain was trusted
 * any client could forge req.ip and walk straight through these.
 *
 * RATE_LIMIT=off disables every limiter, for a local load test or an emergency.
 */
const DISABLED = (process.env.RATE_LIMIT || '').trim().toLowerCase() === 'off';

if (DISABLED) {
  console.warn('[rate-limit] DISABLED via RATE_LIMIT=off');
}

const passthrough = (_req: Request, _res: Response, next: NextFunction) => next();

function make(windowMs: number, limit: number, label: string) {
  if (DISABLED) return passthrough;
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res) => {
      console.warn(`[rate-limit] ${label} hit  ip=${req.ip}  path=${req.originalUrl}`);
      res.status(429).json({
        success: false,
        error: { code: 'RATE_LIMITED', message: 'Too many requests, slow down.' },
      });
    },
  });
}

/**
 * Everything under /api. 600/min is ~10 req/s, well above what the markets UI
 * polls at, so it only catches a script hammering the API.
 */
export const publicLimiter = make(60_000, 600, 'public');

/**
 * Routes that move money or rotate keys (/api/transactions, /api/exchange).
 * A human places a handful of orders a minute; 60 leaves plenty of headroom for
 * the terminal's polling while making a drain script slow and loud in the logs.
 */
export const moneyLimiter = make(60_000, 60, 'money');

/**
 * The faucet spends the authority's SOL and inserts a User row per call, and its
 * only other guard is per-wallet, which is free to defeat by generating fresh
 * keypairs. This is the one that stops that being a tap.
 */
export const faucetLimiter = make(60 * 60_000, 5, 'faucet');
