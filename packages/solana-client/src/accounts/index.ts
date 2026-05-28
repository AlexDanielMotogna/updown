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

/** Pool side label as used across the app / DB. */
export type SideLabel = 'UP' | 'DOWN' | 'DRAW';

/**
 * Map a side label to its on-chain index (UP=0, DOWN=1, DRAW=2) — the single
 * source of truth for the `side` byte used in UserBet PDA seeds and instruction
 * data. Use this everywhere instead of inlining the ternary.
 */
export function sideToIndex(side: SideLabel): 0 | 1 | 2 {
  return side === 'UP' ? 0 : side === 'DOWN' ? 1 : 2;
}

/**
 * Derive UserBet PDA for a given side.
 * The `side` byte (0=Up/Home, 1=Down/Away, 2=Draw) is part of the seeds, so a
 * wallet can hold one independent UserBet account per side (hedge).
 */
export function getUserBetPDA(pool: PublicKey, user: PublicKey, side: number): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('bet'), pool.toBuffer(), user.toBuffer(), Buffer.from([side])],
    PROGRAM_ID
  );
}

// ── Tournament PDAs ──

export function getTournamentPDA(tournamentId: Uint8Array): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('tournament'), tournamentId],
    PROGRAM_ID
  );
}

export function getTournamentVaultPDA(tournamentId: Uint8Array): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('tournament_vault'), tournamentId],
    PROGRAM_ID
  );
}

export function getTournamentParticipantPDA(tournament: PublicKey, user: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('participant'), tournament.toBuffer(), user.toBuffer()],
    PROGRAM_ID
  );
}
