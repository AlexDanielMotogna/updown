import {
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  TransactionInstruction,
} from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { PROGRAM_ID } from '../accounts';

// ── Borsh helpers ──────────────────────────────────────────────────────────────

function encodeString(value: string): Buffer {
  const strBytes = Buffer.from(value, 'utf-8');
  const buf = Buffer.alloc(4 + strBytes.length);
  buf.writeUInt32LE(strBytes.length, 0);
  strBytes.copy(buf, 4);
  return buf;
}

function encodeI64(value: bigint | number): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigInt64LE(BigInt(value));
  return buf;
}

function encodeU64(value: bigint | number): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(value));
  return buf;
}

function encodeU16(value: number): Buffer {
  const buf = Buffer.alloc(2);
  buf.writeUInt16LE(value);
  return buf;
}

// ── Discriminators (from IDL / sha256("global:<instruction_name>")[0..8]) ─────

const INITIALIZE_POOL_DISC = Buffer.from([95, 180, 10, 172, 84, 174, 232, 40]);
const DEPOSIT_DISC = Buffer.from([242, 35, 198, 137, 82, 225, 242, 182]);
const RESOLVE_DISC = Buffer.from([246, 150, 236, 206, 108, 63, 58, 10]);
const RESOLVE_WITH_WINNER_DISC = Buffer.from([200, 87, 85, 170, 63, 238, 116, 50]);
const CLAIM_DISC = Buffer.from([62, 198, 214, 193, 213, 159, 108, 210]);
const REFUND_DISC = Buffer.from([2, 96, 183, 251, 63, 208, 46, 46]);
const CLOSE_POOL_DISC = Buffer.from([140, 189, 209, 23, 239, 62, 239, 11]);

// ── Instruction Builders ───────────────────────────────────────────────────────

/**
 * Build `initializePool` TransactionInstruction.
 * Accounts: pool, vault, usdcMint, authority, systemProgram, tokenProgram, rent
 */
