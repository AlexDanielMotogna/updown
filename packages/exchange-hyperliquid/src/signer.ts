/**
 * HyperliquidSigner — EIP-712 / agent-wallet signing (ADR-003), backed by the
 * vetted @nktkas/hyperliquid SDK (the HL docs warn strongly against hand-rolling
 * the msgpack/EIP-712 signing; the SDK does it correctly).
 *
 * The signing wallet (an agent key, per ADR-003) is bound at construction — HL
 * orders are signed by the agent key the app holds, not via a per-order browser
 * popup. The `wallet` param on the interface methods is therefore unused here
 * (kept for contract compatibility / other chains); pass the agent account/key
 * to the constructor instead.
 */
import { ExchangeClient, HttpTransport } from '@nktkas/hyperliquid';
import { privateKeyToAccount } from 'viem/accounts';
import type {
  CancelParams,
  ExchangeSigner,
  OrderParams,
  OrderResult,
  OrderStatus,
  Result,
  UnsignedPayload,
  WalletSigner,
} from 'exchange-core';
import { buildOrderRequest } from './formatting';
import { InfoClient, MAINNET, type HlEndpoint } from './info-client';
import { toHlCoin } from './symbols';

/** A viem local account (privateKeyToAccount output) or compatible signer. */
export type AgentAccount = ReturnType<typeof privateKeyToAccount>;

export interface HyperliquidSignerOptions {
  /** Agent private key (0x…). Mutually exclusive with `account`. */
  privateKey?: `0x${string}`;
  /** A preconstructed viem/ethers account (e.g. from a browser wallet). */
  account?: AgentAccount;
  /** Endpoint; testnet is inferred from the URL. Defaults to mainnet. */
  endpoint?: HlEndpoint;
  /**
   * Optional builder code: orders include a builder fee paid to `address`.
   * `feeTenthsBps` is in 0.1bps (1 = 0.0001%); max 100 for perps (0.1%).
   * Requires a one-time `approveBuilderFee` from the signing account first.
   */
  builder?: { address: `0x${string}`; feeTenthsBps: number };
  /** Override the InfoClient used to resolve asset indices (tests). */
  infoClient?: InfoClient;
  /** Inject a transport (tests). Overrides the default HttpTransport. */
  transport?: ConstructorParameters<typeof ExchangeClient>[0]['transport'];
}

interface AssetInfo {
  index: number;
  szDecimals: number;
}

export class HyperliquidSigner implements ExchangeSigner {
  readonly name = 'hyperliquid' as const;
  readonly chain = 'evm' as const;

  private readonly client: ExchangeClient | null;
  private readonly info: InfoClient;
  private readonly builder?: { address: `0x${string}`; feeTenthsBps: number };
  private assetMap?: Map<string, AssetInfo>;

  constructor(opts: HyperliquidSignerOptions = {}) {
    const endpoint = opts.endpoint ?? MAINNET;
    this.info = opts.infoClient ?? new InfoClient(endpoint);
    this.builder = opts.builder;

    const account = opts.account ?? (opts.privateKey ? privateKeyToAccount(opts.privateKey) : null);
    if (account || opts.transport) {
      const transport =
        opts.transport ?? new HttpTransport({ isTestnet: endpoint.apiUrl.includes('testnet') });
      this.client = new ExchangeClient({ transport, wallet: account as AgentAccount });
    } else {
      this.client = null;
    }
  }

  buildOrder(params: OrderParams): UnsignedPayload {
    return { exchange: 'hyperliquid', chain: 'evm', action: { kind: 'order', params } };
  }

  async signAndSubmit(payload: UnsignedPayload, _wallet?: WalletSigner): Promise<OrderResult> {
    const client = this.requireClient();
    let params = (payload.action as { params: OrderParams }).params;
    // MARKET orders still need a price on HL (a slippage cap). Derive one from
    // the current mid (±5%, crossing the spread) when the caller didn't pass one.
    if (params.type === 'MARKET' && params.price == null) {
      params = { ...params, price: await this.marketSlippagePrice(params.symbol, params.side) };
    }
    const asset = await this.resolveAsset(params.symbol);
    const order = buildOrderRequest(params, asset.index, asset.szDecimals);
    const builder = this.builder
      ? { b: this.builder.address, f: this.builder.feeTenthsBps }
      : undefined;
    const res = await client.order({ orders: [order], grouping: 'na', ...(builder ? { builder } : {}) });
    return mapOrderResult(res);
  }

