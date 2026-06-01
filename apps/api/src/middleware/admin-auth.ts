import { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'crypto';

/**
 * Admin auth middleware. Verifies the `x-admin-key` header against
 * `process.env.ADMIN_API_KEY` using a constant-time comparison to avoid
 * timing-attack leaks, and rate-limits per-IP attempts so the key can't be
 * brute-forced at network speed. Failed attempts are logged to stderr
 * (without the provided key) so a sustained attack surfaces in the API logs.
 *
 * See PLAN-ADMIN-REFACTOR.md Phase 1 #11-14, #17.
 */

// Per-IP attempt tracking. In-memory is fine: admin has a small operator
// surface and the API is a single process per environment. If we ever
// horizontal-scale the API, replace with a Redis-backed bucket.
const RATE_WINDOW_MS = 15 * 60_000;  // 15 min
const RATE_MAX_ATTEMPTS = 20;        // total per window, success or fail
const FAIL_MAX_PER_WINDOW = 5;        // FAILED-only sub-limit per window

interface AttemptBucket {
  total: number;
  fails: number;
  windowStartedAt: number;
}
const buckets = new Map<string, AttemptBucket>();

function getBucket(ip: string): AttemptBucket {
  const now = Date.now();
  const existing = buckets.get(ip);
  if (!existing || now - existing.windowStartedAt > RATE_WINDOW_MS) {
    const fresh: AttemptBucket = { total: 0, fails: 0, windowStartedAt: now };
    buckets.set(ip, fresh);
    return fresh;
  }
  return existing;
}

// Periodically prune buckets whose window has elapsed, so a bot scanning IPs
// at random can't bloat the Map indefinitely. Runs every 5 min, idempotent.
const PRUNE_INTERVAL_MS = 5 * 60_000;
let pruneTimer: NodeJS.Timeout | null = null;
function ensurePruneTimer(): void {
  if (pruneTimer) return;
  pruneTimer = setInterval(() => {
    const cutoff = Date.now() - RATE_WINDOW_MS;
    for (const [ip, b] of buckets) {
      if (b.windowStartedAt < cutoff) buckets.delete(ip);
    }
  }, PRUNE_INTERVAL_MS);
  pruneTimer.unref?.(); // don't keep the event loop alive on shutdown
}

function constantTimeEquals(a: string, b: string): boolean {
  // timingSafeEqual throws when lengths differ, so guard first. We still
  // do the safeEqual call afterwards (instead of just `return false`)
  // to keep the timing identical for "wrong length" vs "wrong content".
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) {
    // Compare aBuf against itself just to consume comparable CPU before
    // returning false — no information leak on length-mismatch path.
    timingSafeEqual(aBuf, aBuf);
    return false;
  }
  return timingSafeEqual(aBuf, bBuf);
}

export function adminAuth(req: Request, res: Response, next: NextFunction): void {
  ensurePruneTimer();

  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey) {
    res.status(503).json({ success: false, error: { code: 'NOT_CONFIGURED', message: 'Admin not configured' } });
    return;
  }

  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  const bucket = getBucket(ip);

  // Total-attempt window cap (covers brute-force at any failure rate).
  if (bucket.total >= RATE_MAX_ATTEMPTS) {
    console.warn(`[admin-auth] rate-limit hit (total)  ip=${ip}  ua="${req.headers['user-agent'] ?? ''}"  path=${req.path}`);
    res.status(429).json({ success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests' } });
    return;
  }
  bucket.total++;

  const provided = req.headers['x-admin-key'];
  if (typeof provided !== 'string' || !constantTimeEquals(provided, adminKey)) {
    bucket.fails++;
    // Separate sub-limit on FAILS so a legit operator who mis-pastes once
    // doesn't get locked out by their own scripted health checks.
    if (bucket.fails > FAIL_MAX_PER_WINDOW) {
      console.warn(`[admin-auth] rate-limit hit (fails)  ip=${ip}  ua="${req.headers['user-agent'] ?? ''}"  path=${req.path}`);
      res.status(429).json({ success: false, error: { code: 'RATE_LIMITED', message: 'Too many failed attempts' } });
      return;
    }
    console.warn(`[admin-auth] FAILED auth  ip=${ip}  ua="${req.headers['user-agent'] ?? ''}"  path=${req.path}`);
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } });
    return;
  }

  next();
}
