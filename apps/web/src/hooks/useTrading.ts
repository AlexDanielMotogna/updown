import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { fetchTradingSummary, fetchTradingHistory, fetchTradingPositions } from '@/lib/api';

export const TRADES_PAGE_SIZE = 10;

/** Live open positions from HyperLiquid for the Trading tab. */
export function useTradingPositions(walletAddress?: string) {
  return useQuery({
    queryKey: ['tradingPositions', walletAddress],
    queryFn: () => fetchTradingPositions(walletAddress!),
    enabled: !!walletAddress,
    refetchInterval: 15_000,
    select: (res) => res.data ?? [],
  });
}

/**
 * Trading data for the Profile "Trading" tab — aggregates + fill history from
 * `trade_fills` (HyperLiquid fills persisted by the trading-XP poller), keyed by
 * the same Solana walletAddress as predictions. Mainnet only.
 */
export function useTradingSummary(walletAddress?: string) {
  return useQuery({
    queryKey: ['tradingSummary', walletAddress],
    queryFn: () => fetchTradingSummary(walletAddress!),
    enabled: !!walletAddress,
    refetchInterval: 30_000,
    select: (res) => res.data,
  });
}

/** One page of fill history (offset pagination) + total count. */
export function useTradingHistory(walletAddress?: string, page = 0) {
  return useQuery({
    queryKey: ['tradingHistory', walletAddress, page],
    queryFn: () => fetchTradingHistory(walletAddress!, { page, limit: TRADES_PAGE_SIZE }),
    enabled: !!walletAddress,
    refetchInterval: 30_000,
    placeholderData: keepPreviousData, // keep the old page visible while the next loads
  });
}
