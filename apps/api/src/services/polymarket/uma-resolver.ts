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
 */

import { createPublicClient, http, type Hex, type PublicClient } from 'viem';
import { polygon } from 'viem/chains';

export const UMA_CTF_ADAPTER_POLYGON = '0x6A9D222616C90FcA5754cd1333cFD9b7fb6a4F74' as const;

/** State of a single UMA question read from the adapter. */
export type UmaQuestionState =
  | { kind: 'resolved'; outcome: 0 | 1; settledAt: Date | null }
  | { kind: 'paused'; emergencyResolutionTimestamp: Date | null }
  | { kind: 'pending'; requestTimestamp: Date | null }
  // questionID is not initialized on the adapter — either we have a stale
  // id (Polymarket migrated the market to a new questionID) or the market
  // was never registered with UMA (admin-resolved special).
  | { kind: 'unknown' }
  // RPC failure — caller should not treat as terminal. Same retry
  // semantics as `pending` but logged separately so we notice when the
  // free-tier RPC is the bottleneck.
  | { kind: 'rpc-error'; error: string };

/**
 * Minimal subset of the UmaCtfAdapter ABI we need. Kept inline (instead
 * of a JSON artifact) so the bundle doesn't carry the full ABI for a
 * single read call.
 *
 * IMPORTANT — the QuestionData struct has 10 fields. Earlier drafts of
 * this file omitted `creator` (field #2), which silently shifted every
 * subsequent decoded value by one slot. `getQuestion` then returned
 * `requestTimestamp=32` for every question (the `32` is actually the
 * offset prefix of the ancillaryData bytes when read into the wrong
 * slot), and the resolver mistakenly reported every market as "pending".
 * Source: https://github.com/Polymarket/uma-ctf-adapter/blob/main/src/UmaCtfAdapter.sol
 */
