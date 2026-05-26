/**
 * One-time backfill: compute the `subcategory` bucket for existing Polymarket
 * pools (and fixture-cache rows) from their stored raw `tags`, using the same
 * priority whitelist as live sync (category-config `pickSubcategory`).
 *
 * Safe + idempotent: only writes the `subcategory` column on PM_* rows, derived
 * deterministically. Run AFTER the add_pool_subcategory migration is applied.
 *
 * Usage (point DATABASE_URL at the target DB):
 *   DATABASE_URL="postgresql://..." npx tsx scripts/backfill-pm-subcategory.ts
 */
import { prisma } from '../src/db';
import { pickSubcategory } from '../src/services/category-config';

function parseTags(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((t): t is string => typeof t === 'string') : [];
  } catch {
    return [];
  }
}

async function backfillPools(): Promise<Record<string, Record<string, number>>> {
  const pools = await prisma.pool.findMany({
    where: { league: { startsWith: 'PM_' } },
    select: { id: true, league: true, tags: true },
  });

  const summary: Record<string, Record<string, number>> = {};
  for (const p of pools) {
    const league = p.league!;
    const sub = await pickSubcategory(league, parseTags(p.tags));
    await prisma.pool.update({ where: { id: p.id }, data: { subcategory: sub } });

    summary[league] ??= {};
    const key = sub ?? '(none)';
    summary[league][key] = (summary[league][key] || 0) + 1;
  }
  return summary;
}

async function backfillCache(): Promise<number> {
  const rows = await prisma.sportsFixtureCache.findMany({
    where: { sport: 'POLYMARKET' },
    select: { id: true, league: true, tags: true },
  });
  for (const r of rows) {
    const sub = await pickSubcategory(r.league, parseTags(r.tags));
    await prisma.sportsFixtureCache.update({ where: { id: r.id }, data: { subcategory: sub } });
  }
  return rows.length;
}

async function main() {
  console.log('[Backfill] Recomputing PM subcategories...');
  const summary = await backfillPools();
  const cacheCount = await backfillCache();

  console.log('\n[Backfill] Pools by league → bucket:');
  for (const [league, buckets] of Object.entries(summary)) {
    const total = Object.values(buckets).reduce((a, b) => a + b, 0);
    console.log(`  ${league} (${total})`);
    for (const [bucket, n] of Object.entries(buckets).sort((a, b) => b[1] - a[1])) {
      console.log(`     ${String(n).padStart(3)}  ${bucket}`);
    }
  }
  console.log(`\n[Backfill] Fixture-cache rows updated: ${cacheCount}`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error('[Backfill] failed:', e); process.exit(1); });
