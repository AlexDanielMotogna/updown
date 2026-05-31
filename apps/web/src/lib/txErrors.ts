/**
 * Map raw transaction errors (Privy embedded wallet, Solana RPC, our backend)
 * to a short friendly headline + a longer detail string the user can expand.
 *
 * Goal: replace opaque messages like "Me: Unexpected error" with something that
 * tells the user what to do next, while keeping the raw text accessible for
 * support / debugging.
 */

export type TxFriendlyError = {
  /** Single-sentence headline shown by default in the modal. */
  headline: string;
  /** Hint shown under the headline ("Try again", "Top up USDC", etc.). */
  hint?: string;
  /** Raw error text. Always populated so support can ask for it. */
  detail: string;
};

const KNOWN: Array<{ match: RegExp; headline: string; hint?: string }> = [
  // ── Privy embedded wallet ─────────────────────────────────────────────
  {
    match: /Me:\s*Unexpected error|Privy.*rejected|user rejected/i,
    headline: 'Wallet rejected the transaction',
    hint: 'You can try again — no funds were moved.',
  },
  {
    match: /SESSION_EXPIRED|session expired/i,
    headline: 'Your session expired',
    hint: 'Log in again and re-try the transaction.',
  },
  {
    match: /Wallet not (available|connected)|reconnect your wallet/i,
    headline: 'Wallet not connected',
    hint: 'Reconnect your wallet and try again.',
  },

  // ── Solana RPC / on-chain ─────────────────────────────────────────────
  {
    match: /insufficient.*funds|insufficient.*lamports|InsufficientFunds/i,
    headline: 'Not enough USDC',
    hint: 'Top up your wallet and try again.',
  },
  {
    match: /blockhash not found|block height exceeded/i,
    headline: 'Network was slow to confirm',
    hint: 'The blockhash expired before the tx landed — please retry.',
  },
  {
    match: /Custom":\s*2006|ConstraintSeeds/i,
    headline: 'Account mismatch on-chain',
    hint: 'Pool state diverged from what your wallet expects. Refresh and retry.',
  },
  {
    match: /Custom":\s*3012|AccountNotInitialized/i,
    headline: 'Pool not found on-chain',
    hint: 'This pool may have been cancelled or closed. Refresh.',
  },
  {
    match: /DepositDeadlinePassed|NotJoining/i,
    headline: 'Betting closed for this pool',
    hint: 'Predictions locked just before kickoff.',
  },
  {
    match: /not confirmed|timeout|taking longer/i,
    headline: 'Transaction taking longer than expected',
    hint: 'It may still land — check the explorer in a minute.',
  },

  // ── Backend ──────────────────────────────────────────────────────────
  {
    match: /POOL_NOT_FOUND|pool not found/i,
    headline: 'Pool not found',
    hint: 'It may have just been removed. Refresh the page.',
  },
  {
    match: /VALIDATION_ERROR|Invalid (body|amount|side)/i,
    headline: 'Invalid request',
    hint: 'Refresh the page and try again.',
  },
];

export function mapTxError(raw: unknown): TxFriendlyError {
  const detail = raw instanceof Error ? raw.message : typeof raw === 'string' ? raw : JSON.stringify(raw);
  for (const k of KNOWN) {
    if (k.match.test(detail)) {
      return { headline: k.headline, hint: k.hint, detail };
    }
  }
  // Fallback: keep the raw message as the headline but trim it.
  const trimmed = detail.length > 140 ? detail.slice(0, 137) + '…' : detail;
  return {
    headline: trimmed || 'Transaction failed',
    hint: 'Try again. If it keeps failing, contact support with the detail below.',
    detail,
  };
}
