import { PublicKey } from '@solana/web3.js';
export declare const PROGRAM_ID: PublicKey;
/**
 * Derive Pool PDA
 */
export declare function getPoolPDA(poolId: Uint8Array): [PublicKey, number];
/**
 * Derive Vault PDA
 */
export declare function getVaultPDA(poolId: Uint8Array): [PublicKey, number];
/** Pool side label as used across the app / DB. */
export type SideLabel = 'UP' | 'DOWN' | 'DRAW';
/**
 * Map a side label to its on-chain index (UP=0, DOWN=1, DRAW=2) - the single
 * source of truth for the `side` byte used in UserBet PDA seeds and instruction
 * data. Use this everywhere instead of inlining the ternary.
 */
export declare function sideToIndex(side: SideLabel): 0 | 1 | 2;
/**
 * Derive UserBet PDA for a given side.
 * The `side` byte (0=Up/Home, 1=Down/Away, 2=Draw) is part of the seeds, so a
 * wallet can hold one independent UserBet account per side (hedge).
 */
export declare function getUserBetPDA(pool: PublicKey, user: PublicKey, side: number): [PublicKey, number];
export declare function getTournamentPDA(tournamentId: Uint8Array): [PublicKey, number];
export declare function getTournamentVaultPDA(tournamentId: Uint8Array): [PublicKey, number];
export declare function getTournamentParticipantPDA(tournament: PublicKey, user: PublicKey): [PublicKey, number];
//# sourceMappingURL=index.d.ts.map