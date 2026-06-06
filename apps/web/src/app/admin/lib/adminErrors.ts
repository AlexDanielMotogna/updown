/**
 * Map raw admin-backend errors to a friendly headline + actionable hint +
 * collapsible raw detail. Mirrors the pattern from `lib/txErrors.ts`
 * (which proved out the UX in the public app) but with the codes admin
 * routes actually return.
 *
 * Used by the toast queue (`useMutationFeedback`) so any mutation error
 * surfaces as `<headline> + <hint>` instead of a raw stack trace. Add a
 * new entry whenever a backend route starts emitting a new error code -
 * do NOT silently re-throw raw `err.message` into the UI.
 *
 * See PLAN-ADMIN-REFACTOR.md Phase 2b §9.
 */

export type AdminFriendlyError = {
  /** Single-sentence headline shown by default in the toast / alert. */
  headline: string;
  /** Hint shown under the headline ("Disable it instead", "Refresh.", etc.). */
  hint?: string;
  /** Raw error text. Always populated so support can ask for it. */
  detail: string;
};

const KNOWN: Array<{ match: RegExp; headline: string; hint?: string }> = [
  // ── Auth ─────────────────────────────────────────────────────────────
  {
    match: /UNAUTHORIZED|401|admin.?key/i,
    headline: 'Admin session expired',
    hint: 'Log in again to continue.',
  },
  {
    match: /RATE_LIMITED|429/i,
    headline: 'Too many attempts',
    hint: 'Wait a minute and try again.',
  },

  // ── Categories ───────────────────────────────────────────────────────
  {
    match: /DUPLICATE|P2002|already exists/i,
    headline: 'That value is already taken',
    hint: 'Pick a different code or name.',
  },
  {
    match: /CATEGORY_HAS_POOLS/i,
    headline: 'Category still has live pools',
    hint: 'Disable it instead, or wait for the pools to fully close.',
  },
  {
    match: /VALIDATION_ERROR/i,
    headline: 'Invalid request',
    hint: 'Check the highlighted fields and resubmit.',
  },

  // ── Generic Prisma / FK ──────────────────────────────────────────────
  {
    match: /FK_CONSTRAINT|P2003/i,
    headline: 'Action blocked by a database constraint',
    hint: 'Another record still depends on this one.',
  },
  {
    match: /NOT_FOUND|P2025/i,
    headline: 'Not found',
    hint: 'It may have been removed already - refresh the page.',
  },

  // ── Solana / RPC (admin sometimes proxies on-chain calls) ────────────
  {
    match: /blockhash not found|block height exceeded/i,
    headline: 'Network was slow to confirm',
    hint: 'Retry - the blockhash expired before the tx landed.',
  },
  {
    match: /insufficient.*funds|insufficient.*lamports|InsufficientFunds/i,
    headline: 'Authority wallet is out of SOL',
    hint: 'Top up the authority wallet on the current cluster.',
  },

  // ── Match / pool admin specifics ─────────────────────────────────────
  {
    match: /MATCH_NOT_CACHED/i,
    headline: 'Match isn’t cached yet',
    hint: 'Refresh the cache from SDB and retry.',
  },
  {
    match: /POOL_NOT_FOUND/i,
    headline: 'Pool not found',
    hint: 'It may have just been removed. Refresh the page.',
  },
  {
    match: /POOL_EXISTS|DUPLICATE_POOL/i,
    headline: 'Pool already exists',
    hint: 'Look for an existing pool with the same interval and asset.',
  },
];

export function mapAdminError(raw: unknown): AdminFriendlyError {
  const detail = raw instanceof Error
    ? raw.message
    : typeof raw === 'string'
      ? raw
      : safeStringify(raw);

  for (const k of KNOWN) {
    if (k.match.test(detail)) {
      return { headline: k.headline, hint: k.hint, detail };
    }
  }

  // Fallback: trim the raw message, surface as the headline. Hint guides
  // the admin toward the only universally-useful action (the explorer can
  // read the detail).
  const trimmed = detail.length > 140 ? detail.slice(0, 137) + '…' : detail;
  return {
    headline: trimmed || 'Action failed',
    hint: 'Retry. If it keeps failing, copy the detail below for support.',
    detail,
  };
}

function safeStringify(value: unknown): string {
  try { return JSON.stringify(value); }
  catch { return String(value); }
}
