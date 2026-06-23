import { Router, type Router as RouterType } from 'express';
import { prisma } from '../../db';

/**
 * Trading-terminal builder-code revenue for the admin panel.
 *
 * Reports ONLY what our builder code earns — the per-order builder fee that goes
 * 100% to our builder address — NOT HyperLiquid's full trading fees. The
 * authoritative number is HL's referral state `builderRewards` (per HL docs:
 * "total builder fees collected … is part of the referral state response from
 * {type:'referral', user}"). We enrich it with routed-volume context from our
 * own `trade_fills`. Mainnet only (that's where the builder code runs).
 */
export const adminBuilderRevenueRouter: RouterType = Router();

const HL_MAINNET = 'https://api.hyperliquid.xyz';

adminBuilderRevenueRouter.get('/', async (_req, res) => {
  try {
    const builderAddress = (process.env.HYPERLIQUID_BUILDER_ADDRESS || '').toLowerCase();
    const feeTenthsBps = Number(process.env.HYPERLIQUID_BUILDER_FEE) || 0;
    const feeRatePct = feeTenthsBps / 1000; // tenths-of-bp → percent (10 → 0.01%)

    if (!builderAddress) {
      return res.json({ success: true, data: { configured: false } });
    }

    // 1) Builder revenue straight from HL (authoritative, only our cut).
    let builderRevenueUsd = 0, unclaimedUsd = 0, claimedUsd = 0, hlOk = true;
    try {
      const r = await fetch(`${HL_MAINNET}/info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'referral', user: builderAddress }),
      });
      const j = (await r.json()) as {
        builderRewards?: string; unclaimedRewards?: string; claimedRewards?: string;
      };
      builderRevenueUsd = Number(j.builderRewards ?? 0);
      unclaimedUsd = Number(j.unclaimedRewards ?? 0);
      claimedUsd = Number(j.claimedRewards ?? 0);
    } catch {
      hlOk = false; // HL unreachable — surface zeros + a flag, don't 500.
    }

    // 2) Routed-volume context from our recorded fills (notionalUsd is a string
    // column → can't _sum in Prisma; load + reduce). Mainnet only.
    const fills = await prisma.tradeFill.findMany({ select: { notionalUsd: true, accountAddress: true } });
    let volumeUsd = 0;
    const traders = new Set<string>();
    for (const f of fills) {
      volumeUsd += Number(f.notionalUsd);
      traders.add(f.accountAddress);
    }

    res.json({
      success: true,
      data: {
        configured: true,
        hlOk,
        builderAddress,
        feeRatePct,
        builderRevenueUsd,
        unclaimedUsd,
        claimedUsd,
        volumeUsd,
        trades: fills.length,
        traders: traders.size,
        // Sanity-check estimate from our routed volume × the configured rate.
        estimatedFromVolumeUsd: volumeUsd * (feeRatePct / 100),
      },
    });
  } catch (error) {
    console.error('[admin] builder-revenue error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to load builder revenue' } });
  }
});
