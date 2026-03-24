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
/**
 * Derive UserBet PDA
 */
export declare function getUserBetPDA(pool: PublicKey, user: PublicKey): [PublicKey, number];
//# sourceMappingURL=index.d.ts.map