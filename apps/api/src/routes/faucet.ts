import { Router, type Router as RouterType } from 'express';
import { PublicKey, LAMPORTS_PER_SOL, SystemProgram, Transaction } from '@solana/web3.js';
import { getOrCreateAssociatedTokenAccount, mintTo, getMint } from '@solana/spl-token';
import { getConnection, getUsdcMint, getAuthorityKeypair } from '../utils/solana';

export const faucetRouter: RouterType = Router();

const FAUCET_AMOUNT_USDC = 1000; // 1,000 USDC per request
const FAUCET_AMOUNT_SOL = 0.05;  // 0.05 SOL per request (~10 transactions)

// Simple in-memory cooldown: 1 mint per wallet per hour
const cooldowns = new Map<string, number>();
const COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

faucetRouter.post('/faucet', async (req, res) => {
  try {
    const { walletAddress } = req.body;

    if (!walletAddress || typeof walletAddress !== 'string') {
      return res.status(400).json({ error: 'walletAddress is required' });
    }

    // Validate wallet address
    let targetPubkey: PublicKey;
    try {
      targetPubkey = new PublicKey(walletAddress);
      if (!PublicKey.isOnCurve(targetPubkey)) {
        return res.status(400).json({ error: 'Invalid Solana wallet address' });
      }
    } catch {
      return res.status(400).json({ error: 'Invalid Solana wallet address' });
    }

    // Check cooldown
    const lastMint = cooldowns.get(walletAddress);
    if (lastMint && Date.now() - lastMint < COOLDOWN_MS) {
      const remainingMs = COOLDOWN_MS - (Date.now() - lastMint);
      const remainingMin = Math.ceil(remainingMs / 60_000);
      return res.status(429).json({
        error: `Cooldown active. Try again in ${remainingMin} minute${remainingMin > 1 ? 's' : ''}.`,
      });
    }

    const connection = getConnection();
    const authority = getAuthorityKeypair();
    const usdcMint = getUsdcMint();

    // Get mint info for decimals
    const mintInfo = await getMint(connection, usdcMint);

    // Verify authority is the mint authority
    if (!mintInfo.mintAuthority || !mintInfo.mintAuthority.equals(authority.publicKey)) {
      return res.status(500).json({ error: 'Server mint authority mismatch' });
    }

    // Get or create ATA for target wallet
    const tokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      authority,
      usdcMint,
      targetPubkey,
    );

    // Mint USDC tokens
    const amountRaw = BigInt(FAUCET_AMOUNT_USDC) * BigInt(10 ** mintInfo.decimals);
    const txSignature = await mintTo(
      connection,
      authority,
      usdcMint,
      tokenAccount.address,
      authority,
      amountRaw,
    );

    // Transfer SOL from authority for transaction fees (best-effort)
    let solTxSignature: string | null = null;
    let solAmount = 0;
    try {
      const lamports = Math.round(FAUCET_AMOUNT_SOL * LAMPORTS_PER_SOL);
      const authorityBalance = await connection.getBalance(authority.publicKey);
      // Only transfer if authority has enough (keep 0.5 SOL reserve for its own txs)
      if (authorityBalance > lamports + 0.5 * LAMPORTS_PER_SOL) {
        const tx = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: authority.publicKey,
            toPubkey: targetPubkey,
            lamports,
          }),
        );
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
        tx.recentBlockhash = blockhash;
        tx.feePayer = authority.publicKey;
        tx.sign(authority);
        const sig = await connection.sendRawTransaction(tx.serialize(), {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
        });
        await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
        solTxSignature = sig;
        solAmount = FAUCET_AMOUNT_SOL;
      } else {
        console.warn('SOL transfer skipped: authority balance too low');
      }
    } catch (solErr) {
      console.warn('SOL transfer failed:', solErr instanceof Error ? solErr.message : solErr);
    }

    // Set cooldown
    cooldowns.set(walletAddress, Date.now());

    return res.json({
      success: true,
      amount: FAUCET_AMOUNT_USDC,
      solAmount,
      txSignature,
      solTxSignature,
      walletAddress,
    });
  } catch (err: any) {
    console.error('Faucet error:', err);
    return res.status(500).json({ error: err.message || 'Failed to mint USDC' });
  }
});
