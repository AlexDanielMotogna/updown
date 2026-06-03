/**
 * Wipe pool-flow tables from whatever DATABASE_URL points at.
 *
 * Scope (per the 2026-06-03 decision):
 *   • pools                  — the pools themselves
 *   • bets                   — user bets on pools
 *   • price_snapshots        — STRIKE/FINAL price entries per pool
 *   • sports_fixture_cache   — PM/sports cache (forces fresh ingest with
 *                              the new conditionId field)
 *   • live_scores            — cached match progress
 *   • event_log              — POOL audit entries
 *   • notifications          — user-facing alerts tied to pool/bet events
 *   • reward_logs            — XP/coins history (mostly bet-derived)
 *
 * Preserved (config / identity):
 *   users, pool_categories, emission_configs, referrals*,
 *   squads*, tournaments*, uptime_checks, fighter_image_cache,
 *   _prisma_migrations.
 *
 * Order doesn't matter because TRUNCATE … CASCADE handles FK
 * dependencies in one shot. RESTART IDENTITY resets serial sequences
 * (not strictly necessary because we use uuid PKs everywhere, but
 * harmless and matches the convention for a clean slate).
 *
 * Usage:
 *   DATABASE_URL="postgresql://…" npx tsx scripts/wipe-pool-flow.ts
 *
 * Add --confirm to skip the type-the-host prompt (CI / scripted use).
 */
import 'dotenv/config';
import { prisma } from '../src/db';

const TABLES = [
  'bets',
  'price_snapshots',
  'reward_logs',
  'notifications',
  'live_scores',
  'event_log',
  'sports_fixture_cache',
  'pools',
] as const;

function getHostFromUrl(url: string | undefined): string {
  if (!url) return '(no DATABASE_URL)';
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port || '5432'}`;
  } catch {
    return '(unparseable URL)';
  }
}

async function tableCount(name: string): Promise<bigint> {
  const rows = await prisma.$queryRawUnsafe<{ count: bigint }[]>(`SELECT count(*)::bigint AS count FROM "${name}"`);
  return rows[0]?.count ?? 0n;
}

async function main(): Promise<void> {
  const host = getHostFromUrl(process.env.DATABASE_URL);
  console.log(`[Wipe] Target: ${host}`);
  console.log(`[Wipe] Tables to TRUNCATE … CASCADE: ${TABLES.join(', ')}`);
  console.log('');

  console.log('[Wipe] Row counts BEFORE:');
  for (const t of TABLES) {
    try {
      const c = await tableCount(t);
      console.log(`  ${t.padEnd(22)} ${c}`);
    } catch (err) {
      console.log(`  ${t.padEnd(22)} (error: ${err instanceof Error ? err.message.slice(0, 60) : err})`);
    }
  }
  console.log('');

  if (!process.argv.includes('--confirm')) {
    console.log('[Wipe] Add --confirm to actually run TRUNCATE.');
    return;
  }

  // Single statement so the CASCADE chain runs as one transaction.
  // Quote the identifiers to survive any reserved-word collisions.
  const stmt = `TRUNCATE ${TABLES.map(t => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`;
  console.log(`[Wipe] Executing: ${stmt}`);
  await prisma.$executeRawUnsafe(stmt);
  console.log('[Wipe] Done.');

  console.log('');
  console.log('[Wipe] Row counts AFTER:');
  for (const t of TABLES) {
    try {
      const c = await tableCount(t);
      console.log(`  ${t.padEnd(22)} ${c}`);
    } catch (err) {
      console.log(`  ${t.padEnd(22)} (error: ${err instanceof Error ? err.message.slice(0, 60) : err})`);
    }
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(err => {
    console.error('[Wipe] Fatal:', err);
    prisma.$disconnect().finally(() => process.exit(1));
  });
