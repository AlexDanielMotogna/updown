/**
 * bridge-core — the BridgeAdapter contract (ADR-004 §4).
 *
 * One face, four steps, all async. The CLIENT signs the source-chain (Solana)
 * burn — the only signature in the flow; the provider/relayer drives the Circle
 * attestation and the EVM mint leg. The EVM wallet is a recipient, never a
 * signer. Concrete providers (bridge-lifi, later bridge-cctp) implement this;
 * the funding UI depends only on this interface via the registry.
 */
import type {
  BridgeName,
  BridgeQuote,
  QuoteParams,
  SignedSolanaTx,
  TransferStatus,
  UnsignedSolanaTx,
} from './types';

export interface BridgeAdapter {
  /** Stable rail identifier (matches the registry key). */
  readonly name: BridgeName;

  /** Price a transfer: amount out, total fee, ETA, and the chosen CCTP route.
   *  Must surface enough for the UI to disclose cost + ETA BEFORE any signature
   *  (ADR-004 §8.3). Enforces provider min/max here too (§8.7). */
  quote(params: QuoteParams): Promise<BridgeQuote>;

  /** Build the unsigned Solana burn tx for a given quote. Returned opaque
   *  (base64) so the wallet layer signs it without bridge-core touching
   *  @solana/web3.js. */
  buildSourceTx(quote: BridgeQuote): Promise<UnsignedSolanaTx>;

  /** Submit the wallet-signed burn. Returns the transfer id used to track the
   *  rest of the (async) lifecycle. The caller persists a BridgeTransfer row. */
  submit(signed: SignedSolanaTx, quote: BridgeQuote): Promise<{ transferId: string }>;

  /** Current lifecycle state for polling/resume. Safe to call repeatedly and
   *  after a reload — the provider is the source of truth for the legs it
   *  drives (attestation, mint). */
  getStatus(transferId: string): Promise<TransferStatus>;
}