export const UMA_CTF_ADAPTER_ABI = [
  {
    type: 'function',
    name: 'getQuestion',
    stateMutability: 'view',
    inputs: [{ name: 'questionID', type: 'bytes32' }],
    outputs: [
      { name: 'requestTimestamp', type: 'uint256' },
      { name: 'creator', type: 'address' },
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

// Lazy singleton — the viem PublicClient is cheap but we want a single
// HTTP keep-alive pool so the cron poll (10 min) reuses connections.
let cachedClient: PublicClient | null = null;
function getPolygonClient(): PublicClient | null {
  if (cachedClient) return cachedClient;
  const rpcUrl = process.env.POLYGON_RPC_URL;
  if (!rpcUrl) return null;
  cachedClient = createPublicClient({
    chain: polygon,
    transport: http(rpcUrl, {
      // Ankr/QuickNode/Alchemy all behave fine with viem defaults. We
      // only override the per-call timeout so a single hung RPC doesn't
      // stall the resolution poll cycle.
      timeout: 8_000,
      // viem retries 3× by default on 4xx/5xx with exponential backoff.
      // That's more than enough for our once-per-10min cadence.
      retryCount: 2,
      retryDelay: 500,
    }),
  });
  return cachedClient;
}

/**
 * Per-question cache. Resolution is monotonic (once resolved, always
 * resolved with the same outcome) so we can cache positive answers
 * indefinitely. Pending / paused / rpc-error get a short TTL so the next
 * poll cycle re-checks.
 */
type CacheEntry = { state: UmaQuestionState; cachedAt: number };
const cache = new Map<string, CacheEntry>();
const TERMINAL_TTL_MS = Infinity;
const RETRY_TTL_MS = 60_000;

function cacheTtl(kind: UmaQuestionState['kind']): number {
  if (kind === 'resolved' || kind === 'unknown') return TERMINAL_TTL_MS;
  return RETRY_TTL_MS;
}

/**
 * Read a single Polymarket question from the UMA adapter on Polygon.
 *
 * @param questionId — bytes32 hex string (0x…64chars). The same id Gamma
 *                     exposes as `questionID`.
 *
 * Returns the resolution state without throwing — RPC errors map to
 * `{ kind: 'rpc-error' }` so the caller's retry loop continues. Hard
 * failures (invalid hex, no RPC configured) return `unknown` so callers
 * fall through to the Gamma path.
 */
export async function readUmaQuestion(questionId: string): Promise<UmaQuestionState> {
  const normalized = questionId.toLowerCase().startsWith('0x')
    ? (questionId.toLowerCase() as Hex)
    : (`0x${questionId.toLowerCase()}` as Hex);

  if (normalized.length !== 66) {
    // Not a valid bytes32 — Gamma didn't expose questionID for this market,
    // so we have nothing to query. Tell the caller to use Gamma instead.
    return { kind: 'unknown' };
  }

  const cached = cache.get(normalized);
  if (cached && Date.now() - cached.cachedAt < cacheTtl(cached.state.kind)) {
    return cached.state;
  }

  const client = getPolygonClient();
  if (!client) {
    // No POLYGON_RPC_URL configured — treat as if UMA isn't available so
    // the existing Gamma path runs unchanged. This lets the feature flag
    // stay off in environments that haven't been provisioned yet.
    return { kind: 'unknown' };
  }

  // Tuple order MUST match the QuestionData struct (10 fields). See
  // UMA_CTF_ADAPTER_ABI comment for why this matters.
  let raw: readonly [bigint, `0x${string}`, `0x${string}`, bigint, bigint, bigint, boolean, boolean, boolean, `0x${string}`];
  try {
    raw = (await client.readContract({
      address: UMA_CTF_ADAPTER_POLYGON,
      abi: UMA_CTF_ADAPTER_ABI,
      functionName: 'getQuestion',
      args: [normalized],
    })) as typeof raw;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const state: UmaQuestionState = { kind: 'rpc-error', error: msg };
    cache.set(normalized, { state, cachedAt: Date.now() });
    return state;
  }

  const [requestTimestamp, , , , , emergencyResolutionTimestamp, resolved, paused] = raw;

  let state: UmaQuestionState;
  if (paused) {
    state = {
      kind: 'paused',
      emergencyResolutionTimestamp: emergencyResolutionTimestamp > 0n
        ? new Date(Number(emergencyResolutionTimestamp) * 1000)
        : null,
    };
  } else if (resolved) {
    // The adapter doesn't store the outcome — we read it from the
    // QuestionResolved event. UMA proposal+dispute windows total ~4h, so
    // the event is always within the last week of blocks. Polygon mines
    // ~2s per block → ~302k blocks/week. We scan the last 350k to be
    // safe; Ankr/Alchemy free-tier eth_getLogs allows up to ~10k blocks
    // per request, so we paginate.
    const outcome = await readQuestionResolvedOutcome(client, normalized);
    if (outcome == null) {
      // Adapter says resolved but we couldn't find the event — likely
      // the resolution is older than our scan window. Surface as
      // pending so the next poll retries with a wider window if needed.
      state = { kind: 'pending', requestTimestamp: requestTimestamp > 0n ? new Date(Number(requestTimestamp) * 1000) : null };
    } else {
      state = {
        kind: 'resolved',
        outcome,
        settledAt: requestTimestamp > 0n ? new Date(Number(requestTimestamp) * 1000) : null,
      };
    }
  } else if (requestTimestamp === 0n) {
    // Never initialised on the adapter — caller should fall back to Gamma.
    state = { kind: 'unknown' };
  } else {
    state = {
      kind: 'pending',
      requestTimestamp: new Date(Number(requestTimestamp) * 1000),
    };
  }

  cache.set(normalized, { state, cachedAt: Date.now() });
  return state;
}

/**
 * Scan recent QuestionResolved events for a given questionID and return
 * the settled outcome (0 = NO/AWAY, 1 = YES/HOME). Returns null when no
 * matching event exists in the scan window.
 *
 * Paginates blocks in chunks of LOG_CHUNK_BLOCKS to stay within free-tier
 * eth_getLogs limits (Ankr: 2k, Alchemy: 10k, Infura: 10k).
 */
const LOG_CHUNK_BLOCKS = 2_000n; // safe across all free tiers
const TOTAL_SCAN_BLOCKS = 350_000n; // ≈ 7 days at 2s/block on Polygon

async function readQuestionResolvedOutcome(
  client: PublicClient,
  questionId: Hex,
): Promise<0 | 1 | null> {
  const latest = await client.getBlockNumber();
  let toBlock = latest;
  const stopAt = latest > TOTAL_SCAN_BLOCKS ? latest - TOTAL_SCAN_BLOCKS : 0n;

  while (toBlock > stopAt) {
    const fromBlock = toBlock > LOG_CHUNK_BLOCKS ? toBlock - LOG_CHUNK_BLOCKS + 1n : 0n;
    const logs = await client.getLogs({
      address: UMA_CTF_ADAPTER_POLYGON,
      event: {
        type: 'event',
        name: 'QuestionResolved',
        inputs: [
          { indexed: true, name: 'questionID', type: 'bytes32' },
          { indexed: true, name: 'settledOutcome', type: 'int256' },
        ],
      },
      args: { questionID: questionId },
      fromBlock,
      toBlock,
    });
    if (logs.length > 0) {
      // Multiple resolutions only happen on reset; the latest one wins.
      const last = logs[logs.length - 1];
      const settled = (last as { args: { settledOutcome: bigint } }).args.settledOutcome;
      return settled === 1n ? 1 : 0;
    }
    if (fromBlock === 0n) break;
    toBlock = fromBlock - 1n;
  }
  return null;
}

/** Test-only — clears the in-memory cache between scenarios. */
export function __clearUmaCache(): void {
  cache.clear();
  cachedClient = null;
}
