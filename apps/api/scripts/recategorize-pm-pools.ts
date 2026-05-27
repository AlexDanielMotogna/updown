/**
 * Re-categorize existing Polymarket pools (and fixture-cache rows) using the
 * current categorization logic (category-config matchPriority + tags). Updates
 * `league` + `subcategory` so events that were wrongly captured by the generic
 * Politics category move to their specific category (e.g. Iran/China → Geo).
 *
 * Idempotent. Run AFTER (re)seeding poolCategory so the config has the latest
 * matchPriority/tags. Pools keep their current league if no category matches.
 *
 * Usage: DATABASE_URL="postgresql://..." npx tsx scripts/recategorize-pm-pools.ts
 */
import { prisma } from '../src/db';
import { categorizeEvent } from '../src/services/sports/polymarket-adapter';
import { pickSubcategory } from '../src/services/category-config';

function parseTags(raw: string | null): string[] {
  if (!raw) return [];
  try { const a = JSON.parse(raw); return Array.isArray(a) ? a.filter((t): t is string => typeof t === 'string') : []; }
  catch { return []; }
}

async function recategorizePools() {
  const pools = await prisma.pool.findMany({
    where: { league: { startsWith: 'PM_' } },
    select: { id: true, league: true, tags: true },
  });
  const moves: Record<string, number> = {};
  let moved = 0;
  for (const p of pools) {
    const tags = parseTags(p.tags);
    const cat = await categorizeEvent(tags.map(l => ({ label: l })));
    const newLeague = cat?.code ?? p.league!;        // keep current if uncategorized
    const newSub = await pickSubcategory(newLeague, tags);
    if (newLeague !== p.league) {
      moves[`${p.league}→${newLeague}`] = (moves[`${p.league}→${newLeague}`] || 0) + 1;
      moved++;
    }
    await prisma.pool.update({ where: { id: p.id }, data: { league: newLeague, subcategory: newSub } });
  }
  return { total: pools.length, moved, moves };
}

async function recategorizeCache() {
  const rows = await prisma.sportsFixtureCache.findMany({
    where: { sport: 'POLYMARKET' },
    select: { id: true, league: true, leagueName: true, tags: true },
  });
  let moved = 0;
  for (const r of rows) {
    const tags = parseTags(r.tags);
    const cat = await categorizeEvent(tags.map(l => ({ label: l })));
    const newLeague = cat?.code ?? r.league;
    const newName = cat?.name ?? r.leagueName;
    const newSub = await pickSubcategory(newLeague, tags);
    if (newLeague !== r.league) moved++;
    await prisma.sportsFixtureCache.update({ where: { id: r.id }, data: { league: newLeague, leagueName: newName, subcategory: newSub } });
  }
  return { total: rows.length, moved };
}

async function main() {
  console.log('[Recat] Re-categorizing PM pools + cache...');
  const p = await recategorizePools();
  const c = await recategorizeCache();

  console.log(`\n[Recat] Pools: ${p.total} total, ${p.moved} moved category`);
  for (const [k, v] of Object.entries(p.moves).sort((a, b) => b[1] - a[1])) console.log(`   ${String(v).padStart(3)}  ${k}`);
  console.log(`[Recat] Cache: ${c.total} rows, ${c.moved} moved`);

  const byLeague = await prisma.pool.groupBy({ by: ['league'], where: { league: { startsWith: 'PM_' } }, _count: { _all: true } });
  console.log('\n[Recat] PM pools by league now:');
  for (const r of byLeague.sort((a, b) => b._count._all - a._count._all)) console.log(`   ${String(r._count._all).padStart(3)}  ${r.league}`);

  await prisma.$disconnect();
}
main().catch((e) => { console.error('[Recat] failed:', e); process.exit(1); });
