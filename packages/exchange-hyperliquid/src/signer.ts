/**
 * HyperliquidSigner — EIP-712 / agent-wallet signing (ADR-003).
 *
 * STUB for Phase 1 step 1 (read adapter only). The next step implements this
 * via a vetted TS SDK (nktkas/hyperliquid): buildOrder → EIP-712 action,
 * signAndSubmit using the agent wallet, cancel, updateLeverage.
 */
import type {
  CancelParams,
  ExchangeSigner,
  OrderParams,
  OrderResult,
  Result,
  UnsignedPayload,
  WalletSigner,
} from 'exchange-core';

const NOT_IMPL = 'HyperliquidSigner not implemented yet (Phase 1 step 2 — EIP-712 agent-wallet)';

export class HyperliquidSigner implements ExchangeSigner {
  readonly name = 'hyperliquid' as const;
  readonly chain = 'evm' as const;

  buildOrder(_params: OrderParams): UnsignedPayload {
    throw new Error(NOT_IMPL);
  }

  signAndSubmit(_payload: UnsignedPayload, _wallet: WalletSigner): Promise<OrderResult> {
    throw new Error(NOT_IMPL);
  }

  cancel(_params: CancelParams, _wallet: WalletSigner): Promise<Result> {
    throw new Error(NOT_IMPL);
  }

  updateLeverage(_symbol: string, _leverage: number, _wallet: WalletSigner): Promise<Result> {
    throw new Error(NOT_IMPL);
  }
}
