import { Side } from './pool';

export interface Bet {
  id: string;
  poolId: string;
  walletAddress: string;
  side: Side;
  amount: string;
  depositTx: string | null;
  depositConfirmed: boolean;
  createdAt: Date;
}

export interface BetWithPool extends Bet {
  pool: {
    asset: string;
    interval: string;
    status: string;
    endTime: Date;
    winnerSide: Side | null;
  };
}

export interface Claim {
  id: string;
  betId: string;
  poolId: string;
  walletAddress: string;
  payoutAmount: string;
  claimTx: string | null;
  claimedAt: Date;
}

export interface ClaimablePool {
  poolId: string;
  asset: string;
  interval: string;
  userStake: string;
  estimatedPayout: string;
  winnerSide: Side;
  resolvedAt: Date;
}
