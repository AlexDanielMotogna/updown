import { PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
export declare enum Side {
    Up = 0,
    Down = 1,
    Draw = 2
}
export declare enum PoolStatus {
    Upcoming = 0,
    Joining = 1,
    Active = 2,
    Resolved = 3
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
    totalDraw: BN;
    /** Time-weighted sum on side 0 (UP / HOME). Each deposit adds
     *  amount × multiplier_bps / 10_000 where the multiplier decays
     *  linearly from 1.0 at startTime to WEIGHT_FLOOR_BPS / 10_000 at
     *  lockTime. Used as the denominator in the weighted claim formula. */
    weightedUp: BN;
    weightedDown: BN;
    weightedDraw: BN;
    numSides: number;
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
    /** Time-weighted contribution = sum of (amount_i × multiplier_i)
     *  across every deposit the user made on this side. Used by the
     *  claim instruction to compute the user's share of the losing
     *  pool: `winnings = (weight / pool.weighted_side) × losing_stake`.
     *  Earlier deposits earn fatter weight credit than top-ups near
     *  the lock. */
    weight: BN;
    /** Unix timestamp (seconds) of the FIRST deposit on this account.
     *  Pure analytics; payout uses `weight`. */
    entryTime: BN;
    claimed: boolean;
    bump: number;
}
//# sourceMappingURL=types.d.ts.map