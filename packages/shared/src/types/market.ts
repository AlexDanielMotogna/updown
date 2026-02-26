export interface NormalizedPriceTick {
  symbol: string;
  price: number;
  timestamp: number;
  source: string;
  rawHash?: string;
}

export interface PriceSnapshot {
  id: string;
  poolId: string;
  snapshotType: 'STRIKE' | 'FINAL';
  price: string;
  timestamp: Date;
  source: string;
  rawResponseHash: string | null;
  createdAt: Date;
}

export interface AssetInfo {
  symbol: string;
  name: string;
  decimals: number;
  logoUrl?: string;
}

export const SUPPORTED_ASSETS: AssetInfo[] = [
  { symbol: 'BTC', name: 'Bitcoin', decimals: 8 },
  { symbol: 'ETH', name: 'Ethereum', decimals: 8 },
  { symbol: 'SOL', name: 'Solana', decimals: 8 },
  { symbol: 'AVAX', name: 'Avalanche', decimals: 8 },
  { symbol: 'MATIC', name: 'Polygon', decimals: 8 },
  { symbol: 'ARB', name: 'Arbitrum', decimals: 8 },
  { symbol: 'OP', name: 'Optimism', decimals: 8 },
  { symbol: 'DOGE', name: 'Dogecoin', decimals: 8 },
];
