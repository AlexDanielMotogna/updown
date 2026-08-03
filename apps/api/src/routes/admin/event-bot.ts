import { Router, type Router as RouterType } from 'express';
import { Prisma } from '@prisma/client';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { prisma } from '../../db';
import { getEventBotConfig } from '../../services/event-bot/config';
import { getUsdcBalance, getSolBalance, getFunderKeypair } from '../../services/liquidity-bot/funding';
import { getEventBotKeypairs, getCluster } from '../../utils/solana';
import { getEventBotDiagnostics } from '../../services/event-bot/bot';

/** Admin for the Crypto Predictions event bots — /api/admin/event-bot. */
export const adminEventBotRouter: RouterType = Router();

function serializeConfig(c: Awaited<ReturnType<typeof getEventBotConfig>>) {
  return {
    enabled: c.enabled,
    perPoolCap: c.perPoolCap.toString(),
    perPoolVariancePct: c.perPoolVariancePct,
    perCycleCap: c.perCycleCap.toString(),
    maxTotalExposure: c.maxTotalExposure.toString(),
    treasuryFloor: c.treasuryFloor.toString(),
    betMin: c.betMin.toString(),
    betMax: c.betMax.toString(),
    intervalSeconds: c.intervalSeconds,
    lockMarginSeconds: c.lockMarginSeconds,
    walletUsdcTopup: c.walletUsdcTopup.toString(),
    walletSolTopup: c.walletSolTopup,
    closingBetEnabled: c.closingBetEnabled,
    closingWindowSeconds: c.closingWindowSeconds,
    closingSafetySeconds: c.closingSafetySeconds,
    closingPerPoolCap: c.closingPerPoolCap.toString(),
    closingBetMin: c.closingBetMin.toString(),
    closingBetMax: c.closingBetMax.toString(),
  };
}

// GET / - current config
adminEventBotRouter.get('/', async (_req, res) => {
  try {
    res.json({ success: true, data: serializeConfig(await getEventBotConfig()) });
  } catch (e) {
    console.error('[Admin] event-bot get config error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to load config' } });
  }
});

// PUT / - update config (all fields optional). BigInt fields arrive as strings.
adminEventBotRouter.put('/', async (req, res) => {
  try {
    const b = req.body ?? {};
    const data: Record<string, bigint | number | boolean> = {};
    const bigFields = ['perPoolCap', 'perCycleCap', 'maxTotalExposure', 'treasuryFloor', 'betMin', 'betMax', 'walletUsdcTopup', 'closingPerPoolCap', 'closingBetMin', 'closingBetMax'];
    for (const f of bigFields) {
      if (b[f] != null && b[f] !== '') {
        try { data[f] = BigInt(b[f]); } catch { return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: `${f} must be an integer (micro-USDC)` } }); }
      }
    }
    for (const f of ['intervalSeconds', 'lockMarginSeconds', 'walletSolTopup', 'closingWindowSeconds', 'closingSafetySeconds']) {
      if (b[f] != null && b[f] !== '') data[f] = Number(b[f]);
    }
    if (b.perPoolVariancePct != null && b.perPoolVariancePct !== '') data.perPoolVariancePct = Math.max(0, Math.min(100, Math.round(Number(b.perPoolVariancePct))));
    if (typeof b.enabled === 'boolean') data.enabled = b.enabled;
    if (typeof b.closingBetEnabled === 'boolean') data.closingBetEnabled = b.closingBetEnabled;

    await getEventBotConfig();
    const updated = await prisma.eventBotConfig.update({ where: { id: 'default' }, data: data as Prisma.EventBotConfigUpdateInput });
    res.json({ success: true, data: serializeConfig(updated) });
  } catch (e) {
    console.error('[Admin] event-bot update error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update config' } });
  }
});

// POST /kill - hard stop (enabled=false)
adminEventBotRouter.post('/kill', async (_req, res) => {
  try {
    await getEventBotConfig();
    await prisma.eventBotConfig.update({ where: { id: 'default' }, data: { enabled: false } });
    res.json({ success: true });
  } catch (e) {
    console.error('[Admin] event-bot kill error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to stop bot' } });
  }
});

// GET /status - live view (cluster, funder, wallets, exposure, diagnostics, recent bets)
adminEventBotRouter.get('/status', async (_req, res) => {
  try {
    const cluster = getCluster();
    const funder = getFunderKeypair();
    const wallets = getEventBotKeypairs();

    const funderInfo = funder ? { pubkey: funder.publicKey.toBase58(), usdc: (await getUsdcBalance(funder.publicKey)).toString(), sol: (await getSolBalance(funder.publicKey)) / LAMPORTS_PER_SOL } : null;

    const walletInfos = [];
    for (const w of wallets) {
      walletInfos.push({ pubkey: w.publicKey.toBase58(), usdc: (await getUsdcBalance(w.publicKey)).toString(), sol: (await getSolBalance(w.publicKey)) / LAMPORTS_PER_SOL });
    }

    const botAddrs = wallets.map((w) => w.publicKey.toBase58());
    const openBets = botAddrs.length > 0 ? await prisma.bet.findMany({ where: { walletAddress: { in: botAddrs }, pool: { status: { in: ['JOINING', 'ACTIVE'] } } }, select: { amount: true } }) : [];
    const exposure = openBets.reduce((s, b) => s + b.amount, 0n).toString();

    const recent = botAddrs.length > 0
      ? await prisma.bet.findMany({
          where: { walletAddress: { in: botAddrs }, pool: { poolType: 'CRYPTO' } },
          orderBy: { createdAt: 'desc' }, take: 40,
          select: { id: true, poolId: true, side: true, amount: true, createdAt: true, walletAddress: true, pool: { select: { asset: true, interval: true, status: true } } },
        })
      : [];

    res.json({
      success: true,
      data: {
        cluster,
        funder: funderInfo,
        funderConfigured: cluster === 'devnet' || funder != null,
        walletCount: wallets.length,
        wallets: walletInfos,
        openExposure: exposure,
        diagnostics: getEventBotDiagnostics(),
        recentBets: recent.map((r) => ({ ...r, amount: r.amount.toString() })),
      },
    });
  } catch (e) {
    console.error('[Admin] event-bot status error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to load status' } });
  }
});
