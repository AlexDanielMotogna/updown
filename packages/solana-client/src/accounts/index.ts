import { Connection, PublicKey } from '@solana/web3.js';
import { Program, AnchorProvider } from '@coral-xyz/anchor';

// Program ID - Devnet deployment
export const PROGRAM_ID = new PublicKey('HnqB6ahdTEGwJ624D6kaeoSxUS2YwNoq1Cn5Kt9KQBTD');

/**
 * Derive Pool PDA
 */
export function getPoolPDA(poolId: Uint8Array): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('pool'), poolId],
    PROGRAM_ID
  );
}

/**
 * Derive Vault PDA
 */
export function getVaultPDA(poolId: Uint8Array): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('vault'), poolId],
    PROGRAM_ID
  );
}

/**
 * Derive UserBet PDA
 */
export function getUserBetPDA(pool: PublicKey, user: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('bet'), pool.toBuffer(), user.toBuffer()],
    PROGRAM_ID
  );
}
