import { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'crypto';

export type AdminRole = 'super' | 'marketing' | 'readonly';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      adminRole?: AdminRole;
    }
  }
}

/**
 * Admin auth middleware. Verifies the `x-admin-key` header against
 * `process.env.ADMIN_API_KEY` using a constant-time comparison to avoid
 * timing-attack leaks, and rate-limits per-IP attempts so the key can't be
 * brute-forced at network speed. Failed attempts are logged to stderr
 * (without the provided key) so a sustained attack surfaces in the API logs.
 *
 * Rate-limit behaviour:
 *  - Production (NODE_ENV === 'production'): on by default, 20 attempts /
 *    5 failures per 15 min per IP.
 *  - Dev / test: off by default — the operator hits /verify on every page
 *    refresh and the per-IP fail counter accumulates fast during normal
 *    iteration. Set ADMIN_AUTH_RATE_LIMIT=on to force it back on.
 *
 *  - ADMIN_AUTH_RATE_LIMIT       'on' | 'off' — explicit override
 *  - ADMIN_AUTH_RATE_TOTAL       int (default 20)  — total attempts/window
 *  - ADMIN_AUTH_RATE_FAILS       int (default 5)   — failed attempts/window
 *  - ADMIN_AUTH_RATE_WINDOW_MS   int (default 900_000) — window length
 *
 * Constant-time compare + failed-auth logging are ALWAYS active regardless
 * of rate-limit state — disabling the limiter is for local iteration
 * comfort, not for weakening the cryptographic surface.
 *
 * See PLAN-ADMIN-REFACTOR.md Phase 1 #11-14, #17.
 */

// ── Config (read once at module load) ───────────────────────────────────
const RATE_WINDOW_MS = Number(process.env.ADMIN_AUTH_RATE_WINDOW_MS) || 15 * 60_000;
const RATE_MAX_ATTEMPTS = Number(process.env.ADMIN_AUTH_RATE_TOTAL) || 20;
const FAIL_MAX_PER_WINDOW = Number(process.env.ADMIN_AUTH_RATE_FAILS) || 5;

function resolveRateLimitEnabled(): boolean {
  const override = (process.env.ADMIN_AUTH_RATE_LIMIT || '').trim().toLowerCase();
  if (override === 'on' || override === 'true' || override === '1') return true;
  if (override === 'off' || override === 'false' || override === '0') return false;
  // Default: on in prod, off elsewhere. NODE_ENV is undefined under
  // `tsx watch` and Jest, both of which we treat as dev.
  return process.env.NODE_ENV === 'production';
}
const RATE_LIMIT_ENABLED = resolveRateLimitEnabled();

if (!RATE_LIMIT_ENABLED) {
  console.log('[admin-auth] rate limiter DISABLED (dev/test mode). Set ADMIN_AUTH_RATE_LIMIT=on to enable.');
}

// ── Per-IP attempt tracking ─────────────────────────────────────────────
// In-memory is fine: admin has a small operator surface and the API is a
// single process per environment. If we ever horizontal-scale the API,
// replace with a Redis-backed bucket.
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

/**
 * Reset all in-memory rate-limit buckets. Exported so a future ops
 * endpoint (or tests) can unstick an operator without restarting the
 * process. Doesn't reset other state.
 */
export function resetAdminRateLimitBuckets(): void {
  buckets.clear();
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

/**
 * Resolve the role for a provided key using constant-time comparisons.
 * `ADMIN_API_KEY` = super admin (everything). `MARKETING_ADMIN_KEY` = marketing
 * (only the marketing tab). Returns null when the key matches neither.
 */
function roleForKey(provided: unknown): AdminRole | null {
  if (typeof provided !== 'string') return null;
  const superKey = process.env.ADMIN_API_KEY;
  const readonlyKey = process.env.READONLY_ADMIN_KEY;
  const marketingKey = process.env.MARKETING_ADMIN_KEY;
  if (superKey && constantTimeEquals(provided, superKey)) return 'super';
  if (readonlyKey && constantTimeEquals(provided, readonlyKey)) return 'readonly';
  if (marketingKey && constantTimeEquals(provided, marketingKey)) return 'marketing';
  return null;
}

export function adminAuth(req: Request, res: Response, next: NextFunction): void {
  if (RATE_LIMIT_ENABLED) ensurePruneTimer();

  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey) {
    res.status(503).json({ success: false, error: { code: 'NOT_CONFIGURED', message: 'Admin not configured' } });
    return;
  }

  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  const provided = req.headers['x-admin-key'];

  // Rate-limit gate. Skipped entirely when disabled (dev/test default).
  if (RATE_LIMIT_ENABLED) {
    const bucket = getBucket(ip);
    if (bucket.total >= RATE_MAX_ATTEMPTS) {
      console.warn(`[admin-auth] rate-limit hit (total)  ip=${ip}  ua="${req.headers['user-agent'] ?? ''}"  path=${req.path}`);
      res.status(429).json({ success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests' } });
      return;
    }
    bucket.total++;

    const role = roleForKey(provided);
    if (!role) {
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

    req.adminRole = role;
    next();
    return;
  }

  // Rate limiter off — still constant-time compare and log failed attempts
  // so the cryptographic surface and observability are unchanged.
  const role = roleForKey(provided);
  if (!role) {
    console.warn(`[admin-auth] FAILED auth  ip=${ip}  ua="${req.headers['user-agent'] ?? ''}"  path=${req.path}  (rate-limit off)`);
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } });
    return;
  }
  req.adminRole = role;
  next();
}

/**
 * Gate for the full back-office (everything except the marketing-only tab).
 * Super admins and read-only admins pass; the marketing role gets a 403.
 */
export function requireBackoffice(req: Request, res: Response, next: NextFunction): void {
  if (req.adminRole === 'marketing') {
    res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Not authorized for this section' } });
    return;
  }
  next();
}

const WRITE_SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Read-only enforcement. The 'readonly' role may load any page (GET) but cannot
 * perform actions: any write method (POST/PUT/PATCH/DELETE) is refused. Mounted
 * globally right after adminAuth so it covers every admin route.
 */
export function blockReadonlyWrites(req: Request, res: Response, next: NextFunction): void {
  if (req.adminRole === 'readonly' && !WRITE_SAFE_METHODS.has(req.method)) {
    res.status(403).json({ success: false, error: { code: 'READ_ONLY', message: 'Read-only admin: actions are disabled' } });
    return;
  }
  next();
}
