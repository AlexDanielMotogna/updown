/**
 * Exchange (trading terminal) routes — the agent-wallet approval flow (ADR-003).
 *
 * Identity is the Solana `walletAddress` (same pattern as the rest of the API).
 * The agent private key is generated and stored server-side (encrypted); the
 * client only ever sees the agent ADDRESS, which the user's main EVM wallet
 * approves on-chain via HyperLiquid `approveAgent`.
 *
 * Flow:
 *   1. POST /api/exchange/agent/generate  → { agentAddress }   (pending, inactive)
 *   2. client signs approveAgent(agentAddress) with their EVM wallet on HL
 *   3. POST /api/exchange/agent/confirm   → activates the connection
 *   GET    /api/exchange/connection       → status (never the key)
 *   DELETE /api/exchange/connection       → remove
 */
import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import {
  activateConnection,
  buildHyperliquidSigner,
  createPendingAgentConnection,
  getConnection,
  serializeConnection,
} from '../services/exchange-connection';
import { linkWallet, resolveUserByWallet } from '../services/wallet-link';

export const exchangeRouter: RouterType = Router();

const solanaWallet = z.string().min(32).max(44);
const evmAddress = z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'Invalid EVM address');
const isTestnetFlag = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((v) => v === true || v === 'true');

const generateSchema = z.object({
  walletAddress: solanaWallet,
  accountAddress: evmAddress, // the user's real EVM (HL) account that will approve the agent
  agentName: z.string().min(1).max(32).optional(),
  isTestnet: isTestnetFlag,
});

const confirmSchema = z.object({
  walletAddress: solanaWallet,
  isTestnet: isTestnetFlag,
});

const statusQuerySchema = z.object({
  wallet: solanaWallet,
  isTestnet: isTestnetFlag,
});

const linkSchema = z.object({
  walletAddress: solanaWallet, // the Solana identity to link the EVM wallet to
  chain: z.enum(['solana', 'evm']).default('evm'),
  address: z.string().min(1).max(64),
  source: z.string().max(32).optional(),
});

const resolveQuerySchema = z.object({
  chain: z.enum(['solana', 'evm']).default('evm'),
  address: z.string().min(1).max(64),
});

const orderSchema = z.object({
  walletAddress: solanaWallet,
  isTestnet: isTestnetFlag,
  symbol: z.string().min(1).max(40),
  side: z.enum(['BUY', 'SELL']),
  type: z.enum([
    'MARKET',
    'LIMIT',
    'STOP_MARKET',
    'STOP_LIMIT',
    'TAKE_PROFIT_MARKET',
    'TAKE_PROFIT_LIMIT',
  ]),
  amount: z.string().min(1),
  price: z.string().optional(),
  triggerPrice: z.string().optional(),
  timeInForce: z.enum(['GTC', 'IOC', 'FOK', 'POST_ONLY']).optional(),
  reduceOnly: z.boolean().optional(),
  clientOrderId: z.string().optional(),
  maxSlippagePct: z.number().positive().max(50).optional(),
});

const cancelSchema = z.object({
  walletAddress: solanaWallet,
  isTestnet: isTestnetFlag,
  symbol: z.string().min(1).max(40),
  orderId: z.union([z.string(), z.number()]),
});

const leverageSchema = z.object({
  walletAddress: solanaWallet,
  isTestnet: isTestnetFlag,
  symbol: z.string().min(1).max(40),
  leverage: z.number().int().min(1).max(100),
  isCross: z.boolean(),
});

function badRequest(res: Parameters<Parameters<typeof exchangeRouter.post>[1]>[1], message: string) {
  return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message } });
}

async function resolveUserId(walletAddress: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { walletAddress }, select: { id: true } });
  return user?.id ?? null;
}

/** Link an EVM (or other) wallet to a Solana-identity user (ADR-003). */
exchangeRouter.post('/link', async (req, res) => {
  try {
    const parsed = linkSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message ?? 'Invalid body');

    const userId = await resolveUserId(parsed.data.walletAddress);
    if (!userId) {
      return res.status(404).json({ success: false, error: { code: 'USER_NOT_FOUND', message: 'Unknown wallet' } });
    }

    const link = await linkWallet({
      userId,
      chain: parsed.data.chain,
      address: parsed.data.address,
      source: parsed.data.source,
    });
    res.json({ success: true, data: { chain: link.chain, address: link.address } });
  } catch (error) {
    console.error('[Exchange] link error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to link wallet' } });
  }
});

/** Resolve which user a linked wallet belongs to (terminal: Privy EVM → identity). */
exchangeRouter.get('/resolve', async (req, res) => {
  try {
    const parsed = resolveQuerySchema.safeParse(req.query);
    if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message ?? 'Invalid query');

    const user = await resolveUserByWallet(parsed.data.chain, parsed.data.address);
    res.json({ success: true, data: user ? { walletAddress: user.walletAddress } : null });
  } catch (error) {
    console.error('[Exchange] resolve error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to resolve wallet' } });
  }
});

/** Step 1 — generate a pending agent wallet, return its address for on-chain approval. */
exchangeRouter.post('/agent/generate', async (req, res) => {
  try {
    const parsed = generateSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message ?? 'Invalid body');

    const userId = await resolveUserId(parsed.data.walletAddress);
    if (!userId) {
      return res.status(404).json({ success: false, error: { code: 'USER_NOT_FOUND', message: 'Unknown wallet' } });
    }

    const { agentAddress } = await createPendingAgentConnection({
      userId,
      accountAddress: parsed.data.accountAddress,
      agentName: parsed.data.agentName,
      isTestnet: parsed.data.isTestnet,
    });

    res.json({ success: true, data: { agentAddress, isTestnet: parsed.data.isTestnet } });
  } catch (error) {
    console.error('[Exchange] agent/generate error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to generate agent' } });
  }
});

