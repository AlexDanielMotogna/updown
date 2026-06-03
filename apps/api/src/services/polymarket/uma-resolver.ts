/**
 * UMA Optimistic Oracle resolver for Polymarket markets.
 *
 * Polymarket's UI/Gamma is an editorial layer on top of the actual
 * settlement: every market resolves via UMA's Optimistic Oracle, mediated
 * by Polymarket's UmaCtfAdapter contract on Polygon. Reading the adapter
 * directly lets us survive Gamma editorial actions (delisting, market
 * renames, hourly cycle replacements) that today force us to cancel pools
 * with `gamma-delisted` reason even though UMA hasn't ruled yet.
 *
 * Reference:
 *   • Adapter on Polygon: 0x6A9D222616C90FcA5754cd1333cFD9b7fb6a4F74
 *   • https://docs.polymarket.com/developers/CTF/uma-ctf-adapter
 *   • https://docs.uma.xyz/protocol-overview/how-does-umas-oracle-work
 *
 * Resolution states the adapter exposes:
 *   • `resolved=false` + `paused=false`  → market still live or UMA hasn't
 *     closed its proposal/dispute window yet. Caller should retry later.
 *   • `paused=true`                      → adapter operator paused settlement
 *     (extremely rare; usually disputed markets pending DVM vote). Caller
 *     should leave the pool alone and surface for admin review.
 *   • `resolved=true`                    → final. The QuestionResolved event
 *     for this questionID carries the settled outcome (0 = NO/AWAY,
 *     1 = YES/HOME for two-outcome markets).
 *
 * NOTE — initial scaffolding. The Polygon RPC client + viem ABI binding
 * land in the next commit on this branch. Today this file only exports
 * the typed interface so callers (resolutionPoll, pm-cancel) can be
 * wired ahead of the on-chain implementation.
 */

export const UMA_CTF_ADAPTER_POLYGON = '0x6A9D222616C90FcA5754cd1333cFD9b7fb6a4F74' as const;

/** State of a single UMA question read from the adapter. */
export type UmaQuestionState =
  | { kind: 'resolved'; outcome: 0 | 1; settledAt: Date }
  | { kind: 'paused'; emergencyResolutionTimestamp: Date | null }
  | { kind: 'pending'; requestTimestamp: Date | null }
  // questionID is not initialized on the adapter — either we have a stale
  // id (Polymarket migrated the market to a new questionID) or the market
  // was never registered with UMA (admin-resolved special).
  | { kind: 'unknown' };

/**
 * Read a single Polymarket question from the UMA adapter on Polygon.
 *
 * @param questionId — bytes32 hex string (0x…64chars). The same id Gamma
 *                     exposes as `questionID`.
 *
 * Returns the resolution state without throwing — RPC errors map to
 * `{ kind: 'pending', requestTimestamp: null }` so the caller's retry
 * loop continues. Hard failures (config missing, invalid hex) bubble.
 */
export async function readUmaQuestion(_questionId: string): Promise<UmaQuestionState> {
  // TODO(uma-resolver): wire viem PublicClient against POLYGON_RPC_URL,
  // read getQuestion(questionId) + filter QuestionResolved events for the
  // settled outcome. Behind a feature flag (POLYMARKET_USE_UMA) so the
  // existing Gamma path keeps running until this returns useful data.
  return { kind: 'unknown' };
}

/**
 * Minimal subset of the UmaCtfAdapter ABI we need. Kept inline (instead
 * of a JSON artifact) so the bundle doesn't carry the full ABI for a
 * single read call.
 */
export const UMA_CTF_ADAPTER_ABI = [
  {
    type: 'function',
    name: 'getQuestion',
    stateMutability: 'view',
    inputs: [{ name: 'questionID', type: 'bytes32' }],
    outputs: [
      { name: 'requestTimestamp', type: 'uint256' },
      { name: 'rewardToken', type: 'address' },
      { name: 'reward', type: 'uint256' },
      { name: 'proposalBond', type: 'uint256' },
      { name: 'emergencyResolutionTimestamp', type: 'uint256' },
      { name: 'resolved', type: 'bool' },
      { name: 'paused', type: 'bool' },
      { name: 'reset', type: 'bool' },
      { name: 'ancillaryData', type: 'bytes' },
    ],
  },
  {
    type: 'event',
    name: 'QuestionResolved',
    inputs: [
      { indexed: true, name: 'questionID', type: 'bytes32' },
      { indexed: true, name: 'settledOutcome', type: 'int256' },
    ],
  },
] as const;
