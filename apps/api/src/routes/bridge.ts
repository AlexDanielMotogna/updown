/**
 * Bridge (cross-chain funding) routes — phase 1: quote only.
 *
 * Prices a Solana USDC → Arbitrum USDC transfer so the terminal can show
 * "you'll receive X, fee Y, ETA Z" before the user funds HyperLiquid. No signing
 * or execution yet (that lands in a later phase with the permit-deposit relayer).
 *
 * Provider-agnostic via bridge-core's registry; defaults to LI.FI.
 */
import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';
import { getBridgeAdapter, registerBridgeProvider, type BridgeChain } from 'bridge-core';
import { LifiBridgeAdapter } from 'bridge-lifi';

// Register providers once at module load.
registerBridgeProvider('lifi', () => new LifiBridgeAdapter({
  apiKey: process.env.LIFI_API_KEY,
  integrator: process.env.LIFI_INTEGRATOR ?? 'updown',
}));

const BRIDGE_PROVIDER = process.env.BRIDGE_PROVIDER ?? 'lifi';

export const bridgeRouter: RouterType = Router();

const quoteSchema = z.object({
  // Amount in base units of the source token (USDC = 6 decimals).
  amount: z.string().regex(/^\d+$/, 'amount must be an integer string (base units)'),
  fromAddress: z.string().min(32),
  toAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'toAddress must be a 0x EVM address'),
  from: z.enum(['solana', 'arbitrum']).default('solana'),
  to: z.enum(['solana', 'arbitrum']).default('arbitrum'),
  slippage: z.coerce.number().min(0).max(0.5).optional(),
});

// GET /api/bridge/quote — normalized quote for funding the trading account.
bridgeRouter.get('/quote', async (req, res) => {
  const parsed = quoteSchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid request' } });
  }
  const q = parsed.data;
  try {
    const adapter = getBridgeAdapter(BRIDGE_PROVIDER);
    const quote = await adapter.quote({
      fromChain: q.from as BridgeChain,
      toChain: q.to as BridgeChain,
      amount: q.amount,
      fromAddress: q.fromAddress,
      toAddress: q.toAddress,
      slippage: q.slippage,
    });
    res.json({ success: true, data: quote });
  } catch (e) {
    console.error('[Bridge] quote error:', e instanceof Error ? e.message : e);
    res.status(502).json({ success: false, error: { code: 'BRIDGE_QUOTE_FAILED', message: e instanceof Error ? e.message : 'Quote failed' } });
  }
});
