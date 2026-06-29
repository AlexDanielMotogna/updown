/**
 * Thin client over HyperLiquid's public `info` endpoint (POST, no auth).
 * One method per request `type` the read adapter needs. `fetch` is injectable
 * so tests can stub it; defaults to the global fetch (Node 18+ / browser).
 */
import type {
  HlAllMids,
  HlCandle,
  HlClearinghouseState,
  HlL2Book,
  HlMeta,
  HlMetaAndAssetCtxs,
  HlOpenOrder,
  HlRecentTrade,
  HlUserFill,
  HlSpotMeta,
  HlSpotMetaAndAssetCtxs,
  HlSpotClearinghouseState,
  HlTokenDetails,
} from './raw-types';

export interface HlEndpoint {
  /** Base API URL, no trailing slash. */
  apiUrl: string;
}

export const MAINNET: HlEndpoint = { apiUrl: 'https://api.hyperliquid.xyz' };
export const TESTNET: HlEndpoint = { apiUrl: 'https://api.hyperliquid-testnet.xyz' };

export type FetchLike = (
  input: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string }
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export interface CandleSnapshotReq {
  coin: string;
  interval: string;
  startTime: number;
  endTime?: number;
}

/** Account abstraction mode (how spot + perps balances interact). `unifiedAccount`
 * shares one balance per asset across spot and perps; `default`/`dexAbstraction`
 * keep them separate (the legacy split). */
export type HlAbstractionMode =
  | 'unifiedAccount'
  | 'portfolioMargin'
  | 'disabled'
  | 'default'
  | 'dexAbstraction';

export class InfoClient {
  constructor(
    private readonly endpoint: HlEndpoint = MAINNET,
    private readonly fetchImpl: FetchLike = fetch as unknown as FetchLike
  ) {}

  private async post<T>(body: Record<string, unknown>): Promise<T> {
    const res = await this.fetchImpl(`${this.endpoint.apiUrl}/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`HyperLiquid info "${String(body.type)}" failed: HTTP ${res.status}`);
    }
    return (await res.json()) as T;
  }

  meta(dex?: string): Promise<HlMeta> {
    return this.post<HlMeta>({ type: 'meta', ...(dex ? { dex } : {}) });
  }

  metaAndAssetCtxs(dex?: string): Promise<HlMetaAndAssetCtxs> {
    return this.post<HlMetaAndAssetCtxs>({ type: 'metaAndAssetCtxs', ...(dex ? { dex } : {}) });
  }

  allMids(dex?: string): Promise<HlAllMids> {
    return this.post<HlAllMids>({ type: 'allMids', ...(dex ? { dex } : {}) });
  }

  /** Returns at most 20 levels per side. nSigFigs in {2,3,4,5,null}. */
  l2Book(coin: string, nSigFigs?: number | null): Promise<HlL2Book> {
    return this.post<HlL2Book>({ type: 'l2Book', coin, nSigFigs: nSigFigs ?? null });
  }

  candleSnapshot(req: CandleSnapshotReq): Promise<HlCandle[]> {
    return this.post<HlCandle[]>({ type: 'candleSnapshot', req });
  }

  recentTrades(coin: string): Promise<HlRecentTrade[]> {
    return this.post<HlRecentTrade[]>({ type: 'recentTrades', coin });
  }

  clearinghouseState(user: string, dex?: string): Promise<HlClearinghouseState> {
    return this.post<HlClearinghouseState>({
      type: 'clearinghouseState',
      user,
      ...(dex ? { dex } : {}),
    });
  }

  openOrders(user: string, dex?: string): Promise<HlOpenOrder[]> {
    return this.post<HlOpenOrder[]>({ type: 'openOrders', user, ...(dex ? { dex } : {}) });
  }

  userFills(user: string): Promise<HlUserFill[]> {
    return this.post<HlUserFill[]>({ type: 'userFills', user });
  }

  /** The account's abstraction mode. */
  userAbstraction(user: string): Promise<HlAbstractionMode> {
    return this.post<HlAbstractionMode>({ type: 'userAbstraction', user });
  }

  // ── Spot ──────────────────────────────────────────────────────────────────

  spotMeta(): Promise<HlSpotMeta> {
    return this.post<HlSpotMeta>({ type: 'spotMeta' });
  }

  spotMetaAndAssetCtxs(): Promise<HlSpotMetaAndAssetCtxs> {
    return this.post<HlSpotMetaAndAssetCtxs>({ type: 'spotMetaAndAssetCtxs' });
  }

  spotClearinghouseState(user: string): Promise<HlSpotClearinghouseState> {
    return this.post<HlSpotClearinghouseState>({ type: 'spotClearinghouseState', user });
  }

  /** Per-token details incl. the token markPx HL's UI uses to value spot holdings
   * (differs from the pair's orderbook mark for illiquid tokens). */
  tokenDetails(tokenId: string): Promise<HlTokenDetails> {
    return this.post<HlTokenDetails>({ type: 'tokenDetails', tokenId });
  }
}
