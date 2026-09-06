import { Request, Response, NextFunction } from 'express';
import { createHash } from 'crypto';
import { prisma } from '../db';

/**
 * Actor-stamping audit trail for the admin panel.
 *
 * Admin credentials get rotated, and rotation is only half a control. The
 * other half is being able to answer "what was done, by whom, with which
 * credential, and when", for any window you care about. Recording the action
 * without the actor cannot answer it; on a platform that settles money, an
 * unanswerable window is a window you have to unwind wholesale.
 *
 * WHERE IT MOUNTS AND WHY THAT ORDER MATTERS
 *
 * This goes on `adminRouter` BEFORE `adminAuth`, not after. Mounting it after
 * would record only the requests that authenticated successfully, and a
 * credential under attack produces mostly failures. The role and key
 * fingerprint are read at response time, by which point `adminAuth` has either
 * populated `req.adminRole` or rejected with 401, so nothing is lost by going
 * first and a burst of null-role 401s from one IP is preserved.
 *
 * WHAT IT DOES NOT DO
 *
 * It is not a before/after diff. A generic middleware cannot produce one: it
 * does not know which rows a handler is about to touch. What it records is the
 * request (what was asked for) and the outcome (what came back). Real
 * before/after diffing belongs in the individual handlers that move money, and
 * is a separate piece of work. Calling this "before/after" would overstate it.
 *
 * FAILURE POSTURE
 *
 * Fails open. A DB hiccup while writing the audit row must not turn into a
 * 500 on a force-refund, so the write is fire-and-forget after the response
 * has already been sent. The tradeoff is explicit: this is an investigation
 * aid, not an authorisation control, and losing a row is better than losing an
 * operator's ability to act during an incident. It logs loudly to stderr when
 * a write fails, so a systematic outage is visible rather than silent.
 */

// GET/HEAD/OPTIONS are not recorded. The admin panel polls several list
// endpoints on a timer and recording those would bury the ~dozen writes a day
// that actually matter under thousands of reads.
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Field names whose values never belong in an audit row. Matched
// case-insensitively as a substring, so `newAdminKey` and `privateKeyHex` are
// both caught.
const REDACT_PATTERN = /key|secret|token|password|passphrase|mnemonic|seed|private|credential|authorization|cookie/i;

const MAX_BODY_BYTES = 8_000;
const MAX_PATH_LENGTH = 512;
const MAX_UA_LENGTH = 256;

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

/**
 * Deep-copy a request body with credential-shaped fields replaced. Depth- and
 * breadth-capped so a hostile body cannot make the middleware expensive.
 */
function redact(value: unknown, depth = 0): Json {
  if (depth > 6) return '[depth capped]';
  if (value === null || value === undefined) return null;

  const t = typeof value;
  if (t === 'string') {
    const s = value as string;
    return s.length > 500 ? `${s.slice(0, 500)}… [+${s.length - 500} chars]` : s;
  }
  if (t === 'number' || t === 'boolean') return value as number | boolean;
  if (t === 'bigint') return (value as bigint).toString();

  if (Array.isArray(value)) {
    const head = value.slice(0, 50).map(v => redact(v, depth + 1));
    if (value.length > 50) head.push(`[+${value.length - 50} more]`);
    return head;
  }

  if (t === 'object') {
    const out: Record<string, Json> = {};
    let n = 0;
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (n++ >= 50) {
        out['…'] = '[truncated]';
        break;
      }
      out[k] = REDACT_PATTERN.test(k) ? '[REDACTED]' : redact(v, depth + 1);
    }
    return out;
  }

  return `[${t}]`;
}

function cappedBody(body: unknown): Json | null {
  if (body === undefined || body === null) return null;
  if (typeof body === 'object' && Object.keys(body as object).length === 0) return null;
  const red = redact(body);
  const serialized = JSON.stringify(red);
  if (serialized && serialized.length > MAX_BODY_BYTES) {
    return { _truncated: true, _bytes: serialized.length, preview: serialized.slice(0, MAX_BODY_BYTES) };
  }
  return red;
}

