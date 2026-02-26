export interface NormalizedPriceTick {
  symbol: string;
  price: bigint;
  timestamp: Date;
  source: string;
  rawHash?: string;
}

export interface PriceSubscription {
  symbol: string;
  callback: (tick: NormalizedPriceTick) => void;
}
