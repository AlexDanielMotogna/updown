import { Router, type Router as RouterType } from 'express';
import { PublicKey } from '@solana/web3.js';
import { mintTestFunds } from '../services/test-funds';

export const faucetRouter: RouterType = Router();

// Simple in-memory cooldown: 1 mint per wallet per hour
const cooldowns = new Map<string, number>();
const COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

faucetRouter.post('/faucet', async (req, res) => {
  try {
    const { walletAddress } = req.body;
    if (!walletAddress || typeof walletAddress !== 'string') {
      return res.status(400).json({ error: 'walletAddress is required' });
    }
    try {
      if (!PublicKey.isOnCurve(new PublicKey(walletAddress))) throw new Error();
    } catch {
      return res.status(400).json({ error: 'Invalid Solana wallet address' });
    }

    const lastMint = cooldowns.get(walletAddress);
    if (lastMint && Date.now() - lastMint < COOLDOWN_MS) {
      const remainingMin = Math.ceil((COOLDOWN_MS - (Date.now() - lastMint)) / 60_000);
      return res.status(429).json({ error: `Cooldown active. Try again in ${remainingMin} minute${remainingMin > 1 ? 's' : ''}.` });
    }

    const r = await mintTestFunds(walletAddress);
    cooldowns.set(walletAddress, Date.now());

    return res.json({
      success: true,
      amount: r.usdc,
      solAmount: r.sol,
      txSignature: r.usdcTx,
      solTxSignature: r.solTx,
      walletAddress,
    });
  } catch (err: unknown) {
    console.error('[Faucet] error:', err);
    return res.status(500).json({ error: (err instanceof Error ? err.message : '') || 'Failed to mint USDC' });
  }
});
