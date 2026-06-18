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
  createPendingAgentConnection,
  getConnection,
  serializeConnection,
} from '../services/exchange-connection';

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

function badRequest(res: Parameters<Parameters<typeof exchangeRouter.post>[1]>[1], message: string) {
  return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message } });
}

async function resolveUserId(walletAddress: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { walletAddress }, select: { id: true } });
  return user?.id ?? null;
}

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