export function buildInitializePoolIx(
  pool: PublicKey,
  vault: PublicKey,
  usdcMint: PublicKey,
  authority: PublicKey,
  poolId: Uint8Array | Buffer,
  asset: string,
  startTime: number | bigint,
  endTime: number | bigint,
  lockTime: number | bigint,
  strikePrice: number | bigint,
  numSides: number = 2,
): TransactionInstruction {
  const data = Buffer.concat([
    INITIALIZE_POOL_DISC,
    Buffer.from(poolId),          // [u8; 32]
    encodeString(asset),          // String (Borsh: len + utf8)
    encodeI64(startTime),         // i64
    encodeI64(endTime),           // i64
    encodeI64(lockTime),          // i64
    encodeU64(strikePrice),       // u64
    Buffer.from([numSides]),      // u8
  ]);

  const keys = [
    { pubkey: pool, isSigner: false, isWritable: true },
    { pubkey: vault, isSigner: false, isWritable: true },
    { pubkey: usdcMint, isSigner: false, isWritable: false },
    { pubkey: authority, isSigner: true, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({ keys, programId: PROGRAM_ID, data });
}

/**
 * Build `deposit` TransactionInstruction.
 * Accounts: pool, userBet, vault, userTokenAccount, user, tokenProgram, systemProgram
 */
export function buildDepositIx(
  pool: PublicKey,
  userBet: PublicKey,
  vault: PublicKey,
  userTokenAccount: PublicKey,
  user: PublicKey,
  side: 0 | 1 | 2, // 0=Up/Home, 1=Down/Away, 2=Draw
  amount: bigint | number,
): TransactionInstruction {
  // Side is a Borsh enum: single byte index
  const data = Buffer.concat([
    DEPOSIT_DISC,
    Buffer.from([side]),          // enum Side { Up=0, Down=1, Draw=2 }
    encodeU64(amount),            // u64
  ]);

  const keys = [
    { pubkey: pool, isSigner: false, isWritable: true },
    { pubkey: userBet, isSigner: false, isWritable: true },
    { pubkey: vault, isSigner: false, isWritable: true },
    { pubkey: userTokenAccount, isSigner: false, isWritable: true },
    { pubkey: user, isSigner: true, isWritable: true },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({ keys, programId: PROGRAM_ID, data });
}

/**
 * Build `resolve` TransactionInstruction (crypto pools — resolve by price).
 * Accounts: pool, authority
 */
export function buildResolveIx(
  pool: PublicKey,
  authority: PublicKey,
  strikePrice: bigint | number,
  finalPrice: bigint | number,
): TransactionInstruction {
  const data = Buffer.concat([
    RESOLVE_DISC,
    encodeU64(strikePrice),       // u64
    encodeU64(finalPrice),        // u64
  ]);

  const keys = [
    { pubkey: pool, isSigner: false, isWritable: true },
    { pubkey: authority, isSigner: true, isWritable: false },
  ];

  return new TransactionInstruction({ keys, programId: PROGRAM_ID, data });
}

/**
 * Build `resolve_with_winner` TransactionInstruction (sports pools — explicit winner).
 * Accounts: pool, authority
 */
export function buildResolveWithWinnerIx(
  pool: PublicKey,
  authority: PublicKey,
  winner: 0 | 1 | 2, // 0=Up/Home, 1=Down/Away, 2=Draw
): TransactionInstruction {
  const data = Buffer.concat([
    RESOLVE_WITH_WINNER_DISC,
    Buffer.from([winner]),        // enum Side { Up=0, Down=1, Draw=2 }
  ]);

  const keys = [
    { pubkey: pool, isSigner: false, isWritable: true },
    { pubkey: authority, isSigner: true, isWritable: false },
  ];

  return new TransactionInstruction({ keys, programId: PROGRAM_ID, data });
}

/**
 * Build `claim` TransactionInstruction (with fee).
 * Accounts: pool, userBet, vault, userTokenAccount, user, authority, feeWallet, tokenProgram
 */
export function buildClaimIx(
  pool: PublicKey,
  userBet: PublicKey,
  vault: PublicKey,
  userTokenAccount: PublicKey,
  user: PublicKey,
  authority: PublicKey,
  feeWallet: PublicKey,
  feeBps: number,
): TransactionInstruction {
  const data = Buffer.concat([
    CLAIM_DISC,
    encodeU16(feeBps),            // u16
  ]);

  const keys = [
    { pubkey: pool, isSigner: false, isWritable: true },
    { pubkey: userBet, isSigner: false, isWritable: true },
    { pubkey: vault, isSigner: false, isWritable: true },
    { pubkey: userTokenAccount, isSigner: false, isWritable: true },
    { pubkey: user, isSigner: true, isWritable: true },
    { pubkey: authority, isSigner: true, isWritable: true },
    { pubkey: feeWallet, isSigner: false, isWritable: true },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({ keys, programId: PROGRAM_ID, data });
}

/**
 * Build `refund` TransactionInstruction (authority-signed, no user signature).
 * Accounts: pool, userBet, vault, userTokenAccount, user (not signer), authority, tokenProgram
 */
export function buildRefundIx(
  pool: PublicKey,
  userBet: PublicKey,
  vault: PublicKey,
  userTokenAccount: PublicKey,
  user: PublicKey,
  authority: PublicKey,
): TransactionInstruction {
  const keys = [
    { pubkey: pool, isSigner: false, isWritable: true },
    { pubkey: userBet, isSigner: false, isWritable: true },
    { pubkey: vault, isSigner: false, isWritable: true },
    { pubkey: userTokenAccount, isSigner: false, isWritable: true },
    { pubkey: user, isSigner: false, isWritable: true },
    { pubkey: authority, isSigner: true, isWritable: true },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({ keys, programId: PROGRAM_ID, data: REFUND_DISC });
}

/**
 * Build `close_pool` TransactionInstruction.
 * Closes a resolved pool + empty vault, reclaiming rent to authority.
 * Accounts: pool, vault, authority, tokenProgram
 */
export function buildClosePoolIx(
  pool: PublicKey,
  vault: PublicKey,
  authority: PublicKey,
): TransactionInstruction {
  const keys = [
    { pubkey: pool, isSigner: false, isWritable: true },
    { pubkey: vault, isSigner: false, isWritable: true },
    { pubkey: authority, isSigner: true, isWritable: true },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({ keys, programId: PROGRAM_ID, data: CLOSE_POOL_DISC });
}

const FORCE_CLOSE_POOL_DISC = Buffer.from([113, 203, 148, 102, 142, 248, 118, 240]);

/**
 * Build `force_close_pool` TransactionInstruction.
 * Closes pool account only (no vault) — for orphan recovery of old pools
 * where vault bump is corrupted from struct layout changes.
 * Accounts: pool, authority
 */
export function buildForceClosePoolIx(
  pool: PublicKey,
  authority: PublicKey,
): TransactionInstruction {
  const keys = [
    { pubkey: pool, isSigner: false, isWritable: true },
    { pubkey: authority, isSigner: true, isWritable: true },
  ];

  return new TransactionInstruction({ keys, programId: PROGRAM_ID, data: FORCE_CLOSE_POOL_DISC });
}

// ── Tournament instruction discriminators ──────────────────────────────────

const INIT_TOURNAMENT_DISC = Buffer.from([75, 218, 86, 80, 49, 127, 155, 186]);
const REGISTER_PARTICIPANT_DISC = Buffer.from([248, 112, 38, 215, 226, 230, 249, 40]);
const CLAIM_TOURNAMENT_PRIZE_DISC = Buffer.from([219, 207, 183, 94, 201, 32, 78, 193]);
const CANCEL_TOURNAMENT_DISC = Buffer.from([249, 227, 133, 5, 9, 142, 29, 122]);
const REFUND_PARTICIPANT_DISC = Buffer.from([149, 166, 93, 207, 122, 167, 154, 218]);
const CLOSE_TOURNAMENT_DISC = Buffer.from([14, 80, 54, 9, 221, 239, 201, 35]);

// ── Tournament instruction builders ────────────────────────────────────────

export function buildInitializeTournamentIx(
  tournament: PublicKey,
  vault: PublicKey,
  usdcMint: PublicKey,
  authority: PublicKey,
  tournamentId: Uint8Array,
  entryFee: bigint | number,
  maxParticipants: number,
): TransactionInstruction {
  const data = Buffer.concat([
    INIT_TOURNAMENT_DISC,
    Buffer.from(tournamentId),             // [u8; 32]
    encodeU64(entryFee),                   // u64
    encodeU16(maxParticipants),            // u16
  ]);

  const keys = [
    { pubkey: tournament, isSigner: false, isWritable: true },
    { pubkey: vault, isSigner: false, isWritable: true },
    { pubkey: usdcMint, isSigner: false, isWritable: false },
    { pubkey: authority, isSigner: true, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({ keys, programId: PROGRAM_ID, data });
}

export function buildRegisterParticipantIx(
  tournament: PublicKey,
  participant: PublicKey,
  vault: PublicKey,
  userTokenAccount: PublicKey,
  user: PublicKey,
): TransactionInstruction {
  const keys = [
    { pubkey: tournament, isSigner: false, isWritable: true },
    { pubkey: participant, isSigner: false, isWritable: true },
    { pubkey: vault, isSigner: false, isWritable: true },
    { pubkey: userTokenAccount, isSigner: false, isWritable: true },
    { pubkey: user, isSigner: true, isWritable: true },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({ keys, programId: PROGRAM_ID, data: REGISTER_PARTICIPANT_DISC });
}

export function buildClaimTournamentPrizeIx(
  tournament: PublicKey,
  participant: PublicKey,
  vault: PublicKey,
  userTokenAccount: PublicKey,
  user: PublicKey,
  authority: PublicKey,
  feeWallet: PublicKey,
): TransactionInstruction {
  const keys = [
    { pubkey: tournament, isSigner: false, isWritable: true },
    { pubkey: participant, isSigner: false, isWritable: true },
    { pubkey: vault, isSigner: false, isWritable: true },
    { pubkey: userTokenAccount, isSigner: false, isWritable: true },
    { pubkey: user, isSigner: true, isWritable: true },
    { pubkey: authority, isSigner: true, isWritable: false },
    { pubkey: feeWallet, isSigner: false, isWritable: true },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({ keys, programId: PROGRAM_ID, data: CLAIM_TOURNAMENT_PRIZE_DISC });
}

export function buildCancelTournamentIx(
  tournament: PublicKey,
  authority: PublicKey,
): TransactionInstruction {
  const keys = [
    { pubkey: tournament, isSigner: false, isWritable: true },
    { pubkey: authority, isSigner: true, isWritable: false },
  ];

  return new TransactionInstruction({ keys, programId: PROGRAM_ID, data: CANCEL_TOURNAMENT_DISC });
}

export function buildRefundParticipantIx(
  tournament: PublicKey,
  participant: PublicKey,
  vault: PublicKey,
  userTokenAccount: PublicKey,
  user: PublicKey,
  authority: PublicKey,
): TransactionInstruction {
  const keys = [
    { pubkey: tournament, isSigner: false, isWritable: true },
    { pubkey: participant, isSigner: false, isWritable: true },
    { pubkey: vault, isSigner: false, isWritable: true },
    { pubkey: userTokenAccount, isSigner: false, isWritable: true },
    { pubkey: user, isSigner: false, isWritable: false },
    { pubkey: authority, isSigner: true, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({ keys, programId: PROGRAM_ID, data: REFUND_PARTICIPANT_DISC });
}

export function buildCloseTournamentIx(
  tournament: PublicKey,
  vault: PublicKey,
  authority: PublicKey,
): TransactionInstruction {
  const keys = [
    { pubkey: tournament, isSigner: false, isWritable: true },
    { pubkey: vault, isSigner: false, isWritable: true },
    { pubkey: authority, isSigner: true, isWritable: true },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({ keys, programId: PROGRAM_ID, data: CLOSE_TOURNAMENT_DISC });
}
