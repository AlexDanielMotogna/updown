import { Prisma } from '@prisma/client';
import { prisma } from '../db';

/**
 * Emission budget control for the UP Coins faucet.
 *
 * The app can EMIT coins (bet wins, trading volume, milestones) but until now had
 * no ceiling — aggregate emission was unlimited, which dilutes presale buyers and
 * is the death spiral docs/UP-UTILITY-SPEC.md warns about. This service gates every
 * coin-emitting path against the active `EmissionConfig`:
 *
 *   - epoch cap:  totalDistributed <= totalAllocated  (0 = unlimited)
 *   - daily cap:  sum(EmissionDaily.distributed today) <= dailyCoinsCap  (0 = unlimited)
 *
 * The decay schedule is expressed as DATA: seed successive epochs with a smaller
 * `totalAllocated` (see scripts/seed-emission.mjs) so the 3.2B P2E bucket lasts.
 *
 * Back-compat: when NO active config exists, `reserveEmission`/`recordEmission`
 * pass the full amount through and record nothing, so behavior is unchanged until
 * an admin activates an epoch.
 *
 * Continuous, farmable faucets (bet/trade coins) use `reserveEmission` (clamps to
 * remaining budget). Fixed one-time grants (20-bet reward, referrer reward) use
 * `recordEmission` (never clamped — a promised reward is always paid in full — but
 * still accounted so the dashboard stays accurate).
 */

type TxClient = Prisma.TransactionClient;

