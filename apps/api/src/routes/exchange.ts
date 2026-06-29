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
  AccountLinkedElsewhereError,
  buildHyperliquidSigner,
  createPendingAgentConnection,
  getConnection,
  serializeConnection,
} from '../services/exchange-connection';
import { linkWallet, resolveUserByWallet } from '../services/wallet-link';
import { creditConnectionFills } from '../services/trading-xp/poller';
import { HyperliquidReadAdapter, MAINNET, TESTNET } from 'exchange-hyperliquid';
import type { OrderParams } from 'exchange-core';

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
  kind: z.enum(['perp', 'spot']).optional(),
});

const cancelSchema = z.object({
  walletAddress: solanaWallet,
  isTestnet: isTestnetFlag,
  symbol: z.string().min(1).max(40),
  orderId: z.union([z.string(), z.number()]),
});

const tpslSchema = z
  .object({
    walletAddress: solanaWallet,
    isTestnet: isTestnetFlag,
    symbol: z.string().min(1).max(40),
    side: z.enum(['BUY', 'SELL']), // the CLOSING side (opposite of the position)
    amount: z.string().min(1),
    tpTriggerPrice: z.string().optional(),
    slTriggerPrice: z.string().optional(),
    maxSlippagePct: z.number().positive().max(50).optional(),
  })
  .refine((d) => d.tpTriggerPrice || d.slTriggerPrice, { message: 'tpTriggerPrice or slTriggerPrice required' });

