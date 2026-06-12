import { PublicKey, LAMPORTS_PER_SOL, SystemProgram, Transaction } from '@solana/web3.js';
import {
  getOrCreateAssociatedTokenAccount, mintTo, getMint, transfer,
  getAssociatedTokenAddress, getAccount,
} from '@solana/spl-token';
import {
  getConnection, getUsdcMint, getAuthorityKeypair, getTreasuryKeypair, isDevnet,
} from '../../utils/solana';
import { sendAndConfirm } from '../../utils/onchain';

export async function getUsdcBalance(owner: PublicKey): Promise<bigint> {
  try {
    const ata = await getAssociatedTokenAddress(getUsdcMint(), owner);
    const acc = await getAccount(getConnection(), ata);
    return acc.amount;
  } catch { return 0n; }
}

export async function getSolBalance(owner: PublicKey): Promise<number> {
  try { return await getConnection().getBalance(owner); } catch { return 0; }
}

/** The wallet that funds bot wallets: authority on devnet (mints free USDC),
 *  treasury on mainnet (transfers real USDC). Null if mainnet treasury missing. */
export function getFunderKeypair() {
  return isDevnet() ? getAuthorityKeypair() : getTreasuryKeypair();
}

/**
 * Top a bot wallet up to the given USDC + SOL targets (only tops up the
 * shortfall). Devnet mints USDC via the mint authority; mainnet transfers real
 * USDC from the treasury wallet. SOL always comes from the funder.
 */
export async function fundBotWallet(
  target: PublicKey,
  usdcTarget: bigint,
  solLamportsTarget: number,
): Promise<{ usdcFunded: bigint; solFunded: number }> {
  const conn = getConnection();
  const usdcMint = getUsdcMint();
  const devnet = isDevnet();
  const funder = getFunderKeypair();
  if (!funder) throw new Error('No funder keypair (TREASURY_SECRET_KEY required on mainnet)');

  let usdcFunded = 0n;
  const curUsdc = await getUsdcBalance(target);
  if (curUsdc < usdcTarget) {
    const need = usdcTarget - curUsdc;
    const targetAta = await getOrCreateAssociatedTokenAccount(conn, funder, usdcMint, target);
    if (devnet) {
      const mintInfo = await getMint(conn, usdcMint);
      if (!mintInfo.mintAuthority || !mintInfo.mintAuthority.equals(funder.publicKey)) {
        throw new Error('Authority is not the USDC mint authority on this cluster');
      }
      await mintTo(conn, funder, usdcMint, targetAta.address, funder, need);
    } else {
      const fromAta = await getOrCreateAssociatedTokenAccount(conn, funder, usdcMint, funder.publicKey);
      await transfer(conn, funder, fromAta.address, targetAta.address, funder, need);
    }
    usdcFunded = need;
  }

  let solFunded = 0;
  const curSol = await getSolBalance(target);
  if (curSol < solLamportsTarget) {
    const need = solLamportsTarget - curSol;
    const funderSol = await conn.getBalance(funder.publicKey);
    // Keep a 0.2 SOL reserve on the funder for its own fees.
    if (funderSol > need + 0.2 * LAMPORTS_PER_SOL) {
      await sendAndConfirm(
        SystemProgram.transfer({ fromPubkey: funder.publicKey, toPubkey: target, lamports: need }),
        funder, { label: 'fund-sol' },
      );
      solFunded = need;
    } else {
      console.warn('[LiquidityBot] funder SOL too low to top up wallet');
    }
  }

  return { usdcFunded, solFunded };
}
