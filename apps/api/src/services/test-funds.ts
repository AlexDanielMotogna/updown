import { PublicKey, LAMPORTS_PER_SOL, SystemProgram } from '@solana/web3.js';
import { getOrCreateAssociatedTokenAccount, mintTo, getMint } from '@solana/spl-token';
import { getConnection, getUsdcMint, getAuthorityKeypair } from '../utils/solana';
import { sendAndConfirm } from '../utils/onchain';
import { prisma } from '../db';

/**
 * Shared test-money mint: gives a wallet devnet test USDC (+ a little SOL for fees).
 * Used by both the manual faucet and the Crypto Predictions one-time auto-fund.
 */
export const TEST_FUNDS_USDC = 1000; // 1,000 test USDC — also the HARD per-wallet cap
export const TEST_FUNDS_SOL = 0.05; // ~10 transactions of gas

/** SOL the authority keeps for itself; it never spends below this on funding. */
export const AUTHORITY_SOL_RESERVE = 0.5;

export interface MintTestFundsResult {
  usdc: number;
  sol: number;
  usdcTx: string | null;
  solTx: string | null;
}

/** Thrown when a wallet has already reached the 1000 test-USDC cap. */
export class TestFundsCapError extends Error {
  constructor(message = 'Wallet has already received the maximum test funds (1000 USDC)') {
    super(message);
    this.name = 'TestFundsCapError';
  }
}

/**
 * Thrown when the authority can't pay for the SOL leg. Funding aborts instead of
 * half-completing: a wallet with USDC but zero SOL cannot bet at all (the gasless
 * deposit needs the wallet to end up rent-exempt), so it is better to leave the
 * user unfunded and retryable than funded and stuck.
 */
export class AuthorityOutOfSolError extends Error {
  constructor(balanceSol: number) {
    super(`Authority is out of SOL (${balanceSol.toFixed(4)} SOL, reserve ${AUTHORITY_SOL_RESERVE}); test funding aborted`);
    this.name = 'AuthorityOutOfSolError';
  }
}

/**
 * Mint test USDC (+SOL) to `walletAddress`, capped at 1000 per wallet FOREVER.
 *
 * Two independent guards make it impossible to mint more than 1000 to any wallet,
 * from any caller (event auto-fund, faucet, future code):
 *   1. One-time claim — atomically flips User.autoFundedAt null→now. A second
 *      attempt (or a concurrent one) finds it set and is refused. This is the
 *      single chokepoint; callers no longer need their own lock.
 *   2. On-chain balance cap — never mints beyond (1000 − current balance), so even
 *      if the claim were ever released after a mint that actually landed, the
 *      wallet can never exceed 1000.
 *
 * The SOL leg runs BEFORE the mint and is mandatory: a wallet holding USDC with no
 * SOL can't bet at all, so when the authority can't cover it the funding aborts
 * (AuthorityOutOfSolError), the claim is released, and the user can retry later.
 */
export async function mintTestFunds(walletAddress: string): Promise<MintTestFundsResult> {
  const target = new PublicKey(walletAddress);
  if (!PublicKey.isOnCurve(target)) throw new Error('Invalid Solana wallet address');

  // Guard 1 — atomic one-time claim. Ensure the row exists, then flip null→now.
  await prisma.user.upsert({ where: { walletAddress }, update: {}, create: { walletAddress } }).catch(() => {});
  const claim = await prisma.user.updateMany({ where: { walletAddress, autoFundedAt: null }, data: { autoFundedAt: new Date() } });
  if (claim.count === 0) throw new TestFundsCapError();

  try {
    const connection = getConnection();
    const authority = getAuthorityKeypair();
    const usdcMint = getUsdcMint();

    const mintInfo = await getMint(connection, usdcMint);
    if (!mintInfo.mintAuthority || !mintInfo.mintAuthority.equals(authority.publicKey)) {
      throw new Error('Server mint authority mismatch');
    }

    // SOL FIRST, and it is mandatory. Gas comes before spending money: if this leg
    // can't run, the whole funding aborts and the claim is released (see catch), so
    // the user retries later and gets both legs. Doing it the other way round is how
    // wallets ended up holding 1000 USDC with 0 SOL and unable to place a single bet.
    // Top up only what's missing so a retry after a partial run stays cheap.
    const targetLamports = Math.round(TEST_FUNDS_SOL * LAMPORTS_PER_SOL);
    const userLamports = await connection.getBalance(target);
    let solTx: string | null = null;
    let sol = 0;
    if (userLamports < targetLamports) {
      const missing = targetLamports - userLamports;
      const authorityBal = await connection.getBalance(authority.publicKey);
      if (authorityBal <= missing + AUTHORITY_SOL_RESERVE * LAMPORTS_PER_SOL) {
        console.error(`[TestFunds] authority out of SOL (${(authorityBal / LAMPORTS_PER_SOL).toFixed(4)}), funding aborted for ${walletAddress}`);
        throw new AuthorityOutOfSolError(authorityBal / LAMPORTS_PER_SOL);
      }
      solTx = await sendAndConfirm(
        SystemProgram.transfer({ fromPubkey: authority.publicKey, toPubkey: target, lamports: missing }),
        authority,
        { label: 'test-funds-sol' },
      );
      sol = missing / LAMPORTS_PER_SOL;
    }

    const ata = await getOrCreateAssociatedTokenAccount(connection, authority, usdcMint, target);
    // Guard 2 — cap by current balance so total held from minting never exceeds 1000.
    // Already at the cap means a previous run minted and then failed before finishing
    // (the claim got released). Don't throw: the SOL leg above is exactly what that
    // run was missing, so let it complete instead of stranding the wallet again.
    const capRaw = BigInt(TEST_FUNDS_USDC) * BigInt(10 ** mintInfo.decimals);
    const balanceRaw = BigInt(ata.amount.toString());
    const amountRaw = balanceRaw >= capRaw ? 0n : capRaw - balanceRaw;
    const usdcTx = amountRaw > 0n
      ? await mintTo(connection, authority, usdcMint, ata.address, authority, amountRaw)
      : null;

    return { usdc: Number(amountRaw) / 10 ** mintInfo.decimals, sol, usdcTx, solTx };
  } catch (e) {
    // Release the one-time claim on a genuine mint failure so a real retry can
    // succeed. A cap hit (guard 2) is NOT released — the wallet already holds the
    // funds, so autoFundedAt must stay set to keep it permanently capped.
    if (!(e instanceof TestFundsCapError)) {
      await prisma.user.updateMany({ where: { walletAddress }, data: { autoFundedAt: null } }).catch(() => {});
    }
    throw e;
  }
}
