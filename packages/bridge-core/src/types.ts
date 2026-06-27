/**
 * bridge-core — normalized cross-chain funding types.
 *
 * The terminal funds HyperLiquid (USDC on Arbitrum) from the user's Solana USDC.
 * Adapters (LI.FI, deBridge, …) map their raw quotes/routes to these shapes so the
 * UI and API stay provider-agnostic — swap the provider in the registry, zero UI
 * change. Mirrors the exchange-core adapter/registry pattern.
 *
 * Conventions:
 *  - Token amounts are **strings in base units** (USDC has 6 decimals) to keep
 *    precision; never `number`.
 *  - USD costs are **strings** (e.g. "0.04").
 *  - Durations are **seconds** (`number`); timestamps epoch ms (`number`).
 *  - Every shape carries a `metadata` / `raw` escape hatch for provider-specific
 *    data (the raw route is what a later execute step will consume).
 */

/** Chains this funding flow spans. Extend as routes are added. */
export type BridgeChain = 'solana' | 'arbitrum';

/** Inputs needed to price a transfer. Tokens default to USDC when omitted. */
export interface BridgeQuoteRequest {
  fromChain: BridgeChain;
  toChain: BridgeChain;
  /** Amount to send, in base units of the source token (USDC = 6 decimals). */
  amount: string;
  /** Source owner (Solana address). */
  fromAddress: string;
  /** Destination owner (the user's EVM/HyperLiquid address). */
  toAddress: string;
  /** Source token address/mint. Defaults to the chain's USDC when omitted. */
  fromToken?: string;
  /** Destination token address. Defaults to the chain's USDC when omitted. */
  toToken?: string;
  /** Max slippage as a fraction (0.005 = 0.5%). Adapter may apply a default. */
  slippage?: number;
}

/** A normalized, UI-ready quote. `raw` carries the provider route for execution. */
export interface BridgeQuote {
  /** Provider key, e.g. 'lifi'. */
  provider: string;
  /** Underlying route tool, e.g. 'across' | 'mayanFastMCTP'. */
  tool: string;
  /** Amount sent, base units (source token). */
  fromAmount: string;
  /** Estimated amount received, base units (destination token). */
  toAmount: string;
  /** Guaranteed minimum received after slippage, base units. */
  toAmountMin: string;
  /** Total bridge/protocol fees in USD. */
  feeUsd: string;
  /** Gas cost in USD (paid on the source per the spike; ~$0.01 on Solana). */
  gasUsd: string;
  /** Estimated end-to-end duration in seconds. */
  durationSeconds: number;
  /** Provider's raw quote/route — opaque, consumed by a later execute step. */
  raw: unknown;
  metadata: Record<string, unknown>;
}

/** A bridge provider adapter. Phase 1 only needs `quote`; execute/status land later. */
export interface BridgeAdapter {
  readonly provider: string;
  quote(req: BridgeQuoteRequest): Promise<BridgeQuote>;
}
