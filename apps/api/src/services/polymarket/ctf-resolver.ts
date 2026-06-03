/**
 * Polymarket settlement resolver via the Conditional Tokens Framework (CTF).
 *
 * Why CTF and not UmaCtfAdapter?
 *   Polymarket runs several UMA adapters (the classic UmaCtfAdapter on
 *   0x6A9D…F74, the NegRisk adapter, and at least one newer wrapper —
 *   Gamma exposes the per-market resolver via `resolvedBy`). Querying any
 *   one of them only catches a slice of the market universe. The CTF
 *   contract on the other hand is the canonical settlement layer for
 *   every Polymarket market regardless of which adapter mediated the
 *   UMA request — once an oracle calls reportPayouts(conditionId,
 *   payouts), the position is final and CTF.payoutNumerators reflects
 *   it forever. Querying CTF with the conditionId Gamma already exposes
 *   gives us 100% coverage with one address and a tiny ABI.
 *
 * Contract:
 *   ConditionalTokens on Polygon: 0x4D97DCd97eC945f40cF65F87097ACe5EA0476045
 *
 * Reads:
 *   payoutDenominator(conditionId) → 0 = not resolved, else sum of numerators
 *   payoutNumerators(conditionId, index) → per-outcome payout share
 *     Binary YES/NO market: [1, 0] = YES won, [0, 1] = NO won.
 *     Equal non-zero values = split (the rare push/refund case).
 *
 * The resolver only deals with the binary case today (Polymarket markets
 * we ingest are all YES/NO). Multi-outcome events come in as N separate
 * binary sub-markets in our pipeline, so a single binary CTF read per row
 * is enough.
 */

import { createPublicClient, getAddress, http, type Hex, type PublicClient } from 'viem';
import { polygon } from 'viem/chains';

export const CTF_POLYGON = getAddress('0x4D97DCd97eC945f40cF65F87097ACe5EA0476045');

/**
 * State of a single condition read from CTF.
 *
 *   resolved        — payoutDenominator > 0. `outcome` is 1 for YES/HOME
 *                     win, 0 for NO/AWAY win. The unusual [1,1] split
 *                     case returns kind='refund' so the caller can flag
 *                     it for admin review instead of picking a winner.
 *   pending         — denominator = 0. The CTF has no record of a payout
 *                     yet; market is still live OR the oracle hasn't
 *                     reported yet.
 *   refund          — both numerators non-zero (push). Caller should
 *                     force-refund instead of picking a winner.
 *   unknown         — conditionId is malformed. Caller falls through to
 *                     Gamma.
 *   rpc-error       — Polygon RPC failure. Caller retries next cycle.
 */
export type CtfResolutionState =
  | { kind: 'resolved'; outcome: 0 | 1 }
  | { kind: 'refund' }
  | { kind: 'pending' }
  | { kind: 'unknown' }
  | { kind: 'rpc-error'; error: string };

const CTF_ABI = [
  {
    type: 'function', name: 'payoutNumerators', stateMutability: 'view',
    inputs: [
      { name: 'conditionId', type: 'bytes32' },
      { name: 'index', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function', name: 'payoutDenominator', stateMutability: 'view',
    inputs: [{ name: 'conditionId', type: 'bytes32' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

// Lazy singleton — single HTTP keep-alive pool for the 10-min poll cycle.
let cachedClient: PublicClient | null = null;
function getPolygonClient(): PublicClient | null {
  if (cachedClient) return cachedClient;
  const rpcUrl = process.env.POLYGON_RPC_URL;
  if (!rpcUrl) return null;
  cachedClient = createPublicClient({
    chain: polygon,
    transport: http(rpcUrl, { timeout: 8_000, retryCount: 2, retryDelay: 500 }),
  });
  return cachedClient;
}

// Per-conditionId cache. Resolved + refund are monotonic on CTF (once
// reported the payouts cannot be re-reported), so we cache positives
// forever in the process. Pending / unknown / rpc-error get a 60s TTL.
type CacheEntry = { state: CtfResolutionState; cachedAt: number };
const cache = new Map<string, CacheEntry>();
const TERMINAL_TTL_MS = Infinity;
const RETRY_TTL_MS = 60_000;

function cacheTtl(kind: CtfResolutionState['kind']): number {
  if (kind === 'resolved' || kind === 'refund' || kind === 'unknown') return TERMINAL_TTL_MS;
  return RETRY_TTL_MS;
}

function normalizeConditionId(raw: string): Hex | null {
  const lower = raw.toLowerCase();
  const withPrefix = lower.startsWith('0x') ? lower : `0x${lower}`;
  if (withPrefix.length !== 66) return null;
  if (!/^0x[0-9a-f]{64}$/.test(withPrefix)) return null;
  return withPrefix as Hex;
}

/**
 * Read a single Polymarket condition from the CTF contract on Polygon.
 *
 * Returns the resolution state without throwing — RPC errors map to
 * `{ kind: 'rpc-error' }` so the caller's retry loop continues.
 * Malformed conditionIds return `unknown` so callers fall through to
 * the Gamma path.
 */
export async function readCtfResolution(conditionId: string): Promise<CtfResolutionState> {
  const normalized = normalizeConditionId(conditionId);
  if (!normalized) return { kind: 'unknown' };

  const cached = cache.get(normalized);
  if (cached && Date.now() - cached.cachedAt < cacheTtl(cached.state.kind)) {
    return cached.state;
  }

  const client = getPolygonClient();
  if (!client) return { kind: 'unknown' };

  let denominator: bigint;
  let numerator0: bigint;
  let numerator1: bigint;
  try {
    // Single batched call would be nicer but viem doesn't expose
    // multicall by default without setup. Three serial reads in a row
    // against a free-tier RPC is ~250-400ms — acceptable for the 10-min
    // cron cadence and a per-cycle cache hit on subsequent polls.
    denominator = (await client.readContract({
      address: CTF_POLYGON, abi: CTF_ABI, functionName: 'payoutDenominator', args: [normalized],
    })) as bigint;
    if (denominator === 0n) {
      const state: CtfResolutionState = { kind: 'pending' };
      cache.set(normalized, { state, cachedAt: Date.now() });
      return state;
    }
    numerator0 = (await client.readContract({
      address: CTF_POLYGON, abi: CTF_ABI, functionName: 'payoutNumerators', args: [normalized, 0n],
    })) as bigint;
    numerator1 = (await client.readContract({
      address: CTF_POLYGON, abi: CTF_ABI, functionName: 'payoutNumerators', args: [normalized, 1n],
    })) as bigint;
  } catch (err) {
    const state: CtfResolutionState = {
      kind: 'rpc-error',
      error: err instanceof Error ? err.message : String(err),
    };
    cache.set(normalized, { state, cachedAt: Date.now() });
    return state;
  }

  let state: CtfResolutionState;
  if (numerator0 > 0n && numerator1 === 0n) state = { kind: 'resolved', outcome: 1 }; // YES/HOME
  else if (numerator0 === 0n && numerator1 > 0n) state = { kind: 'resolved', outcome: 0 }; // NO/AWAY
  else if (numerator0 > 0n && numerator1 > 0n) state = { kind: 'refund' };
  else state = { kind: 'pending' }; // [0, 0] with denominator > 0 — shouldn't happen, treat as not resolved

  cache.set(normalized, { state, cachedAt: Date.now() });
  return state;
}

/** Test-only — clears the in-memory cache between scenarios. */
export function __clearCtfCache(): void {
  cache.clear();
  cachedClient = null;
}