  async cancel(params: CancelParams, _wallet?: WalletSigner): Promise<Result> {
    const client = this.requireClient();
    const asset = await this.resolveAsset(params.symbol);
    await client.cancel({ cancels: [{ a: asset.index, o: Number(params.orderId) }] });
    return { success: true };
  }

  async updateLeverage(symbol: string, leverage: number, isCross = true, _wallet?: WalletSigner): Promise<Result> {
    const client = this.requireClient();
    const asset = await this.resolveAsset(symbol);
    await client.updateLeverage({ asset: asset.index, isCross, leverage });
    return { success: true };
  }

  /**
   * One-time `approveAgent` (ADR-003): authorize `agentAddress` to sign on behalf
   * of the configured account. Sign with the MAIN account, then construct future
   * signers with the agent key. Not part of ExchangeSigner — HL-specific.
   */
  async approveAgent(agentAddress: `0x${string}`, agentName?: string): Promise<Result> {
    const client = this.requireClient();
    await client.approveAgent({ agentAddress, agentName: agentName ?? null });
    return { success: true };
  }

  /**
   * One-time `approveBuilderFee`: authorize a builder to charge up to
   * `maxFeeRate` (a percent string like "0.05%"). Must be signed by the MAIN
   * account before any builder-fee orders are accepted. HL-specific.
   */
  async approveBuilderFee(maxFeeRate: string, builderAddress?: `0x${string}`): Promise<Result> {
    const client = this.requireClient();
    const builder = builderAddress ?? this.builder?.address;
    if (!builder) throw new Error('approveBuilderFee: no builder address (pass one or set opts.builder)');
    await client.approveBuilderFee({ maxFeeRate, builder });
    return { success: true };
  }

  private requireClient(): ExchangeClient {
    if (!this.client) {
      throw new Error('HyperliquidSigner has no account — construct with { privateKey } or { account }');
    }
    return this.client;
  }

  /** A slippage-capped price for a MARKET order, from the current mid (±5%). */
  private async marketSlippagePrice(symbol: string, side: OrderParams['side']): Promise<string> {
    const coin = toHlCoin(symbol);
    // REST /info allMids returns a flat { coin: price } map; the WS feed wraps it
    // as { mids: {...} }. Handle both.
    const resp = (await this.info.allMids()) as unknown as Record<string, unknown>;
    const mids = ((resp.mids as Record<string, string>) ?? resp) as Record<string, string>;
    const mid = Number(mids[coin]);
    if (!mid) throw new Error(`No mid price for ${coin}`);
    return String(mid * (side === 'BUY' ? 1.05 : 0.95));
  }

  private async resolveAsset(symbol: string): Promise<AssetInfo> {
    if (!this.assetMap) {
      const meta = await this.info.meta();
      this.assetMap = new Map(
        meta.universe.map((a, i) => [a.name, { index: i, szDecimals: a.szDecimals }])
      );
    }
    const coin = toHlCoin(symbol);
    const info = this.assetMap.get(coin);
    if (!info) throw new Error(`Unknown HyperLiquid asset: ${coin}`);
    return info;
  }
}

interface OrderStatusEntry {
  resting?: { oid: number };
  filled?: { oid: number; avgPx?: string; totalSz?: string };
  error?: string;
}

interface OrderApiResponse {
  response: { data: { statuses: OrderStatusEntry[] } };
}

function mapOrderResult(res: unknown): OrderResult {
  const status = (res as OrderApiResponse).response?.data?.statuses?.[0];
  if (!status) throw new Error('HyperLiquid order: empty status in response');
  if (status.error) throw new Error(`HyperLiquid order rejected: ${status.error}`);
  if (status.resting) {
    return { orderId: status.resting.oid, status: 'OPEN' as OrderStatus, metadata: { ...status } };
  }
  if (status.filled) {
    return { orderId: status.filled.oid, status: 'FILLED' as OrderStatus, metadata: { ...status } };
  }
  throw new Error(`HyperLiquid order: unrecognized status ${JSON.stringify(status)}`);
}
