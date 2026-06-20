/**
 * exchange-core — signer face (client-side)
 *
 * The critical, chain-aware piece. Writes are **client-signed**: the order is
 * signed in the browser with the user's wallet (or a delegated agent key) and
 * sent directly to the exchange; the backend only reads/caches.
 *
 * Signing differs per chain (ADR-001 risk #1, ADR-003):
 *   - HyperLiquid → EVM / EIP-712 (typically via a delegated *agent wallet*).
 *   - Pacifica    → Solana / Ed25519.
 *
 * The `WalletSigner` abstracts whatever provides the signature (Privy embedded
 * wallet, Phantom, Rabby, MetaMask, or a HyperLiquid agent session key). The
 * adapter builds an unsigned payload, the wallet signs it, the adapter submits.
 */
import type {
  CancelParams,
  ChainKind,
  ExchangeName,
  OrderParams,
  OrderResult,
  Result,
} from './types';

// ---------------------------------------------------------------------------
// Wallet signer abstraction (chain-specific)
// ---------------------------------------------------------------------------

interface WalletSignerBase {
  readonly chain: ChainKind;
  /** The signing address. For HyperLiquid this is the *agent* address. */
  readonly address: string;
}

/** EIP-712 typed-data payload (domain + types + message). */
export interface Eip712Payload {
  domain: Record<string, unknown>;
  types: Record<string, Array<{ name: string; type: string }>>;
  primaryType: string;
  message: Record<string, unknown>;
}

export interface EvmWalletSigner extends WalletSignerBase {
  readonly chain: 'evm';
  signTypedData(payload: Eip712Payload): Promise<string>; // 0x… signature
}

export interface SolanaWalletSigner extends WalletSignerBase {
  readonly chain: 'solana';
  signMessage(message: Uint8Array): Promise<Uint8Array>;
}

export type WalletSigner = EvmWalletSigner | SolanaWalletSigner;

/** An opaque, exchange-specific unsigned payload produced by `buildOrder`. */
export interface UnsignedPayload {
  readonly exchange: ExchangeName;
  readonly chain: ChainKind;
  /** The raw action the wallet must sign; shape is exchange-specific. */
  readonly action: unknown;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Signer interface
// ---------------------------------------------------------------------------

export interface ExchangeSigner {
  readonly name: ExchangeName;
  readonly chain: ChainKind;

  /** Build the unsigned payload from normalized order params (pure, no I/O). */
  buildOrder(params: OrderParams): UnsignedPayload;

  /** Sign with the wallet and submit to the exchange. */
  signAndSubmit(payload: UnsignedPayload, wallet: WalletSigner): Promise<OrderResult>;

  cancel(params: CancelParams, wallet: WalletSigner): Promise<Result>;

  /** Set leverage and margin mode (cross/isolated) for a symbol. Signed action. */
  updateLeverage(symbol: string, leverage: number, isCross: boolean, wallet?: WalletSigner): Promise<Result>;
}
