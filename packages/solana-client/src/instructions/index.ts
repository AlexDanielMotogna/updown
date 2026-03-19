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

// ── Discriminators (from IDL) ──────────────────────────────────────────────────

const INITIALIZE_POOL_DISC = Buffer.from([95, 180, 10, 172, 84, 174, 232, 40]);
const DEPOSIT_DISC = Buffer.from([242, 35, 198, 137, 82, 225, 242, 182]);
const RESOLVE_DISC = Buffer.from([246, 150, 236, 206, 108, 63, 58, 10]);
const CLAIM_DISC = Buffer.from([62, 198, 214, 193, 213, 159, 108, 210]);
const REFUND_DISC = Buffer.from([2, 96, 183, 251, 63, 208, 46, 46]);

// ── Instruction Builders ───────────────────────────────────────────────────────

/**
 * Build `initializePool` TransactionInstruction.
 * Accounts order matches IDL: pool, vault, usdcMint, authority, systemProgram, tokenProgram, rent
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
): TransactionInstruction {
  const data = Buffer.concat([
    INITIALIZE_POOL_DISC,
    Buffer.from(poolId),          // [u8; 32]
    encodeString(asset),          // String (Borsh: len + utf8)
    encodeI64(startTime),         // i64
    encodeI64(endTime),           // i64
    encodeI64(lockTime),          // i64
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
 * Accounts order matches IDL: pool, userBet, vault, userTokenAccount, user, tokenProgram, systemProgram
 */
export function buildDepositIx(
  pool: PublicKey,
  userBet: PublicKey,
  vault: PublicKey,
  userTokenAccount: PublicKey,
  user: PublicKey,
  side: 0 | 1, // 0=Up, 1=Down
  amount: bigint | number,
): TransactionInstruction {
  // Side is a Borsh enum: single byte index
  const data = Buffer.concat([
    DEPOSIT_DISC,
    Buffer.from([side]),          // enum Side { Up=0, Down=1 }
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
 * Build `resolve` TransactionInstruction.
 * Accounts order matches IDL: pool, authority
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
 * Build `claim` TransactionInstruction (with fee).
 * Accounts: pool, userBet, vault, userTokenAccount, user, authority, feeWallet, tokenProgram
 * Args: fee_bps (u16)
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
    { pubkey: pool, isSigner: false, isWritable: false },
    { pubkey: userBet, isSigner: false, isWritable: true },
    { pubkey: vault, isSigner: false, isWritable: true },
    { pubkey: userTokenAccount, isSigner: false, isWritable: true },
    { pubkey: user, isSigner: true, isWritable: true },
    { pubkey: authority, isSigner: true, isWritable: false },
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
    { pubkey: pool, isSigner: false, isWritable: false },
    { pubkey: userBet, isSigner: false, isWritable: true },
    { pubkey: vault, isSigner: false, isWritable: true },
    { pubkey: userTokenAccount, isSigner: false, isWritable: true },
    { pubkey: user, isSigner: false, isWritable: false },
    { pubkey: authority, isSigner: true, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({ keys, programId: PROGRAM_ID, data: REFUND_DISC });
}
