import { PublicKey, LAMPORTS_PER_SOL, SystemProgram } from '@solana/web3.js';
import { getOrCreateAssociatedTokenAccount, mintTo, getMint } from '@solana/spl-token';
import { getConnection, getUsdcMint, getAuthorityKeypair } from '../utils/solana';
import { sendAndConfirm } from '../utils/onchain';

/**
 * Shared test-money mint: gives a wallet devnet test USDC (+ a little SOL for fees).
 * Used by both the manual faucet and the Crypto Predictions one-time auto-fund.
 */
export const TEST_FUNDS_USDC = 1000; // 1,000 test USDC
export const TEST_FUNDS_SOL = 0.05; // ~10 transactions of gas

export interface MintTestFundsResult {
  usdc: number;
  sol: number;
  usdcTx: string;
  solTx: string | null;
}

/** Mint 1000 test USDC (+SOL) to `walletAddress`. Throws on invalid wallet / authority mismatch. */
export async function mintTestFunds(walletAddress: string): Promise<MintTestFundsResult> {
  const target = new PublicKey(walletAddress);
  if (!PublicKey.isOnCurve(target)) throw new Error('Invalid Solana wallet address');

  const connection = getConnection();
  const authority = getAuthorityKeypair();
  const usdcMint = getUsdcMint();

  const mintInfo = await getMint(connection, usdcMint);
  if (!mintInfo.mintAuthority || !mintInfo.mintAuthority.equals(authority.publicKey)) {
    throw new Error('Server mint authority mismatch');
  }

  const ata = await getOrCreateAssociatedTokenAccount(connection, authority, usdcMint, target);
  const amountRaw = BigInt(TEST_FUNDS_USDC) * BigInt(10 ** mintInfo.decimals);
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

  return { usdc: TEST_FUNDS_USDC, sol, usdcTx, solTx };
}
