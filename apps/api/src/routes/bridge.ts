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
import { prisma } from '../db';
import { depositToHyperliquid } from '../services/bridge/hl-deposit';

const MIN_HL_DEPOSIT = 5_000_000n; // 5 USDC (below this HL drops the deposit)

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

const executeSchema = z.object({
  amount: z.string().regex(/^\d+$/, 'amount must be an integer string (base units)'),
  fromAddress: z.string().min(32),
  toAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'toAddress must be a 0x EVM address'),
  slippage: z.coerce.number().min(0).max(0.5).optional(),
});

// POST /api/bridge/execute — fresh quote + the signable source tx + a durable
// BridgeTransfer to poll. The client signs/sends the source tx on Solana.
bridgeRouter.post('/execute', async (req, res) => {
  const parsed = executeSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid request' } });
  }
  const b = parsed.data;
  try {
    const adapter = getBridgeAdapter(BRIDGE_PROVIDER);
    const quote = await adapter.quote({
      fromChain: 'solana', toChain: 'arbitrum',
      amount: b.amount, fromAddress: b.fromAddress, toAddress: b.toAddress, slippage: b.slippage,
    });
    const sourceTx = adapter.buildSourceTx(quote);
    const transfer = await prisma.bridgeTransfer.create({
      data: {
        walletAddress: b.fromAddress, toAddress: b.toAddress,
        provider: quote.provider, tool: quote.tool,
        fromChain: quote.fromChain, toChain: quote.toChain,
        amount: quote.fromAmount, toAmount: quote.toAmount, status: 'PENDING',
      },
    });
    res.json({
      success: true,
      data: {
        id: transfer.id,
        sourceTx,
        quote: { toAmount: quote.toAmount, toAmountMin: quote.toAmountMin, feeUsd: quote.feeUsd, gasUsd: quote.gasUsd, durationSeconds: quote.durationSeconds, tool: quote.tool },
      },
    });
  } catch (e) {
    console.error('[Bridge] execute error:', e instanceof Error ? e.message : e);
    res.status(502).json({ success: false, error: { code: 'BRIDGE_EXECUTE_FAILED', message: e instanceof Error ? e.message : 'Execute failed' } });
  }
});

const submittedSchema = z.object({ id: z.string().uuid(), txHash: z.string().min(32) });

// POST /api/bridge/submitted — record the Solana source-tx signature.
bridgeRouter.post('/submitted', async (req, res) => {
  const parsed = submittedSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid request' } });
  }
  try {
    const transfer = await prisma.bridgeTransfer.update({
      where: { id: parsed.data.id },
      data: { sourceTxHash: parsed.data.txHash, status: 'SUBMITTED' },
    });
    res.json({ success: true, data: { id: transfer.id, status: transfer.status } });
  } catch {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Transfer not found' } });
  }
});

const depositSchema = z.object({
  user: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'user must be a 0x EVM address'),
  usd: z.string().regex(/^\d+$/, 'usd must be an integer string (USDC base units)'),
  deadline: z.coerce.number().int().positive(),
  signature: z.object({
    r: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
    s: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
    v: z.coerce.number().int(),
  }),
});

// POST /api/bridge/deposit-hl — relayer deposits the user's permitted USDC into
// HyperLiquid (Bridge2 batchedDepositWithPermit), crediting the user. The relayer
// pays the Arbitrum gas (user signed only an off-chain permit).
bridgeRouter.post('/deposit-hl', async (req, res) => {
  const parsed = depositSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid request' } });
  }
  const b = parsed.data;
  const usd = BigInt(b.usd);
  if (usd < MIN_HL_DEPOSIT) {
    return res.status(400).json({ success: false, error: { code: 'BELOW_MIN', message: 'Minimum HyperLiquid deposit is 5 USDC' } });
  }
  try {
    const txHash = await depositToHyperliquid({
      user: b.user as `0x${string}`,
      usd,
      deadline: BigInt(b.deadline),
      signature: { r: BigInt(b.signature.r), s: BigInt(b.signature.s), v: b.signature.v },
    });
    res.json({ success: true, data: { txHash } });
  } catch (e) {
    console.error('[Bridge] HL deposit error:', e instanceof Error ? e.message : e);
    res.status(502).json({ success: false, error: { code: 'HL_DEPOSIT_FAILED', message: e instanceof Error ? e.message : 'Deposit failed' } });
  }
});

// GET /api/bridge/status?id= — poll the provider, persist, return normalized state.
bridgeRouter.get('/status', async (req, res) => {
  const id = typeof req.query.id === 'string' ? req.query.id : '';
  if (!id) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'id required' } });
  try {
    const transfer = await prisma.bridgeTransfer.findUnique({ where: { id } });
    if (!transfer) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Transfer not found' } });

    // Terminal states or not-yet-submitted: return as-is, no provider call.
    if (transfer.status === 'DONE' || transfer.status === 'FAILED' || !transfer.sourceTxHash) {
      return res.json({ success: true, data: { id, status: transfer.status, destTxHash: transfer.destTxHash } });
    }

    const adapter = getBridgeAdapter(transfer.provider);
    const st = await adapter.getStatus({
      txHash: transfer.sourceTxHash,
      fromChain: transfer.fromChain as BridgeChain,
      toChain: transfer.toChain as BridgeChain,
      tool: transfer.tool,
    });
    const updated = await prisma.bridgeTransfer.update({
      where: { id },
      data: { status: st.state, destTxHash: st.destTxHash ?? transfer.destTxHash },
    });
    res.json({ success: true, data: { id, status: updated.status, destTxHash: updated.destTxHash, substatus: st.substatus } });
  } catch (e) {
    console.error('[Bridge] status error:', e instanceof Error ? e.message : e);
    res.status(502).json({ success: false, error: { code: 'BRIDGE_STATUS_FAILED', message: e instanceof Error ? e.message : 'Status failed' } });
  }
});