/** Step 2 — activate the connection after the client approved the agent on-chain. */
exchangeRouter.post('/agent/confirm', async (req, res) => {
  try {
    const parsed = confirmSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message ?? 'Invalid body');

    const userId = await resolveUserId(parsed.data.walletAddress);
    if (!userId) {
      return res.status(404).json({ success: false, error: { code: 'USER_NOT_FOUND', message: 'Unknown wallet' } });
    }

    const existing = await getConnection(userId, 'hyperliquid', parsed.data.isTestnet);
    if (!existing) {
      return res.status(404).json({ success: false, error: { code: 'NO_PENDING_CONNECTION', message: 'Generate an agent first' } });
    }

    const conn = await activateConnection(userId, 'hyperliquid', parsed.data.isTestnet);
    res.json({ success: true, data: serializeConnection(conn) });
  } catch (error) {
    console.error('[Exchange] agent/confirm error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to confirm agent' } });
  }
});

/** Connection status (never returns the encrypted key). */
exchangeRouter.get('/connection', async (req, res) => {
  try {
    const parsed = statusQuerySchema.safeParse(req.query);
    if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message ?? 'Invalid query');

    const userId = await resolveUserId(parsed.data.wallet);
    if (!userId) return res.json({ success: true, data: null });

    const conn = await getConnection(userId, 'hyperliquid', parsed.data.isTestnet);
    res.json({ success: true, data: conn ? serializeConnection(conn) : null });
  } catch (error) {
    console.error('[Exchange] connection status error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to load connection' } });
  }
});

/** Remove a connection. */
exchangeRouter.delete('/connection', async (req, res) => {
  try {
    const parsed = confirmSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message ?? 'Invalid body');

    const userId = await resolveUserId(parsed.data.walletAddress);
    if (!userId) {
      return res.status(404).json({ success: false, error: { code: 'USER_NOT_FOUND', message: 'Unknown wallet' } });
    }

    await prisma.exchangeConnection.deleteMany({
      where: { userId, exchange: 'hyperliquid', isTestnet: parsed.data.isTestnet },
    });
    res.json({ success: true, data: { removed: true } });
  } catch (error) {
    console.error('[Exchange] connection delete error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to remove connection' } });
  }
});

/** Place an order. The server signs with the user's decrypted agent key. */
exchangeRouter.post('/order', async (req, res) => {
  try {
    const parsed = orderSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message ?? 'Invalid body');

    const { walletAddress, isTestnet, ...orderParams } = parsed.data;
    const userId = await resolveUserId(walletAddress);
    if (!userId) {
      return res.status(404).json({ success: false, error: { code: 'USER_NOT_FOUND', message: 'Unknown wallet' } });
    }

    const conn = await getConnection(userId, 'hyperliquid', isTestnet);
    if (!conn || !conn.active) {
      return res.status(409).json({ success: false, error: { code: 'NO_ACTIVE_CONNECTION', message: 'Connect and approve an agent first' } });
    }

    const signer = await buildHyperliquidSigner(userId, { isTestnet });
    const result = await signer.signAndSubmit(signer.buildOrder(orderParams));
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('[Exchange] order error:', error);
    // Surface the exchange's message (e.g. "Must deposit", "Insufficient margin").
    res.status(502).json({ success: false, error: { code: 'ORDER_FAILED', message: (error as Error).message } });
  }
});

/** Set leverage + margin mode (cross/isolated) for a symbol. Signed agent action. */
exchangeRouter.post('/leverage', async (req, res) => {
  try {
    const parsed = leverageSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message ?? 'Invalid body');

    const { walletAddress, isTestnet, symbol, leverage, isCross } = parsed.data;
    const userId = await resolveUserId(walletAddress);
    if (!userId) {
      return res.status(404).json({ success: false, error: { code: 'USER_NOT_FOUND', message: 'Unknown wallet' } });
    }

    const conn = await getConnection(userId, 'hyperliquid', isTestnet);
    if (!conn || !conn.active) {
      return res.status(409).json({ success: false, error: { code: 'NO_ACTIVE_CONNECTION', message: 'Connect and approve an agent first' } });
    }

    const signer = await buildHyperliquidSigner(userId, { isTestnet });
    const result = await signer.updateLeverage(symbol, leverage, isCross);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('[Exchange] leverage error:', error);
    res.status(502).json({ success: false, error: { code: 'LEVERAGE_FAILED', message: (error as Error).message } });
  }
});

/** Cancel an order by id. */
exchangeRouter.post('/order/cancel', async (req, res) => {
  try {
    const parsed = cancelSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message ?? 'Invalid body');

    const userId = await resolveUserId(parsed.data.walletAddress);
    if (!userId) {
      return res.status(404).json({ success: false, error: { code: 'USER_NOT_FOUND', message: 'Unknown wallet' } });
    }

    const signer = await buildHyperliquidSigner(userId, { isTestnet: parsed.data.isTestnet });
    const result = await signer.cancel({ symbol: parsed.data.symbol, orderId: parsed.data.orderId });
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('[Exchange] order cancel error:', error);
    res.status(502).json({ success: false, error: { code: 'CANCEL_FAILED', message: (error as Error).message } });
  }
});
