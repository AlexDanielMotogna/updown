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

export interface MintTestFundsResult {
  usdc: number;
  sol: number;
  usdcTx: string;
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

    const ata = await getOrCreateAssociatedTokenAccount(connection, authority, usdcMint, target);
    // Guard 2 — cap by current balance so total held from minting never exceeds 1000.
    const capRaw = BigInt(TEST_FUNDS_USDC) * BigInt(10 ** mintInfo.decimals);
    const balanceRaw = BigInt(ata.amount.toString());
    if (balanceRaw >= capRaw) throw new TestFundsCapError('Wallet already at the 1000 test-USDC cap');
    const amountRaw = capRaw - balanceRaw;
    const usdcTx = await mintTo(connection, authority, usdcMint, ata.address, authority, amountRaw);

  // SOL for fees — best-effort, keep a 0.5 SOL reserve on the authority.
  let solTx: string | null = null;
  let sol = 0;
  try {
    const lamports = Math.round(TEST_FUNDS_SOL * LAMPORTS_PER_SOL);
    const bal = await connection.getBalance(authority.publicKey);
    if (bal > lamports + 0.5 * LAMPORTS_PER_SOL) {
      solTx = await sendAndConfirm(
        SystemProgram.transfer({ fromPubkey: authority.publicKey, toPubkey: target, lamports }),
        authority,
        { label: 'test-funds-sol' },
      );
      sol = TEST_FUNDS_SOL;
    } else {
      console.warn('[TestFunds] SOL transfer skipped: authority balance too low');
    }
  } catch (e) {
    console.warn('[TestFunds] SOL transfer failed:', e instanceof Error ? e.message : e);
  }

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
