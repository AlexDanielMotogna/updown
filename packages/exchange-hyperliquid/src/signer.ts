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
// Type-only import: erased at compile time, so it never emits a `require` of the
// ESM-only @nktkas/hyperliquid (the actual module is loaded lazily — see below).
import type { ExchangeClient } from '@nktkas/hyperliquid';
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
   * `feeTenthsBps` is in TENTHS of a basis point (10 = 1 bps = 0.01%); max 100
   * for perps (= 0.1%). The user must first `approveBuilderFee` from their MAIN
   * wallet with maxFeeRate >= feeTenthsBps/1000 percent (e.g. f=50 → 0.05%).
   */
  builder?: { address: `0x${string}`; feeTenthsBps: number };
  /** Override the InfoClient used to resolve asset indices (tests). */
  infoClient?: InfoClient;
  /** Inject a transport (tests). Overrides the default HttpTransport. */
  transport?: ConstructorParameters<typeof ExchangeClient>[0]['transport'];
  /** Inject the SDK module loader. Defaults to a real dynamic import; tests pass
   * `() => import('@nktkas/hyperliquid')` (the Function-based import the default
   * uses isn't supported inside vitest's VM). */
  sdkLoader?: () => Promise<typeof import('@nktkas/hyperliquid')>;
}

interface AssetInfo {
  index: number;
  szDecimals: number;
}

/** Default slippage cap for market-type orders (±5%, crossing the book). */
const DEFAULT_SLIPPAGE = 0.05;

/** Resolve a max-slippage percent (e.g. 8) to a fraction, clamped to (0, 0.5]. */
function slippageFraction(maxSlippagePct?: number): number {
  if (maxSlippagePct == null || !Number.isFinite(maxSlippagePct) || maxSlippagePct <= 0) return DEFAULT_SLIPPAGE;
  return Math.min(maxSlippagePct / 100, 0.5);
}

/** A worst-acceptable price `ref` crossed in the fill direction (buy up, sell down). */
function crossPrice(ref: number, side: OrderParams['side'], slip: number): string {
  return String(ref * (side === 'BUY' ? 1 + slip : 1 - slip));
}

/**
 * Process-wide asset-map cache keyed by endpoint URL. The HL universe (asset
 * index + szDecimals) is effectively static, but a fresh signer is built per
 * request — without this, every order/leverage/cancel re-fetched the whole
 * universe `meta` before signing. TTL keeps it fresh enough for new listings.
 */
const ASSET_MAP_CACHE = new Map<string, { map: Map<string, AssetInfo>; expires: number }>();
const ASSET_MAP_TTL_MS = 10 * 60 * 1000;

// A genuine ESM dynamic import that survives tsc's CommonJS down-leveling. With
// `module: commonjs`, a plain `await import()` is rewritten to `require()`, which
// throws ERR_REQUIRE_ESM for @nktkas/hyperliquid (it pulls ESM-only @noble/hashes).
// Hiding it in a Function keeps a real runtime `import()` — Node can import ESM
// from CJS that way. Browser/Next bundlers are unaffected (they bundle the SDK).
// eslint-disable-next-line @typescript-eslint/no-implied-eval
const esmImport = new Function('s', 'return import(s)') as (s: string) => Promise<typeof import('@nktkas/hyperliquid')>;

export class HyperliquidSigner implements ExchangeSigner {
  readonly name = 'hyperliquid' as const;
  readonly chain = 'evm' as const;

  private readonly info: InfoClient;
  private readonly apiUrl: string;
  private readonly endpoint: HlEndpoint;
  private readonly account: AgentAccount | null;
  private readonly transportOverride?: HyperliquidSignerOptions['transport'];
  private readonly builder?: { address: `0x${string}`; feeTenthsBps: number };
  private readonly sdkLoader: () => Promise<typeof import('@nktkas/hyperliquid')>;
  private clientPromise?: Promise<ExchangeClient>;

  constructor(opts: HyperliquidSignerOptions = {}) {
    const endpoint = opts.endpoint ?? MAINNET;
    this.endpoint = endpoint;
    this.info = opts.infoClient ?? new InfoClient(endpoint);
    this.apiUrl = endpoint.apiUrl;
    this.builder = opts.builder;
    // viem/accounts is CJS-safe, so the account can be built eagerly.
    this.account = opts.account ?? (opts.privateKey ? privateKeyToAccount(opts.privateKey) : null);
    this.transportOverride = opts.transport;
    this.sdkLoader = opts.sdkLoader ?? (() => esmImport('@nktkas/hyperliquid'));
  }

  /** Lazily build (and cache) the SDK client, loading @nktkas/hyperliquid via a
   * real dynamic import so the ESM-only dep doesn't break CommonJS consumers. */
  private async getClient(): Promise<ExchangeClient> {
    if (!this.clientPromise) this.clientPromise = this.buildClient();
    return this.clientPromise;
  }

