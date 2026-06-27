import type { BridgeAdapter, BridgeChain, BridgeQuote, BridgeQuoteRequest } from 'bridge-core';

/**
 * LI.FI bridge adapter (quote-only for phase 1).
 *
 * Hits the public li.quest API to price a Solana USDC → Arbitrum USDC transfer.
 * The spike (ADR-004 §11) confirmed: user pays gas only on Solana (~$0.01), zero
 * Arbitrum gas, ~0.3% all-in, best route ~2s. The raw route is returned so a
 * later execute step can submit it.
 */

const LIFI_BASE = 'https://li.quest/v1';

/** LI.FI numeric chain ids. */
const CHAIN_ID: Record<BridgeChain, number> = {
  solana: 1151111081099710,
  arbitrum: 42161,
};

/** Default USDC token addresses per chain (mainnet). */
const USDC: Record<BridgeChain, string> = {
  // Native USDC mint on Solana mainnet.
  solana: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  // Native (Circle) USDC on Arbitrum One.
  arbitrum: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
};

interface LifiCost {
  amountUSD?: string;
}
interface LifiQuoteResponse {
  tool?: string;
  estimate?: {
    fromAmount?: string;
    toAmount?: string;
    toAmountMin?: string;
    executionDuration?: number;
    feeCosts?: LifiCost[];
    gasCosts?: LifiCost[];
  };
}

function sumUsd(costs?: LifiCost[]): string {
  if (!costs?.length) return '0';
  const total = costs.reduce((acc, c) => acc + (Number(c.amountUSD) || 0), 0);
  return total.toFixed(4);
}

export interface LifiBridgeOptions {
  /** Optional LI.FI partner API key (sent as x-lifi-api-key). */
  apiKey?: string;
  /** Integrator string for attribution / fee config. */
  integrator?: string;
  fetchImpl?: typeof fetch;
}

export class LifiBridgeAdapter implements BridgeAdapter {
  readonly provider = 'lifi';
  private readonly apiKey?: string;
  private readonly integrator: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: LifiBridgeOptions = {}) {
    this.apiKey = opts.apiKey;
    this.integrator = opts.integrator ?? 'updown';
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async quote(req: BridgeQuoteRequest): Promise<BridgeQuote> {
    const params = new URLSearchParams({
      fromChain: String(CHAIN_ID[req.fromChain]),
      toChain: String(CHAIN_ID[req.toChain]),
      fromToken: req.fromToken ?? USDC[req.fromChain],
      toToken: req.toToken ?? USDC[req.toChain],
      fromAmount: req.amount,
      fromAddress: req.fromAddress,
      toAddress: req.toAddress,
      integrator: this.integrator,
    });
    if (req.slippage != null) params.set('slippage', String(req.slippage));

    const headers: Record<string, string> = { accept: 'application/json' };
    if (this.apiKey) headers['x-lifi-api-key'] = this.apiKey;

    const res = await this.fetchImpl(`${LIFI_BASE}/quote?${params.toString()}`, { headers });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`LI.FI quote failed (${res.status}): ${body.slice(0, 300)}`);
    }
    const data = (await res.json()) as LifiQuoteResponse;
    const est = data.estimate ?? {};

    return {
      provider: this.provider,
      tool: data.tool ?? 'unknown',
      fromAmount: est.fromAmount ?? req.amount,
      toAmount: est.toAmount ?? '0',
      toAmountMin: est.toAmountMin ?? '0',
      feeUsd: sumUsd(est.feeCosts),
      gasUsd: sumUsd(est.gasCosts),
      durationSeconds: est.executionDuration ?? 0,
      raw: data,
      metadata: {},
    };
  }
}

export { CHAIN_ID as LIFI_CHAIN_ID, USDC as LIFI_USDC };
