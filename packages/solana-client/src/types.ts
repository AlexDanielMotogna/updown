import { PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';

export enum Side {
  Up = 0,
  Down = 1,
}

export enum PoolStatus {
  Upcoming = 0,
  Joining = 1,
  Active = 2,
  Resolved = 3,
}

export interface PoolAccount {
  poolId: number[];
  asset: string;
  authority: PublicKey;
  usdcMint: PublicKey;
  vault: PublicKey;
  startTime: BN;
  endTime: BN;
  lockTime: BN;
  strikePrice: BN;
  finalPrice: BN;
  totalUp: BN;
  totalDown: BN;
  status: PoolStatus;
  winner: Side | null;
  bump: number;
  vaultBump: number;
}

export interface UserBetAccount {
  pool: PublicKey;
  user: PublicKey;
  side: Side;
  amount: BN;
  claimed: boolean;
  bump: number;
}