const creditFillsSchema = z.object({
  walletAddress: solanaWallet,
  isTestnet: isTestnetFlag,
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

    const result = await linkWallet({
      userId,
      chain: parsed.data.chain,
      address: parsed.data.address,
      source: parsed.data.source,
    });
    if (result.conflict) {
      // Bind-once: this wallet already belongs to a different UpDown account.
      return res.status(409).json({
        success: false,
        error: { code: 'WALLET_LINKED_ELSEWHERE', message: 'This wallet is already linked to another UpDown account' },
      });
    }
    res.json({ success: true, data: { chain: result.link.chain, address: result.link.address } });
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
    if (error instanceof AccountLinkedElsewhereError) {
      return res.status(409).json({ success: false, error: { code: 'ACCOUNT_LINKED_ELSEWHERE', message: error.message } });
    }
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

    // Put the account on HL Unified Account so spot + perps share one balance (no
    // Spot↔Perps transfers). Agent-signed, idempotent, never blocks confirm.
    // On by default; set HL_FORCE_UNIFIED=off to disable.
    if (process.env.HL_FORCE_UNIFIED !== 'off' && conn.accountAddress) {
      try {
        const signer = await buildHyperliquidSigner(userId, { isTestnet: parsed.data.isTestnet });
        const r = await signer.ensureUnified(conn.accountAddress);
        console.log(`[Exchange] abstraction for ${conn.accountAddress}: ${r.mode}${r.changed ? ' (set to unifiedAccount)' : ''}`);
      } catch (e) {
        console.error('[Exchange] ensureUnified failed (non-fatal):', (e as Error).message);
      }
    }

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

/**
 * Set position TP/SL as a HyperLiquid `positionTpsl` group: HL ties them to the
 * live position (OCO — one fills, the other auto-cancels; both cancel when the
 * position closes), so they never linger and attach to the next position. `side`
 * is the CLOSING side (opposite of the position).
 */
exchangeRouter.post('/order/tpsl', async (req, res) => {
  try {
    const parsed = tpslSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message ?? 'Invalid body');

    const { walletAddress, isTestnet, symbol, side, amount, tpTriggerPrice, slTriggerPrice, maxSlippagePct } = parsed.data;
    const userId = await resolveUserId(walletAddress);
    if (!userId) {
      return res.status(404).json({ success: false, error: { code: 'USER_NOT_FOUND', message: 'Unknown wallet' } });
    }

    const conn = await getConnection(userId, 'hyperliquid', isTestnet);
    if (!conn || !conn.active) {
      return res.status(409).json({ success: false, error: { code: 'NO_ACTIVE_CONNECTION', message: 'Connect and approve an agent first' } });
    }

    const orders: OrderParams[] = [];
    if (tpTriggerPrice) orders.push({ symbol, side, type: 'TAKE_PROFIT_MARKET', amount, triggerPrice: tpTriggerPrice, reduceOnly: true, maxSlippagePct });
    if (slTriggerPrice) orders.push({ symbol, side, type: 'STOP_MARKET', amount, triggerPrice: slTriggerPrice, reduceOnly: true, maxSlippagePct });

    const signer = await buildHyperliquidSigner(userId, { isTestnet });
    const results = await signer.signAndSubmitGroup(orders, 'positionTpsl');
    const failed = results.filter((r) => !r.success);
    res.json({
      success: failed.length === 0,
      data: { results },
      ...(failed.length ? { error: { code: 'TPSL_PARTIAL', message: failed.map((f) => f.error).filter(Boolean).join('; ') || 'TP/SL rejected' } } : {}),
    });
  } catch (error) {
    console.error('[Exchange] tpsl error:', error);
    res.status(502).json({ success: false, error: { code: 'TPSL_FAILED', message: (error as Error).message } });
  }
});

/**
 * Credit trading XP + UP coins for the caller's recent fills (near-instant path).
 * The terminal pings this when its WS sees a new fill; the server re-fetches
 * `userFills` itself (never trusts client fill data) and credits. Mainnet only.
 */
exchangeRouter.post('/credit-fills', async (req, res) => {
  try {
    const parsed = creditFillsSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message ?? 'Invalid body');
    const { walletAddress, isTestnet } = parsed.data;
    if (isTestnet) return res.json({ success: true, data: { newFills: 0, xpAwarded: 0, coinsAwarded: 0 } });

    const userId = await resolveUserId(walletAddress);
    if (!userId) return res.status(404).json({ success: false, error: { code: 'USER_NOT_FOUND', message: 'Unknown wallet' } });

    const conn = await getConnection(userId, 'hyperliquid', false);
    if (!conn || !conn.active) {
      return res.status(409).json({ success: false, error: { code: 'NO_ACTIVE_CONNECTION', message: 'Connect and approve an agent first' } });
    }

    const r = await creditConnectionFills(conn.accountAddress);
    res.json({ success: true, data: { newFills: r.newFills, xpAwarded: Number(r.xpAwarded), coinsAwarded: Number(r.coinsAwarded), level: r.newLevel, levelUp: r.levelUp } });
  } catch (error) {
    console.error('[Exchange] credit-fills error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to credit fills' } });
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

// ── Trading history (read-only over persisted HL fills) ──────────────────────
// Powers the Profile "Trading" tab. Keyed by the Solana walletAddress — the same
// identity as predictions. Mainnet only (that's all we persist in `trade_fills`).
// The terminal/poller writes the fills; these endpoints just read + aggregate.

const tradesQuerySchema = z.object({
  wallet: solanaWallet,
  page: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

/** GET /api/exchange/trades?wallet=&page=&limit= → offset-paginated fill history
 * (newest first) + total count, so the UI can page through ALL trades. */
exchangeRouter.get('/trades', async (req, res) => {
  try {
    const parsed = tradesQuerySchema.safeParse(req.query);
    if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message ?? 'Invalid query');
    const { wallet, page, limit } = parsed.data;

    const [total, rows] = await Promise.all([
      prisma.tradeFill.count({ where: { walletAddress: wallet } }),
      prisma.tradeFill.findMany({
        where: { walletAddress: wallet },
        orderBy: { time: 'desc' },
        skip: page * limit,
        take: limit,
      }),
    ]);
    res.json({
      success: true,
      total,
      page,
      limit,
      data: rows.map((f) => ({
        id: f.id,
        coin: f.coin,
        side: f.side,
        dir: f.dir,
        px: f.px,
        sz: f.sz,
        notionalUsd: f.notionalUsd,
        feeUsd: f.feeUsd,
        pnlUsd: f.pnlUsd,
        time: Number(f.time),
      })),
    });
  } catch (error) {
    console.error('[Exchange] trades error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to load trades' } });
  }
});

/** GET /api/exchange/positions?wallet=&isTestnet= → live OPEN positions from HL
 *  (clearinghouseState for the user's linked HL account). Empty array when the
 *  user has no connection or no open positions. */
