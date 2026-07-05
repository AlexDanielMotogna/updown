import { PrismaClient } from '@prisma/client';

/**
 * Seed / activate an emission epoch for the UP Coins faucet.
 *
 * The active epoch (active = true, highest epoch) gates coin emission via
 * src/services/emission.ts. Express the DECAY schedule as data: create each new
 * epoch with a smaller `totalAllocated` than the last so the 3.2B P2E bucket lasts.
 *
 * Env knobs (all optional; sensible defaults for testing):
 *   EMISSION_EPOCH          epoch number (default: next after the current max)
 *   EMISSION_DAILY_CAP      global daily cap, stored units (default 5,000,000 = 50k UP)
 *   EMISSION_TOTAL_ALLOC    epoch budget, stored units    (default 0 = unlimited)
 *   EMISSION_COINS_PER_USDC display coins per $1 bet, stored units (default 10)
 *   EMISSION_WIN_MULT_BPS   win multiplier basis points   (default 5000 = 50%)
 *   EMISSION_ACTIVE         'false' to seed inactive       (default active)
 *
 * Usage (from apps/api):
 *   node scripts/seed-emission.mjs
 *   EMISSION_DAILY_CAP=2000000 EMISSION_TOTAL_ALLOC=320000000000 node scripts/seed-emission.mjs
 */

const prisma = new PrismaClient();

const bigOr = (v, d) => (v == null || v === '' ? d : BigInt(v));
const intOr = (v, d) => (v == null || v === '' ? d : Number(v));

const maxRow = await prisma.emissionConfig.aggregate({ _max: { epoch: true } });
const epoch = intOr(process.env.EMISSION_EPOCH, (maxRow._max.epoch ?? 0) + 1);

const dailyCoinsCap = bigOr(process.env.EMISSION_DAILY_CAP, 5_000_000n);
const totalAllocated = bigOr(process.env.EMISSION_TOTAL_ALLOC, 0n);
const coinsPerUsdcBet = bigOr(process.env.EMISSION_COINS_PER_USDC, 10n);
const winMultiplier = intOr(process.env.EMISSION_WIN_MULT_BPS, 5000);
const active = process.env.EMISSION_ACTIVE !== 'false';

// Only one epoch should be active at a time — deactivate the others first.
if (active) {
  await prisma.emissionConfig.updateMany({ where: { active: true }, data: { active: false } });
}

const row = await prisma.emissionConfig.upsert({
  where: { epoch },
  update: { dailyCoinsCap, totalAllocated, coinsPerUsdcBet, winMultiplier, active },
  create: {
    epoch,
    dailyCoinsCap,
    totalAllocated,
    coinsPerUsdcBet,
    winMultiplier,
    epochStartDate: new Date(),
    active,
  },
});

console.log(
  JSON.stringify(
    {
      env: process.env.ENV_LABEL ?? '?',
      epoch: row.epoch,
      active: row.active,
      dailyCoinsCap: row.dailyCoinsCap.toString(),
      totalAllocated: row.totalAllocated.toString(),
      totalDistributed: row.totalDistributed.toString(),
      note: 'caps of 0 = unlimited; decay = seed each next epoch with a smaller totalAllocated',
    },
    null,
    2,
  ),
);
await prisma.$disconnect();
