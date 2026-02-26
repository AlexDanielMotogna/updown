import { PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from '@solana/spl-token';
import { BN } from '@coral-xyz/anchor';
import { getPoolPDA, getVaultPDA, getUserBetPDA } from '../accounts';
import { Side } from '../types';

/**
 * Build initialize pool instruction accounts
 */
export async function buildInitializePoolAccounts(
  poolId: Uint8Array,
  authority: PublicKey,
  usdcMint: PublicKey
) {
  const [pool] = getPoolPDA(poolId);
  const [vault] = getVaultPDA(poolId);

  return {
    pool,
    vault,
    usdcMint,
    authority,
    systemProgram: SystemProgram.programId,
    tokenProgram: TOKEN_PROGRAM_ID,
    rent: SYSVAR_RENT_PUBKEY,
  };
}

/**
 * Build deposit instruction accounts
 */
export async function buildDepositAccounts(
  poolId: Uint8Array,
  pool: PublicKey,
  user: PublicKey,
  usdcMint: PublicKey
) {
  const [userBet] = getUserBetPDA(pool, user);
  const [vault] = getVaultPDA(poolId);
  const userTokenAccount = await getAssociatedTokenAddress(usdcMint, user);

  return {
    pool,
    userBet,
    vault,
    userTokenAccount,
    user,
    tokenProgram: TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
  };
}

/**
 * Build resolve instruction accounts
 */
export function buildResolveAccounts(pool: PublicKey, authority: PublicKey) {
  return {
    pool,
    authority,
  };
}

/**
 * Build claim instruction accounts
 */
export async function buildClaimAccounts(
  poolId: Uint8Array,
  pool: PublicKey,
  user: PublicKey,
  usdcMint: PublicKey
) {
  const [userBet] = getUserBetPDA(pool, user);
  const [vault] = getVaultPDA(poolId);
  const userTokenAccount = await getAssociatedTokenAddress(usdcMint, user);

  return {
    pool,
    userBet,
    vault,
    userTokenAccount,
    user,
    tokenProgram: TOKEN_PROGRAM_ID,
  };
}
