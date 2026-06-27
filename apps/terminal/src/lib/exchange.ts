/**
 * Server-side exchange access for the terminal.
 *
 * Importing 'exchange-hyperliquid' self-registers it with ExchangeProvider, but
 * the default factory uses mainnet; here we honor the configured endpoint
 * (HYPERLIQUID_API_URL / NEXT_PUBLIC_HYPERLIQUID_API_URL → testnet vs mainnet).
 *
 * Keep this module server-only: it pulls the full adapter (incl. the signer/SDK).
 * Client realtime should use a thin stream import, not this.
 */
import 'exchange-hyperliquid';
import {
  HyperliquidReadAdapter,
  MAINNET,
  TESTNET,
  type HlEndpoint,
} from 'exchange-hyperliquid';
import type { Balance, ExchangeReadAdapter } from 'exchange-core';
import type { Ticker } from './types';

export type { Ticker } from './types';

function pctChange(curr: string, prev: string): string {
  const np = Number(prev);
  if (!np) return '0';
  return String(((Number(curr) - np) / np) * 100);
}

export function hlEndpoint(): HlEndpoint {
  // Prefer the PUBLIC url — it's the network the terminal's client uses (stream,
  // orders, IS_TESTNET). A stray server-only HYPERLIQUID_API_URL (e.g. copied
  // from the API service) must NOT override it, or the server read routes
  // (/api/tpsl, /api/orders, /api/markets) query a DIFFERENT network than the
  // user trades on — e.g. reading testnet while orders rest on mainnet.
  const url = process.env.NEXT_PUBLIC_HYPERLIQUID_API_URL ?? process.env.HYPERLIQUID_API_URL;
  if (url) return { apiUrl: url.replace(/\/$/, '') };
  return process.env.NEXT_PUBLIC_HYPERLIQUID_TESTNET === 'true' ? TESTNET : MAINNET;
}

let cached: ExchangeReadAdapter | null = null;

/** Cached HyperLiquid read adapter bound to the configured endpoint. */
export function readAdapter(): ExchangeReadAdapter {
  if (!cached) cached = new HyperliquidReadAdapter({ endpoint: hlEndpoint() });
  return cached;
}

async function computeTickers(): Promise<Ticker[]> {
  const a = readAdapter();
  const [markets, prices] = await Promise.all([a.getMarkets(), a.getPrices()]);
  const lev = new Map(markets.map((m) => [m.symbol, m.maxLeverage]));
  const oi = new Map(markets.map((m) => [m.symbol, String(m.metadata?.openInterest ?? '0')]));
  return prices
    .map((p) => ({
      symbol: p.symbol,
      mark: p.mark,
      index: p.index,
      change24h: p.change24h,
      volume24h: p.volume24h,
      openInterest: oi.get(p.symbol) ?? '0',
      funding: p.funding,
      maxLeverage: lev.get(p.symbol) ?? null,
    }))
    .sort((x, y) => Number(y.volume24h) - Number(x.volume24h));
}

// Short server-side cache: the header, market selector and other pollers all hit
// /api/markets; without this each call fired two large metaAndAssetCtxs fetches.
// In-flight de-dup so concurrent callers share one upstream request.
const TICKERS_TTL_MS = 1500;
let tickersCache: { data: Ticker[]; expires: number } | null = null;
let tickersInFlight: Promise<Ticker[]> | null = null;

/** Normalized tickers (markets ⨝ prices), sorted by 24h volume desc. Cached briefly. */
export async function getTickers(): Promise<Ticker[]> {
  const now = Date.now();
  if (tickersCache && tickersCache.expires > now) return tickersCache.data;
  if (tickersInFlight) return tickersInFlight;
  tickersInFlight = computeTickers()
    .then((data) => {
      tickersCache = { data, expires: Date.now() + TICKERS_TTL_MS };
      return data;
    })
    .finally(() => { tickersInFlight = null; });
  return tickersInFlight;
}

// ── Spot ──────────────────────────────────────────────────────────────────

let spotTickersCache: { data: Ticker[]; expires: number } | null = null;
let spotTickersInFlight: Promise<Ticker[]> | null = null;

async function computeSpotTickers(): Promise<Ticker[]> {
  const a = readAdapter();
  if (!a.getSpotMarkets) return [];
  const markets = await a.getSpotMarkets();
  return markets
    .map((m) => {
      const md = m.metadata ?? {};
      const mark = String(md.markPx ?? md.midPx ?? '0');
      return {
        symbol: m.symbol,
        mark,
        index: mark,
        change24h: pctChange(mark, String(md.prevDayPx ?? '0')),
        volume24h: String(md.dayNtlVlm ?? '0'),
        openInterest: '0',
        funding: '0',
        maxLeverage: null,
        szDecimals: typeof md.szDecimals === 'number' ? md.szDecimals : Number(md.szDecimals ?? 0),
      } as Ticker;
    })
    .filter((t) => Number(t.mark) > 0)
    .sort((x, y) => Number(y.volume24h) - Number(x.volume24h));
}

/** Spot tickers (pairs), sorted by 24h volume desc. Cached briefly. */
export async function getSpotTickers(): Promise<Ticker[]> {
  const now = Date.now();
  if (spotTickersCache && spotTickersCache.expires > now) return spotTickersCache.data;
  if (spotTickersInFlight) return spotTickersInFlight;
  spotTickersInFlight = computeSpotTickers()
    .then((data) => {
      spotTickersCache = { data, expires: Date.now() + TICKERS_TTL_MS };
      return data;
    })
    .finally(() => { spotTickersInFlight = null; });
  return spotTickersInFlight;
}

/** Spot token balances (holdings) for an account address. */
export async function getSpotBalances(accountId: string): Promise<Balance[]> {
  const a = readAdapter();
  if (!a.getSpotBalances) return [];
  return a.getSpotBalances(accountId);
}
