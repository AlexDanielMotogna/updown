import { PublicKey, TransactionInstruction } from '@solana/web3.js';
/**
 * Build `initializePool` TransactionInstruction.
 * Accounts: pool, vault, usdcMint, authority, systemProgram, tokenProgram, rent
 */
export declare function buildInitializePoolIx(pool: PublicKey, vault: PublicKey, usdcMint: PublicKey, authority: PublicKey, poolId: Uint8Array | Buffer, asset: string, startTime: number | bigint, endTime: number | bigint, lockTime: number | bigint, strikePrice: number | bigint, numSides?: number): TransactionInstruction;
/**
 * Build `deposit` TransactionInstruction.
 * Accounts: pool, userBet, vault, userTokenAccount, user, tokenProgram, systemProgram
 */
export declare function buildDepositIx(pool: PublicKey, userBet: PublicKey, vault: PublicKey, userTokenAccount: PublicKey, user: PublicKey, side: 0 | 1 | 2, // 0=Up/Home, 1=Down/Away, 2=Draw
amount: bigint | number): TransactionInstruction;
/**
 * Build `resolve` TransactionInstruction (crypto pools — resolve by price).
 * Accounts: pool, authority
 */
export declare function buildResolveIx(pool: PublicKey, authority: PublicKey, strikePrice: bigint | number, finalPrice: bigint | number): TransactionInstruction;
/**
 * Build `resolve_with_winner` TransactionInstruction (sports pools — explicit winner).
 * Accounts: pool, authority
 */
export declare function buildResolveWithWinnerIx(pool: PublicKey, authority: PublicKey, winner: 0 | 1 | 2): TransactionInstruction;
/**
 * Build `claim` TransactionInstruction (with fee).
 * Accounts: pool, userBet, vault, userTokenAccount, user, authority, feeWallet, tokenProgram
 */
export declare function buildClaimIx(pool: PublicKey, userBet: PublicKey, vault: PublicKey, userTokenAccount: PublicKey, user: PublicKey, authority: PublicKey, feeWallet: PublicKey, feeBps: number): TransactionInstruction;
/**
 * Build `refund` TransactionInstruction (authority-signed, no user signature).
 * Accounts: pool, userBet, vault, userTokenAccount, user (not signer), authority, tokenProgram
 */
export declare function buildRefundIx(pool: PublicKey, userBet: PublicKey, vault: PublicKey, userTokenAccount: PublicKey, user: PublicKey, authority: PublicKey): TransactionInstruction;
/**
 * Build `close_pool` TransactionInstruction.
 * Closes a resolved pool + empty vault, reclaiming rent to authority.
 * Accounts: pool, vault, authority, tokenProgram
 */
export declare function buildClosePoolIx(pool: PublicKey, vault: PublicKey, authority: PublicKey): TransactionInstruction;
/**
 * Build `force_close_pool` TransactionInstruction.
 * Closes pool account only (no vault) — for orphan recovery of old pools
 * where vault bump is corrupted from struct layout changes.
 * Accounts: pool, authority
 */
export declare function buildForceClosePoolIx(pool: PublicKey, authority: PublicKey): TransactionInstruction;
export declare function buildInitializeTournamentIx(tournament: PublicKey, vault: PublicKey, usdcMint: PublicKey, authority: PublicKey, tournamentId: Uint8Array, entryFee: bigint | number, maxParticipants: number): TransactionInstruction;
export declare function buildRegisterParticipantIx(tournament: PublicKey, participant: PublicKey, vault: PublicKey, userTokenAccount: PublicKey, user: PublicKey): TransactionInstruction;
export declare function buildClaimTournamentPrizeIx(tournament: PublicKey, participant: PublicKey, vault: PublicKey, userTokenAccount: PublicKey, user: PublicKey, authority: PublicKey, feeWallet: PublicKey): TransactionInstruction;
export declare function buildCancelTournamentIx(tournament: PublicKey, authority: PublicKey): TransactionInstruction;
export declare function buildRefundParticipantIx(tournament: PublicKey, participant: PublicKey, vault: PublicKey, userTokenAccount: PublicKey, user: PublicKey, authority: PublicKey): TransactionInstruction;
export declare function buildCloseTournamentIx(tournament: PublicKey, vault: PublicKey, authority: PublicKey): TransactionInstruction;
//# sourceMappingURL=index.d.ts.map