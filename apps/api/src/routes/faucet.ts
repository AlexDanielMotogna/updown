import { Router, type Router as RouterType } from 'express';
import { PublicKey } from '@solana/web3.js';
import { getOrCreateAssociatedTokenAccount, mintTo, getMint } from '@solana/spl-token';
import { getConnection, getUsdcMint, getAuthorityKeypair } from '../utils/solana';

export const faucetRouter: RouterType = Router();

const FAUCET_AMOUNT_USDC = 1000; // 1,000 USDC per request

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

    // Mint tokens
    const amountRaw = BigInt(FAUCET_AMOUNT_USDC) * BigInt(10 ** mintInfo.decimals);
    const txSignature = await mintTo(
      connection,
      authority,
      usdcMint,
      tokenAccount.address,
      authority,
      amountRaw,
    );

    // Set cooldown
    cooldowns.set(walletAddress, Date.now());

    return res.json({
      success: true,
      amount: FAUCET_AMOUNT_USDC,
      txSignature,
      walletAddress,
    });
  } catch (err: any) {
    console.error('Faucet error:', err);
    return res.status(500).json({ error: err.message || 'Failed to mint USDC' });
  }
});
