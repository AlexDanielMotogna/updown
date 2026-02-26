export enum PoolStatus {
  UPCOMING = 'UPCOMING',
  JOINING = 'JOINING',
  ACTIVE = 'ACTIVE',
  RESOLVED = 'RESOLVED',
  CLAIMABLE = 'CLAIMABLE',
}

export enum Side {
  UP = 'UP',
  DOWN = 'DOWN',
}

export interface Pool {
  id: string;
  poolId: string;
  asset: string;
  status: PoolStatus;
  startTime: Date;
  endTime: Date;
  lockTime: Date;
  strikePrice: bigint | null;
  finalPrice: bigint | null;
  totalUp: bigint;
  totalDown: bigint;
  winner: Side | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Bet {
  id: string;
  poolId: string;
  userId: string;
  walletAddress: string;
  side: Side;
  amount: bigint;
  depositTx: string | null;
  claimed: boolean;
  claimTx: string | null;
  payoutAmount: bigint | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PriceSnapshot {
  id: string;
  poolId: string;
  type: 'STRIKE' | 'FINAL';
  price: bigint;
  timestamp: Date;
  source: string;
  rawHash: string;
}

export interface NormalizedPriceTick {
  symbol: string;
  price: bigint;
  timestamp: Date;
  source: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
  meta?: {
    page?: number;
    total?: number;
  };
}
