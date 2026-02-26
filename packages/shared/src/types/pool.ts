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
  asset: string;
  interval: string;
  status: PoolStatus;
  startTime: Date;
  endTime: Date;
  joinDeadline: Date;
  strikePrice: string | null;
  finalPrice: string | null;
  winnerSide: Side | null;
  totalUp: string;
  totalDown: string;
  poolPda: string | null;
  vaultPda: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
}

export interface PoolSummary {
  id: string;
  asset: string;
  interval: string;
  status: PoolStatus;
  endTime: Date;
  totalUp: string;
  totalDown: string;
}

export interface PoolDetail extends Pool {
  totalParticipants: number;
  userBet?: UserPoolBet;
}

export interface UserPoolBet {
  side: Side;
  amount: string;
  canClaim: boolean;
  payout: string | null;
}