/**
 * Identify WHICH credential was used, without storing it. Survives rotation:
 * after a rotation the fingerprint changes, so "these actions were taken with
 * the old key" is answerable from the log alone.
 */
function fingerprint(provided: unknown): string | null {
  if (typeof provided !== 'string' || provided.length === 0) return null;
  return createHash('sha256').update(provided).digest('hex').slice(0, 16);
}

/**
 * Summarise the response instead of storing it. Admin list endpoints return
 * megabytes; what an investigation needs is whether it worked and, if not,
 * why.
 */
function summarize(payload: unknown, statusCode: number): Json {
  const out: Record<string, Json> = { statusCode };
  if (payload && typeof payload === 'object') {
    const p = payload as Record<string, unknown>;
    if (typeof p.success === 'boolean') out.success = p.success;
    if (typeof p.message === 'string') out.message = p.message.slice(0, 300);
    const err = p.error as Record<string, unknown> | undefined;
    if (err && typeof err === 'object') {
      if (typeof err.code === 'string') out.errorCode = err.code;
      if (typeof err.message === 'string') out.errorMessage = err.message.slice(0, 300);
    }
    // Money-moving handlers echo the entity they touched. Keep those ids: they
    // are what turns a log line into an on-chain lookup.
    const data = p.data as Record<string, unknown> | undefined;
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      for (const k of ['id', 'poolId', 'betId', 'userId', 'status', 'txSignature', 'signature']) {
        const v = data[k];
        if (typeof v === 'string' || typeof v === 'number') out[k] = v;
      }
    } else if (Array.isArray(data)) {
      out.dataCount = data.length;
    }
  }
  return out;
}

export function auditAdminActions(req: Request, res: Response, next: NextFunction): void {
  if (READ_METHODS.has(req.method)) {
    next();
    return;
  }

  const startedAt = Date.now();

  // Capture the response payload without buffering the body: wrap res.json,
  // which every admin handler uses. Streaming endpoints (the orphan-recovery
  // SSE route writes with res.write) simply produce no payload, and still get
  // a row on res.end via the 'finish' listener.
  let payload: unknown;
  const originalJson = res.json.bind(res);
  res.json = function patchedJson(body: unknown) {
    payload = body;
    return originalJson(body);
  } as Response['json'];

  res.on('finish', () => {
    // `originalUrl` keeps the query string; `path` on a mounted router is
    // relative to the mount point and would lose which tab this came from.
    const fullPath = (req.originalUrl || req.url || '').slice(0, MAX_PATH_LENGTH);
    const ua = req.headers['user-agent'];

    const row = {
      role: req.adminRole ?? null,
      keyFingerprint: fingerprint(req.headers['x-admin-key']),
      // req.ip is trustworthy here: `trust proxy` is pinned to a single hop,
      // so this is the address our edge saw and not whatever the client
      // stuffed into X-Forwarded-For.
      ip: req.ip || req.socket?.remoteAddress || 'unknown',
      userAgent: typeof ua === 'string' ? ua.slice(0, MAX_UA_LENGTH) : null,
      method: req.method,
      path: fullPath,
      statusCode: res.statusCode,
      requestBody: cappedBody(req.body) ?? undefined,
      outcome: summarize(payload, res.statusCode) as object,
      durationMs: Date.now() - startedAt,
    };

    prisma.adminAction.create({ data: row }).catch((err: unknown) => {
      // Loud, and carrying the facts the lost row would have held, so a
      // sustained failure is recoverable from the process logs.
      console.error(
        `[admin-audit] FAILED to persist admin action  ${row.method} ${row.path} ` +
          `status=${row.statusCode} role=${row.role ?? 'none'} key=${row.keyFingerprint ?? 'none'} ip=${row.ip}  ` +
          `reason=${err instanceof Error ? err.message : String(err)}`
      );
    });
  });

  next();
}
