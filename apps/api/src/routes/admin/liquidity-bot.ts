import { Router, type Router as RouterType } from 'express';
import { Prisma } from '@prisma/client';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { prisma } from '../../db';
import { getLiquidityBotConfig } from '../../services/liquidity-bot/config';
import { getUsdcBalance, getSolBalance, getFunderKeypair } from '../../services/liquidity-bot/funding';
import { getLiquidityBotKeypairs, getCluster } from '../../utils/solana';

export const adminLiquidityBotRouter: RouterType = Router();

// BigInt config fields -> strings for JSON.
function serializeConfig(c: Awaited<ReturnType<typeof getLiquidityBotConfig>>) {
  return {
    enabled: c.enabled,
    perPoolCap: c.perPoolCap.toString(),
    perCycleCap: c.perCycleCap.toString(),
    maxTotalExposure: c.maxTotalExposure.toString(),
    treasuryFloor: c.treasuryFloor.toString(),
    betMin: c.betMin.toString(),
    betMax: c.betMax.toString(),
    intervalSeconds: c.intervalSeconds,
    lockMarginSeconds: c.lockMarginSeconds,
    walletUsdcTopup: c.walletUsdcTopup.toString(),
    walletSolTopup: c.walletSolTopup,
    poolTypesCrypto: c.poolTypesCrypto,
    poolTypesSports: c.poolTypesSports,
    poolTypesPm: c.poolTypesPm,
    sideStrategy: c.sideStrategy,
  };
}

// GET / - current config
adminLiquidityBotRouter.get('/', async (_req, res) => {
  try {
    const c = await getLiquidityBotConfig();
    res.json({ success: true, data: serializeConfig(c) });
  } catch (e) {
    console.error('[Admin] liquidity-bot get config error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to load config' } });
  }
});

// PUT / - update config (all fields optional). BigInt fields arrive as strings.
adminLiquidityBotRouter.put('/', async (req, res) => {
  try {
    const b = req.body ?? {};
    const data: Record<string, bigint | number | boolean | string> = {};
    const bigFields = ['perPoolCap', 'perCycleCap', 'maxTotalExposure', 'treasuryFloor', 'betMin', 'betMax', 'walletUsdcTopup'];
    for (const f of bigFields) {
      if (b[f] != null && b[f] !== '') {
        try { data[f] = BigInt(b[f]); } catch { return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: `${f} must be an integer (micro-USDC)` } }); }
      }
    }
    for (const f of ['intervalSeconds', 'lockMarginSeconds', 'walletSolTopup']) {
      if (b[f] != null && b[f] !== '') data[f] = Number(b[f]);
    }
    for (const f of ['enabled', 'poolTypesCrypto', 'poolTypesSports', 'poolTypesPm']) {
      if (typeof b[f] === 'boolean') data[f] = b[f];
    }
    if (typeof b.sideStrategy === 'string' && ['balanced', 'skew'].includes(b.sideStrategy)) data.sideStrategy = b.sideStrategy;

    await getLiquidityBotConfig(); // ensure row exists
    const updated = await prisma.liquidityBotConfig.update({ where: { id: 'default' }, data: data as Prisma.LiquidityBotConfigUpdateInput });
    res.json({ success: true, data: serializeConfig(updated) });
  } catch (e) {
    console.error('[Admin] liquidity-bot update error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update config' } });
  }
});

// POST /kill - hard stop (enabled=false)
adminLiquidityBotRouter.post('/kill', async (_req, res) => {
  try {
    await getLiquidityBotConfig();
    await prisma.liquidityBotConfig.update({ where: { id: 'default' }, data: { enabled: false } });
    res.json({ success: true });
  } catch (e) {
    console.error('[Admin] liquidity-bot kill error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to stop bot' } });
  }
});

// GET /status - live operational view (cluster, funder, wallets, exposure, recent bets)
adminLiquidityBotRouter.get('/status', async (_req, res) => {
  try {
    const cluster = getCluster();
    const funder = getFunderKeypair();
    const wallets = getLiquidityBotKeypairs();

    const funderInfo = funder
      ? { pubkey: funder.publicKey.toBase58(), usdc: (await getUsdcBalance(funder.publicKey)).toString(), sol: (await getSolBalance(funder.publicKey)) / LAMPORTS_PER_SOL }
      : null;

    const walletInfos = [];
    for (const w of wallets) {
      walletInfos.push({
        pubkey: w.publicKey.toBase58(),
        usdc: (await getUsdcBalance(w.publicKey)).toString(),
        sol: (await getSolBalance(w.publicKey)) / LAMPORTS_PER_SOL,
      });
    }

    const botAddrs = wallets.map(w => w.publicKey.toBase58());
    const openBets = botAddrs.length > 0
      ? await prisma.bet.findMany({ where: { walletAddress: { in: botAddrs }, pool: { status: { in: ['JOINING', 'ACTIVE'] } } }, select: { amount: true } })
      : [];
    const exposure = openBets.reduce((s, b) => s + b.amount, 0n).toString();

    const recent = botAddrs.length > 0
      ? await prisma.bet.findMany({
          where: { walletAddress: { in: botAddrs } },
          orderBy: { createdAt: 'desc' }, take: 40,
          select: {
            id: true, poolId: true, side: true, amount: true, createdAt: true, walletAddress: true,
            pool: { select: { asset: true, interval: true, poolType: true, homeTeam: true, awayTeam: true, status: true } },
          },
        })
      : [];

    res.json({
      success: true,
      data: {
        cluster,
        funder: funderInfo,
        treasuryConfigured: cluster === 'devnet' || funder != null,
        walletCount: wallets.length,
        wallets: walletInfos,
        openExposure: exposure,
        recentBets: recent.map(r => ({ ...r, amount: r.amount.toString() })),
      },
    });
  } catch (e) {
    console.error('[Admin] liquidity-bot status error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to load status' } });
  }
});
