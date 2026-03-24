"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildInitializePoolIx = buildInitializePoolIx;
exports.buildDepositIx = buildDepositIx;
exports.buildResolveIx = buildResolveIx;
exports.buildResolveWithWinnerIx = buildResolveWithWinnerIx;
exports.buildClaimIx = buildClaimIx;
exports.buildRefundIx = buildRefundIx;
exports.buildClosePoolIx = buildClosePoolIx;
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
const accounts_1 = require("../accounts");
// ── Borsh helpers ──────────────────────────────────────────────────────────────
function encodeString(value) {
    const strBytes = Buffer.from(value, 'utf-8');
    const buf = Buffer.alloc(4 + strBytes.length);
    buf.writeUInt32LE(strBytes.length, 0);
    strBytes.copy(buf, 4);
    return buf;
}
function encodeI64(value) {
    const buf = Buffer.alloc(8);
    buf.writeBigInt64LE(BigInt(value));
    return buf;
}
function encodeU64(value) {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64LE(BigInt(value));
    return buf;
}
function encodeU16(value) {
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
function buildInitializePoolIx(pool, vault, usdcMint, authority, poolId, asset, startTime, endTime, lockTime, strikePrice, numSides = 2) {
    const data = Buffer.concat([
        INITIALIZE_POOL_DISC,
        Buffer.from(poolId), // [u8; 32]
        encodeString(asset), // String (Borsh: len + utf8)
        encodeI64(startTime), // i64
        encodeI64(endTime), // i64
        encodeI64(lockTime), // i64
        encodeU64(strikePrice), // u64
        Buffer.from([numSides]), // u8
    ]);
    const keys = [
        { pubkey: pool, isSigner: false, isWritable: true },
        { pubkey: vault, isSigner: false, isWritable: true },
        { pubkey: usdcMint, isSigner: false, isWritable: false },
        { pubkey: authority, isSigner: true, isWritable: true },
        { pubkey: web3_js_1.SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: spl_token_1.TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: web3_js_1.SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ];
    return new web3_js_1.TransactionInstruction({ keys, programId: accounts_1.PROGRAM_ID, data });
}
/**
 * Build `deposit` TransactionInstruction.
 * Accounts: pool, userBet, vault, userTokenAccount, user, tokenProgram, systemProgram
 */
function buildDepositIx(pool, userBet, vault, userTokenAccount, user, side, // 0=Up/Home, 1=Down/Away, 2=Draw
amount) {
    // Side is a Borsh enum: single byte index
    const data = Buffer.concat([
        DEPOSIT_DISC,
        Buffer.from([side]), // enum Side { Up=0, Down=1, Draw=2 }
        encodeU64(amount), // u64
    ]);
    const keys = [
        { pubkey: pool, isSigner: false, isWritable: true },
        { pubkey: userBet, isSigner: false, isWritable: true },
        { pubkey: vault, isSigner: false, isWritable: true },
        { pubkey: userTokenAccount, isSigner: false, isWritable: true },
        { pubkey: user, isSigner: true, isWritable: true },
        { pubkey: spl_token_1.TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: web3_js_1.SystemProgram.programId, isSigner: false, isWritable: false },
    ];
    return new web3_js_1.TransactionInstruction({ keys, programId: accounts_1.PROGRAM_ID, data });
}
/**
 * Build `resolve` TransactionInstruction (crypto pools — resolve by price).
 * Accounts: pool, authority
 */
function buildResolveIx(pool, authority, strikePrice, finalPrice) {
    const data = Buffer.concat([
        RESOLVE_DISC,
        encodeU64(strikePrice), // u64
        encodeU64(finalPrice), // u64
    ]);
    const keys = [
        { pubkey: pool, isSigner: false, isWritable: true },
        { pubkey: authority, isSigner: true, isWritable: false },
    ];
    return new web3_js_1.TransactionInstruction({ keys, programId: accounts_1.PROGRAM_ID, data });
}
/**
 * Build `resolve_with_winner` TransactionInstruction (sports pools — explicit winner).
 * Accounts: pool, authority
 */
function buildResolveWithWinnerIx(pool, authority, winner) {
    const data = Buffer.concat([
        RESOLVE_WITH_WINNER_DISC,
        Buffer.from([winner]), // enum Side { Up=0, Down=1, Draw=2 }
    ]);
    const keys = [
        { pubkey: pool, isSigner: false, isWritable: true },
        { pubkey: authority, isSigner: true, isWritable: false },
    ];
    return new web3_js_1.TransactionInstruction({ keys, programId: accounts_1.PROGRAM_ID, data });
}
/**
 * Build `claim` TransactionInstruction (with fee).
 * Accounts: pool, userBet, vault, userTokenAccount, user, authority, feeWallet, tokenProgram
 */
function buildClaimIx(pool, userBet, vault, userTokenAccount, user, authority, feeWallet, feeBps) {
    const data = Buffer.concat([
        CLAIM_DISC,
        encodeU16(feeBps), // u16
    ]);
    const keys = [
        { pubkey: pool, isSigner: false, isWritable: true },
        { pubkey: userBet, isSigner: false, isWritable: true },
        { pubkey: vault, isSigner: false, isWritable: true },
        { pubkey: userTokenAccount, isSigner: false, isWritable: true },
        { pubkey: user, isSigner: true, isWritable: true },
        { pubkey: authority, isSigner: true, isWritable: true },
        { pubkey: feeWallet, isSigner: false, isWritable: true },
        { pubkey: spl_token_1.TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ];
    return new web3_js_1.TransactionInstruction({ keys, programId: accounts_1.PROGRAM_ID, data });
}
/**
 * Build `refund` TransactionInstruction (authority-signed, no user signature).
 * Accounts: pool, userBet, vault, userTokenAccount, user (not signer), authority, tokenProgram
 */
function buildRefundIx(pool, userBet, vault, userTokenAccount, user, authority) {
    const keys = [
        { pubkey: pool, isSigner: false, isWritable: true },
        { pubkey: userBet, isSigner: false, isWritable: true },
        { pubkey: vault, isSigner: false, isWritable: true },
        { pubkey: userTokenAccount, isSigner: false, isWritable: true },
        { pubkey: user, isSigner: false, isWritable: true },
        { pubkey: authority, isSigner: true, isWritable: true },
        { pubkey: spl_token_1.TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ];
    return new web3_js_1.TransactionInstruction({ keys, programId: accounts_1.PROGRAM_ID, data: REFUND_DISC });
}
/**
 * Build `close_pool` TransactionInstruction.
 * Closes a resolved pool + empty vault, reclaiming rent to authority.
 * Accounts: pool, vault, authority, tokenProgram
 */
function buildClosePoolIx(pool, vault, authority) {
    const keys = [
        { pubkey: pool, isSigner: false, isWritable: true },
        { pubkey: vault, isSigner: false, isWritable: true },
        { pubkey: authority, isSigner: true, isWritable: true },
        { pubkey: spl_token_1.TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ];
    return new web3_js_1.TransactionInstruction({ keys, programId: accounts_1.PROGRAM_ID, data: CLOSE_POOL_DISC });
}
