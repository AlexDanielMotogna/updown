import { useQuery } from '@tanstack/react-query';
import { fetchTradingSummary, fetchTradingHistory } from '@/lib/api';

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

export function useTradingHistory(walletAddress?: string) {
  return useQuery({
    queryKey: ['tradingHistory', walletAddress],
    queryFn: () => fetchTradingHistory(walletAddress!, { limit: 100 }),
    enabled: !!walletAddress,
    refetchInterval: 30_000,
    select: (res) => res.data ?? [],
  });
}