  private async buildClient(): Promise<ExchangeClient> {
    if (!this.account && !this.transportOverride) {
      throw new Error('HyperliquidSigner has no account — construct with { privateKey } or { account }');
    }
    const sdk = await this.sdkLoader();
    const transport =
      this.transportOverride ?? new sdk.HttpTransport({ isTestnet: this.endpoint.apiUrl.includes('testnet') });
    return new sdk.ExchangeClient({ transport, wallet: this.account as AgentAccount });
  }

  buildOrder(params: OrderParams): UnsignedPayload {
    return { exchange: 'hyperliquid', chain: 'evm', action: { kind: 'order', params } };
  }

  /** Resolve a price cap (for MARKET / trigger-market when none was passed) and
   * build the HL order request. Shared by single + grouped submits. */
  private async prepareOrder(params: OrderParams) {
    let p = params;
    // Market-type orders still need a price on HL (a slippage cap, crossing the
    // book in the fill direction) when the caller didn't pass one:
    //   - plain MARKET → cap off the current mid
    //   - trigger-market (STOP_MARKET / TAKE_PROFIT_MARKET) → cap off the trigger
    //     price, so it fills once triggered regardless of how far the trigger is.
    if (p.price == null) {
      const slip = slippageFraction(p.maxSlippagePct);
      if (p.type === 'MARKET') {
        p = { ...p, price: await this.marketSlippagePrice(p.symbol, p.side, slip) };
      } else if (p.type === 'STOP_MARKET' || p.type === 'TAKE_PROFIT_MARKET') {
        if (p.triggerPrice == null) throw new Error(`${p.type} requires triggerPrice`);
        p = { ...p, price: crossPrice(Number(p.triggerPrice), p.side, slip) };
      }
    }
    const asset = await this.resolveAsset(p.symbol);
    return buildOrderRequest(p, asset.index, asset.szDecimals);
  }

  /** Lowercase `b` so it's byte-identical to the (lowercased) approved builder —
   * HL matches the approval by exact address, not checksum-insensitively. */
  private builderField() {
    return this.builder ? { b: this.builder.address.toLowerCase() as `0x${string}`, f: this.builder.feeTenthsBps } : undefined;
  }

  async signAndSubmit(payload: UnsignedPayload, _wallet?: WalletSigner): Promise<OrderResult> {
    const client = await this.getClient();
    const params = (payload.action as { params: OrderParams }).params;
    const order = await this.prepareOrder(params);
    const builder = this.builderField();
    const res = await client.order({ orders: [order], grouping: 'na', ...(builder ? { builder } : {}) });
    return mapOrderResult(res);
  }

  /**
   * Submit several orders as ONE HyperLiquid group. With `grouping: 'positionTpsl'`
   * the TP/SL are tied to the live position: HL makes them OCO (one fills → the
   * other auto-cancels) AND cancels them when the position closes — so they never
   * linger to attach to the next position on that coin. Returns a per-order result
   * (does not throw on a single rejected leg).
   */
  async signAndSubmitGroup(
    paramsList: OrderParams[],
    grouping: 'na' | 'normalTpsl' | 'positionTpsl',
  ): Promise<GroupOrderResult[]> {
    if (paramsList.length === 0) return [];
    const client = await this.getClient();
    const orders = [];
    for (const params of paramsList) orders.push(await this.prepareOrder(params));
    const builder = this.builderField();
    const res = await client.order({ orders, grouping, ...(builder ? { builder } : {}) });
    return mapGroupResults(res, orders.length);
  }

  async cancel(params: CancelParams, _wallet?: WalletSigner): Promise<Result> {
    const client = await this.getClient();
    const asset = await this.resolveAsset(params.symbol);
    try {
      await client.cancel({ cancels: [{ a: asset.index, o: Number(params.orderId) }] });
    } catch (e) {
      // An order that's already gone (canceled/filled/never-placed) is NOT a real
      // failure — e.g. a positionTpsl leg HL auto-canceled when the position closed.
      // Treat it as success so the app doesn't surface a spurious 502.
      const msg = (e as Error)?.message ?? '';
      if (/never placed|already cancel|already filled|filled|missing order|was never|not found/i.test(msg)) {
        return { success: true };
      }
      throw e;
    }
    return { success: true };
  }

  async updateLeverage(symbol: string, leverage: number, isCross = true, _wallet?: WalletSigner): Promise<Result> {
    const client = await this.getClient();
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
    const client = await this.getClient();
    await client.approveAgent({ agentAddress, agentName: agentName ?? null });
    return { success: true };
  }