/** UTC day key 'YYYY-MM-DD'. */
export function utcDayKey(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

// Cheap module cache for the common "no active config" fast path, so the current
// hot path (emission control not yet configured) adds no query latency. Only
// caches PRESENCE; the actual counters are always read fresh inside the tx.
let activePresence: { at: number; present: boolean } | null = null;
const PRESENCE_TTL_MS = 15_000;

/** Call after admin activates/deactivates an epoch so the fast path re-checks. */
export function invalidateEmissionCache(): void {
  activePresence = null;
}

async function hasActiveConfig(): Promise<boolean> {
  const now = Date.now();
  if (activePresence && now - activePresence.at < PRESENCE_TTL_MS) {
    return activePresence.present;
  }
  const cfg = await prisma.emissionConfig.findFirst({
    where: { active: true },
    select: { id: true },
  });
  activePresence = { at: now, present: !!cfg };
  return !!cfg;
}

async function consume(tx: TxClient, requested: bigint, clamp: boolean): Promise<bigint> {
  if (requested <= 0n) return 0n;
  // Fast path: no emission control configured → passthrough, no accounting.
  if (!(await hasActiveConfig())) return requested;

  const cfg = await tx.emissionConfig.findFirst({
    where: { active: true },
    orderBy: { epoch: 'desc' },
  });
  if (!cfg) return requested; // deactivated between the cache check and now

  // Remaining budgets; null = unlimited (cap of 0).
  const epochRemaining =
    cfg.totalAllocated > 0n
      ? cfg.totalAllocated > cfg.totalDistributed
        ? cfg.totalAllocated - cfg.totalDistributed
        : 0n
      : null;

  const day = utcDayKey();
  const daily = await tx.emissionDaily.findUnique({ where: { day } });
  const dayDistributed = daily?.distributed ?? 0n;
  const dailyRemaining =
    cfg.dailyCoinsCap > 0n
      ? cfg.dailyCoinsCap > dayDistributed
        ? cfg.dailyCoinsCap - dayDistributed
        : 0n
      : null;

  let grant = requested;
  if (clamp) {
    if (epochRemaining !== null && grant > epochRemaining) grant = epochRemaining;
    if (dailyRemaining !== null && grant > dailyRemaining) grant = dailyRemaining;
  }
  if (grant <= 0n) return 0n;

  await tx.emissionConfig.update({
    where: { id: cfg.id },
    data: { totalDistributed: { increment: grant } },
  });
  await tx.emissionDaily.upsert({
    where: { day },
    create: { day, distributed: grant },
    update: { distributed: { increment: grant } },
  });

  return grant;
}

/**
 * Reserve emission for a continuous/farmable faucet. Returns how much may actually
 * be granted right now (<= requested), clamped to the remaining epoch + daily
 * budget, and atomically books it. MUST be called inside the same `$transaction`
 * as the coin credit so the counters can't drift.
 */
export function reserveEmission(tx: TxClient, requested: bigint): Promise<bigint> {
  return consume(tx, requested, true);
}

/**
 * Account a fixed, always-paid grant (one-time rewards). Never clamps — returns the
 * full amount — but still increments the counters for the dashboard.
 */
export function recordEmission(tx: TxClient, amount: bigint): Promise<bigint> {
  return consume(tx, amount, false);
}

/**
 * Scale a set of component amounts down to a granted total, preserving the
 * invariant sum(out) === granted. Used when `reserveEmission` clamps a multi-part
 * award (base + win + streak + level-up) so the per-component RewardLog rows still
 * sum to the coins actually credited.
 */
export function scaleComponents(components: bigint[], granted: bigint, requested: bigint): bigint[] {
  if (requested <= 0n) return components.map(() => 0n);
  if (granted >= requested) return components;
  if (granted <= 0n) return components.map(() => 0n);

  const out = components.map((c) => (c * granted) / requested);
  let used = out.reduce((s, c) => s + c, 0n);
  // Distribute the integer-division remainder, 1 unit at a time, to the largest
  // components first so rounding favors the dominant reward.
  let rem = granted - used;
  const order = components
    .map((c, i) => ({ c, i }))
    .sort((a, b) => (b.c > a.c ? 1 : b.c < a.c ? -1 : 0));
  for (let k = 0; k < order.length && rem > 0n; k++) {
    out[order[k].i] += 1n;
    rem -= 1n;
  }
  return out;
}

export interface EmissionStats {
  active: boolean;
  epoch: number | null;
  dailyCoinsCap: bigint;
  todayDistributed: bigint;
  totalAllocated: bigint;
  totalDistributed: bigint;
}

/** All emission epochs, newest first (admin dashboard). */
export function listEmissionConfigs() {
  return prisma.emissionConfig.findMany({ orderBy: { epoch: 'desc' } });
}

export interface UpsertEmissionInput {
  epoch?: number;
  dailyCoinsCap: bigint;
  totalAllocated: bigint;
  coinsPerUsdcBet?: bigint;
  winMultiplier?: number;
  active: boolean;
}

/**
 * Create or update an emission epoch (admin). When `active` is true, every other
 * epoch is deactivated so exactly one is live. Invalidates the presence cache.
 */
export async function upsertEmissionConfig(input: UpsertEmissionInput) {
  const maxRow = await prisma.emissionConfig.aggregate({ _max: { epoch: true } });
  const epoch = input.epoch ?? (maxRow._max.epoch ?? 0) + 1;
  if (input.active) {
    await prisma.emissionConfig.updateMany({ where: { active: true, NOT: { epoch } }, data: { active: false } });
  }
  const row = await prisma.emissionConfig.upsert({
    where: { epoch },
    update: {
      dailyCoinsCap: input.dailyCoinsCap,
      totalAllocated: input.totalAllocated,
      ...(input.coinsPerUsdcBet != null ? { coinsPerUsdcBet: input.coinsPerUsdcBet } : {}),
      ...(input.winMultiplier != null ? { winMultiplier: input.winMultiplier } : {}),
      active: input.active,
    },
    create: {
      epoch,
      dailyCoinsCap: input.dailyCoinsCap,
      totalAllocated: input.totalAllocated,
      coinsPerUsdcBet: input.coinsPerUsdcBet ?? 10n,
      winMultiplier: input.winMultiplier ?? 5000,
      epochStartDate: new Date(),
      active: input.active,
    },
  });
  invalidateEmissionCache();
  return row;
}

/** Activate/deactivate an epoch (admin). Activating deactivates the others. */
export async function setEmissionActive(epoch: number, active: boolean) {
  if (active) {
    await prisma.emissionConfig.updateMany({ where: { active: true, NOT: { epoch } }, data: { active: false } });
  }
  const row = await prisma.emissionConfig.update({ where: { epoch }, data: { active } });
  invalidateEmissionCache();
  return row;
}

/** Snapshot for the emission-vs-sink dashboard. */
export async function getEmissionStats(): Promise<EmissionStats> {
  const cfg = await prisma.emissionConfig.findFirst({
    where: { active: true },
    orderBy: { epoch: 'desc' },
  });
  const today = await prisma.emissionDaily.findUnique({ where: { day: utcDayKey() } });
  return {
    active: !!cfg,
    epoch: cfg?.epoch ?? null,
    dailyCoinsCap: cfg?.dailyCoinsCap ?? 0n,
    todayDistributed: today?.distributed ?? 0n,
    totalAllocated: cfg?.totalAllocated ?? 0n,
    totalDistributed: cfg?.totalDistributed ?? 0n,
  };
}
