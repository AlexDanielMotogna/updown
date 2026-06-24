/**
 * bridge-core — shared types for the cross-chain funding contract.
 *
 * Phase 1 scope (ADR-004 §8.5): move **native USDC from Solana → Arbitrum** into
 * the user's already-known EVM address, on the Circle CCTP rail. The types are
 * deliberately a little wider than Phase 1 (extra chains/assets are additive)
 * but no provider logic lives here — this is just the vocabulary every adapter
 * and the funding UI speak.
 */

/** A bridge provider/rail. Phase 1 ships `lifi`; `cctp` (self-relayed) is the
 *  planned drop-in later. String union so adding one is a one-line change. */
export type BridgeName = 'lifi' | 'cctp' | 'mayan' | 'debridge';

/** Chains we can move value between. Phase 1 uses only `solana` → `arbitrum`. */
export type ChainId = 'solana' | 'arbitrum' | 'base' | 'ethereum';

/** Bridgeable asset. Phase 1 is USDC-only (native on both chains via CCTP). */
export type Asset = 'USDC';

/** Underlying CCTP route. Fast = sub-minute for a small fee; Standard = bounded
 *  by source finality. The adapter picks/encodes which one a quote uses. */
export type BridgeRoute = 'cctp-fast' | 'cctp-standard';

/**
 * Lifecycle of a single transfer (ADR-004 §6). Monotonic happy path:
 *   initiated → burned → attested → minting → completed
 * with `failed` reachable from any leg. Persisted on `BridgeTransfer` so a
 * reload/RPC blip resumes from the row, never from in-memory state.
 */
export type TransferStatusKind =
  | 'initiated'
  | 'burned'
  | 'attested'
  | 'minting'
  | 'completed'
  | 'failed';

/** Inputs to request a quote. `amount` is a decimal string in whole USDC
 *  (e.g. "25.5"); adapters convert to base units. Addresses are chain-native
 *  string forms (Solana base58 source, 0x EVM dest). */
export interface QuoteParams {
  asset: Asset;
  amount: string;
  sourceChain: ChainId;
  destChain: ChainId;
  /** The user's Solana wallet (signs the burn). Base58. */
  sourceAddress: string;
  /** The user's EVM address (recipient; never signs). 0x, will be lowercased. */
  destAddress: string;
  /** Prefer the fast route when the rail supports it. Default true. */
  preferFast?: boolean;
}

/** A priced, ready-to-build transfer. `amountOut`/`feeTotal` are decimal USDC
 *  strings; `etaSeconds` is the provider's estimate. `raw` carries the
 *  provider's opaque payload that `buildSourceTx` needs — never inspected by the
 *  app or the UI. */
export interface BridgeQuote {
  provider: BridgeName;
  asset: Asset;
  amountIn: string;
  amountOut: string;
  feeTotal: string;
  route: BridgeRoute;
  etaSeconds: number;
  sourceChain: ChainId;
  destChain: ChainId;
  sourceAddress: string;
  destAddress: string;
  /** Provider-specific data threaded from quote() into buildSourceTx(). */
  raw?: unknown;
}

/** An unsigned source-chain (Solana) transaction, framework-agnostic: a
 *  base64-serialized VersionedTransaction the wallet layer can deserialize +
 *  sign. Keeping it opaque means bridge-core never imports @solana/web3.js. */
export interface UnsignedSolanaTx {
  chain: 'solana';
  /** base64-encoded serialized transaction message. */
  base64: string;
}

/** The same transaction after the wallet signed it (base64). */
export interface SignedSolanaTx {
  chain: 'solana';
  base64: string;
}

/** Current state of a transfer, returned by getStatus() for polling/resume.
 *  The optional refs fill in as the legs complete. */
export interface TransferStatus {
  transferId: string;
  status: TransferStatusKind;
  /** Solana burn signature (once burned). */
  sourceTxSig?: string;
  /** Circle attestation id / message hash (once attested). */
  attestationRef?: string;
  /** EVM mint tx hash (once completed). */
  destTxHash?: string;
  /** Human-readable reason when status === 'failed'. */
  error?: string;
}
