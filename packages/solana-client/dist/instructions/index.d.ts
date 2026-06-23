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
 * Build `resolve` TransactionInstruction (crypto pools - resolve by price).
 * Accounts: pool, authority
 */
export declare function buildResolveIx(pool: PublicKey, authority: PublicKey, strikePrice: bigint | number, finalPrice: bigint | number): TransactionInstruction;
/**
 * Build `resolve_with_winner` TransactionInstruction (sports pools - explicit winner).
 * Accounts: pool, authority
 */
export declare function buildResolveWithWinnerIx(pool: PublicKey, authority: PublicKey, winner: 0 | 1 | 2): TransactionInstruction;
/**
 * Build `claim` TransactionInstruction (with fee).
 *
 * `user` is NOT marked as signer on the instruction's account meta - the
 * relaxed claim.rs (user: AccountInfo) only requires authority to sign.
 * The manual-claim path still works because the user wallet is the
 * transaction fee payer, which forces a signature at the runtime level
 * regardless of the per-account isSigner flag. The auto-payout path lets
 * authority pay fees and be the sole signer.
 *
 * Accounts: pool, userBet, vault, userTokenAccount, user, authority, feeWallet, tokenProgram
 */
export declare function buildClaimIx(pool: PublicKey, userBet: PublicKey, vault: PublicKey, userTokenAccount: PublicKey, user: PublicKey, authority: PublicKey, feeWallet: PublicKey, feeBps: number, side: 0 | 1 | 2): TransactionInstruction;
/**
 * Build `refund` TransactionInstruction (authority-signed, no user signature).
 * Accounts: pool, userBet, vault, userTokenAccount, user (not signer), authority, tokenProgram
 */
export declare function buildRefundIx(pool: PublicKey, userBet: PublicKey, vault: PublicKey, userTokenAccount: PublicKey, user: PublicKey, authority: PublicKey, side: 0 | 1 | 2): TransactionInstruction;
/**
 * Build `refund_bettor` TransactionInstruction — VOID refund of a bettor's own
 * stake (any side) for a cancelled/void pool. Same accounts as `refund`.
 * Accounts: pool, userBet, vault, userTokenAccount, user (not signer), authority, tokenProgram
 */
export declare function buildRefundBettorIx(pool: PublicKey, userBet: PublicKey, vault: PublicKey, userTokenAccount: PublicKey, user: PublicKey, authority: PublicKey, side: 0 | 1 | 2): TransactionInstruction;
/**
 * Build `close_losing_bet` TransactionInstruction.
 * Authority-signed close of a LOSING bet's account, returning its rent to the
 * bettor. No USDC transfer. Accounts: pool, userBet, user, authority.
 */
export declare function buildCloseLosingBetIx(pool: PublicKey, userBet: PublicKey, user: PublicKey, authority: PublicKey, side: 0 | 1 | 2): TransactionInstruction;
/**
 * Build `sweep_vault_dust` TransactionInstruction.
 * Authority-signed sweep of rounding dust from a resolved pool's vault to the
 * authority so the vault hits 0 and the pool can be closed. Accounts: pool,
 * vault, authorityTokenAccount, authority, tokenProgram.
 */
export declare function buildSweepVaultDustIx(pool: PublicKey, vault: PublicKey, authorityTokenAccount: PublicKey, authority: PublicKey): TransactionInstruction;
/**
 * Build `close_pool` TransactionInstruction.
 * Closes a resolved pool + empty vault, reclaiming rent to authority.
 * Accounts: pool, vault, authority, tokenProgram
 */
export declare function buildClosePoolIx(pool: PublicKey, vault: PublicKey, authority: PublicKey): TransactionInstruction;
/**
 * Build `force_close_pool` TransactionInstruction.
 * Closes pool account only (no vault) - for orphan recovery of old pools
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