  /**
   * One-time `approveBuilderFee`: authorize a builder to charge up to
   * `maxFeeRate` (a percent string like "0.05%"). Must be signed by the MAIN
   * account before any builder-fee orders are accepted. HL-specific.
   */
  async approveBuilderFee(maxFeeRate: string, builderAddress?: `0x${string}`): Promise<Result> {
    const client = await this.getClient();
    const builder = builderAddress ?? this.builder?.address;
    if (!builder) throw new Error('approveBuilderFee: no builder address (pass one or set opts.builder)');
    await client.approveBuilderFee({ maxFeeRate, builder });
    return { success: true };
  }

  /** A slippage-capped price for a MARKET order, from the current mid (±5%). */
  private async marketSlippagePrice(symbol: string, side: OrderParams['side'], slip: number): Promise<string> {
    const coin = toHlCoin(symbol);
    // REST /info allMids returns a flat { coin: price } map; the WS feed wraps it
    // as { mids: {...} }. Handle both.
    const resp = (await this.info.allMids()) as unknown as Record<string, unknown>;
    const mids = ((resp.mids as Record<string, string>) ?? resp) as Record<string, string>;
    const mid = Number(mids[coin]);
    if (!mid) throw new Error(`No mid price for ${coin}`);
    return crossPrice(mid, side, slip);
  }

  private async resolveAsset(symbol: string): Promise<AssetInfo> {
    const map = await this.assetMap();
    const coin = toHlCoin(symbol);
    const info = map.get(coin);
    if (!info) throw new Error(`Unknown HyperLiquid asset: ${coin}`);
    return info;
  }

  /** Cached (per-endpoint, TTL) asset index + szDecimals map. */
  private async assetMap(): Promise<Map<string, AssetInfo>> {
    const now = Date.now();
    const hit = ASSET_MAP_CACHE.get(this.apiUrl);
    if (hit && hit.expires > now) return hit.map;
    const meta = await this.info.meta();
    const map = new Map<string, AssetInfo>(
      meta.universe.map((a, i) => [a.name, { index: i, szDecimals: a.szDecimals }])
    );
    ASSET_MAP_CACHE.set(this.apiUrl, { map, expires: now + ASSET_MAP_TTL_MS });
    return map;
  }
}

interface OrderStatusEntry {
  resting?: { oid: number };
  filled?: { oid: number; avgPx?: string; totalSz?: string };
  error?: string;
}

interface OrderApiResponse {
  // HL also returns plain-string statuses for trigger/queued orders.
  response: { data: { statuses: (OrderStatusEntry | string)[] } };
}

export interface GroupOrderResult {
  success: boolean;
  orderId?: number;
  status?: OrderStatus;
  error?: string;
}

/** Map each status of a grouped order response, tolerant of per-leg errors. */
function mapGroupResults(res: unknown, count: number): GroupOrderResult[] {
  const statuses = (res as OrderApiResponse).response?.data?.statuses ?? [];
  const out: GroupOrderResult[] = [];
  for (let i = 0; i < count; i++) {
    const s = statuses[i];
    if (s == null) { out.push({ success: false, error: 'no status returned' }); continue; }
    // Trigger / queued orders come back as the plain strings "waitingForTrigger"
    // or "waitingForFill" — both mean accepted (no oid yet), NOT an error.
    if (typeof s === 'string') { out.push({ success: true, status: 'OPEN' as OrderStatus }); continue; }
    if (s.error) { out.push({ success: false, error: s.error }); continue; }
    if (s.resting) { out.push({ success: true, orderId: s.resting.oid, status: 'OPEN' as OrderStatus }); continue; }
    if (s.filled) { out.push({ success: true, orderId: s.filled.oid, status: 'FILLED' as OrderStatus }); continue; }
    out.push({ success: false, error: 'unrecognized status' });
  }
  return out;
}

function mapOrderResult(res: unknown): OrderResult {
  const status = (res as OrderApiResponse).response?.data?.statuses?.[0];
  if (status == null) throw new Error('HyperLiquid order: empty status in response');
  // Trigger / queued orders → "waitingForTrigger" / "waitingForFill" (accepted).
  if (typeof status === 'string') {
    return { orderId: 0, status: 'OPEN' as OrderStatus, metadata: { status } };
  }
  if (status.error) throw new Error(`HyperLiquid order rejected: ${status.error}`);
  if (status.resting) {
    return { orderId: status.resting.oid, status: 'OPEN' as OrderStatus, metadata: { ...status } };
  }
  if (status.filled) {
    return { orderId: status.filled.oid, status: 'FILLED' as OrderStatus, metadata: { ...status } };
  }
  throw new Error(`HyperLiquid order: unrecognized status ${JSON.stringify(status)}`);
}