exchangeRouter.get('/positions', async (req, res) => {
  try {
    const parsed = statusQuerySchema.safeParse(req.query);
    if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message ?? 'Invalid query');
    const userId = await resolveUserId(parsed.data.wallet);
    if (!userId) return res.json({ success: true, data: [] });
    const conn = await getConnection(userId, 'hyperliquid', parsed.data.isTestnet);
    if (!conn?.accountAddress) return res.json({ success: true, data: [] });
    const adapter = new HyperliquidReadAdapter({ endpoint: parsed.data.isTestnet ? TESTNET : MAINNET });
    const positions = await adapter.getPositions(conn.accountAddress);
    res.json({ success: true, data: positions });
  } catch (error) {
    console.error('[Exchange] positions error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to load positions' } });
  }
});

/** GET /api/exchange/spot-balances?wallet=&isTestnet= → spot token holdings.
 *  Resolves the user's linked HL (EVM) account from the Solana wallet server-side,
 *  so the client never needs to know its own EVM address. */
exchangeRouter.get('/spot-balances', async (req, res) => {
  try {
    const parsed = statusQuerySchema.safeParse(req.query);
    if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message ?? 'Invalid query');
    const userId = await resolveUserId(parsed.data.wallet);
    if (!userId) return res.json({ success: true, data: [] });
    const conn = await getConnection(userId, 'hyperliquid', parsed.data.isTestnet);
    if (!conn?.accountAddress) return res.json({ success: true, data: [] });
    const adapter = new HyperliquidReadAdapter({ endpoint: parsed.data.isTestnet ? TESTNET : MAINNET });
    const balances = adapter.getSpotBalances ? await adapter.getSpotBalances(conn.accountAddress) : [];
    res.json({ success: true, data: balances });
  } catch (error) {
    console.error('[Exchange] spot-balances error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to load spot balances' } });
  }
});

/** GET /api/exchange/trades/summary?wallet= → aggregates + cumulative PnL curve. */
exchangeRouter.get('/trades/summary', async (req, res) => {
  try {
    const parsed = z.object({ wallet: solanaWallet }).safeParse(req.query);
    if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message ?? 'Invalid query');
    const { wallet } = parsed.data;

    const rows = await prisma.tradeFill.findMany({
      where: { walletAddress: wallet },
      orderBy: { time: 'asc' },
      select: { coin: true, dir: true, notionalUsd: true, feeUsd: true, pnlUsd: true, time: true },
    });

    let volumeUsd = 0, feesUsd = 0, realizedPnlUsd = 0, wins = 0, closedTrades = 0;
    const perCoin = new Map<string, number>(); // realized PnL by coin
    const curve: Array<{ t: number; pnl: number }> = [];
    let cum = 0;
    for (const f of rows) {
      volumeUsd += Number(f.notionalUsd);
      feesUsd += Number(f.feeUsd);
      const pnl = f.pnlUsd != null ? Number(f.pnlUsd) : 0;
      // A "close" realizes PnL — HL only sets closedPnl on closing fills.
      const isClose = (f.dir ?? '').toLowerCase().includes('close') || (f.pnlUsd != null && pnl !== 0);
      if (isClose) {
        closedTrades++;
        if (pnl > 0) wins++;
        realizedPnlUsd += pnl;
        perCoin.set(f.coin, (perCoin.get(f.coin) ?? 0) + pnl);
        cum += pnl;
        curve.push({ t: Number(f.time), pnl: cum });
      }
    }
    const ranked = [...perCoin.entries()].sort((a, b) => b[1] - a[1]);
    res.json({
      success: true,
      data: {
        realizedPnlUsd,
        volumeUsd,
        feesUsd,
        trades: rows.length,
        closedTrades,
        winRate: closedTrades > 0 ? (wins / closedTrades) * 100 : 0,
        wins,
        losses: closedTrades - wins,
        bestCoin: ranked[0] ? { coin: ranked[0][0], pnl: ranked[0][1] } : null,
        worstCoin: ranked.length ? { coin: ranked[ranked.length - 1][0], pnl: ranked[ranked.length - 1][1] } : null,
        pnlCurve: curve,
      },
    });
  } catch (error) {
    console.error('[Exchange] trades summary error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to load summary' } });
  }
});
