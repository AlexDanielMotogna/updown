import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';
import { prisma } from '../../db';
import {
  getEmissionStats,
  listEmissionConfigs,
  upsertEmissionConfig,
  setEmissionActive,
} from '../../services/emission';
import { getSinkStats } from '../../services/coin-spend';

/**
 * Admin UP-economy: the emission-vs-sink dashboard + EmissionConfig controls.
 * Makes the spec's `emission <= sinks + buyback` rule observable and tunable.
 */
export const adminEconomyRouter: RouterType = Router();

type ConfigRow = Awaited<ReturnType<typeof listEmissionConfigs>>[number];
const serializeConfig = (c: ConfigRow) => ({
  epoch: c.epoch,
  dailyCoinsCap: c.dailyCoinsCap.toString(),
  totalAllocated: c.totalAllocated.toString(),
  totalDistributed: c.totalDistributed.toString(),
  coinsPerUsdcBet: c.coinsPerUsdcBet.toString(),
  winMultiplier: c.winMultiplier,
  active: c.active,
  epochStartDate: c.epochStartDate.toISOString(),
});

/** GET /api/admin/economy — combined dashboard payload. */
adminEconomyRouter.get('/', async (_req, res) => {
  try {
    const [emissionStats, configs, sinkStats, byType] = await Promise.all([
      getEmissionStats(),
      listEmissionConfigs(),
      getSinkStats(),
      prisma.coinSpend.groupBy({ by: ['type'], _sum: { amount: true }, _count: true }),
    ]);

    res.json({
      success: true,
      data: {
        emission: {
          stats: {
            active: emissionStats.active,
            epoch: emissionStats.epoch,
            dailyCoinsCap: emissionStats.dailyCoinsCap.toString(),
            todayDistributed: emissionStats.todayDistributed.toString(),
            totalAllocated: emissionStats.totalAllocated.toString(),
            totalDistributed: emissionStats.totalDistributed.toString(),
          },
          configs: configs.map(serializeConfig),
        },
        sinks: {
          stats: {
            todaySpent: sinkStats.todaySpent.toString(),
            todayBurned: sinkStats.todayBurned.toString(),
            totalRedeemed: sinkStats.totalRedeemed.toString(),
          },
          byType: byType
            .map((r) => ({ type: r.type, total: (r._sum.amount ?? 0n).toString(), count: r._count }))
            .sort((a, b) => Number(BigInt(b.total) - BigInt(a.total))),
        },
      },
    });
  } catch (error) {
    console.error('[Admin] economy dashboard error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to load economy' } });
  }
});

const bigintStr = z.string().regex(/^\d+$/, 'must be a non-negative integer');
const upsertSchema = z.object({
  epoch: z.coerce.number().int().min(0).optional(),
  dailyCoinsCap: bigintStr,
  totalAllocated: bigintStr,
  active: z.boolean(),
});

/** POST /api/admin/economy/emission — create/update an epoch (caps in stored units). */
adminEconomyRouter.post('/emission', async (req, res) => {
  try {
    const parsed = upsertSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0]?.message ?? 'Invalid input' } });
    }
    const row = await upsertEmissionConfig({
      epoch: parsed.data.epoch,
      dailyCoinsCap: BigInt(parsed.data.dailyCoinsCap),
      totalAllocated: BigInt(parsed.data.totalAllocated),
      active: parsed.data.active,
    });
    res.json({ success: true, data: serializeConfig(row) });
  } catch (error) {
    console.error('[Admin] economy upsert error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to save emission config' } });
  }
});

const activeSchema = z.object({ active: z.boolean() });

/** POST /api/admin/economy/emission/:epoch/active — toggle an epoch on/off. */
adminEconomyRouter.post('/emission/:epoch/active', async (req, res) => {
  try {
    const epoch = Number(req.params.epoch);
    if (!Number.isInteger(epoch)) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid epoch' } });
    }
    const parsed = activeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'active (boolean) required' } });
    }
    const row = await setEmissionActive(epoch, parsed.data.active);
    res.json({ success: true, data: serializeConfig(row) });
  } catch (error) {
    console.error('[Admin] economy toggle error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to toggle epoch' } });
  }
});
