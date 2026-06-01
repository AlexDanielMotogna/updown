/**
 * One-shot cleanup for rows in sports_fixture_cache where the (sport, league)
 * pair is incoherent — typically left over from an earlier misconfiguration.
 *
 * Mirrors the SPORT_LEAGUE_WHITELIST guard now baked into fixture-sync's
 * upsertMatch; new pollution can't appear, but historical rows still need a
 * one-time purge.
 *
 * Usage:  node scripts/cleanup-cache-pollution.mjs        # dry-run
 *         node scripts/cleanup-cache-pollution.mjs --apply
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const SPORT_LEAGUE_WHITELIST = {
  FOOTBALL: new Set(['PL','PD','CL','EL','SA','BL1','FL1','BSA','ELC','DED','PPL','CLI','WC','MLS']),
  NBA: new Set(['NBA']),
  NHL: new Set(['NHL']),
  NFL: new Set(['NFL']),
  MMA: new Set(['MMA']),
  MLB: new Set(['MLB']),
  F1: new Set(['F1']),
  TENNIS: new Set(['TENNIS']),
  RUGBY: new Set(['RUGBY']),
  CRICKET: new Set(['CRICKET']),
  ESPORTS: new Set(['ESPORTS']),
  BOXING: new Set(['BOXING']),
  GOLF: new Set(['GOLF']),
  POLYMARKET: new Set(['PM_POLITICS','PM_GEO','PM_CULTURE','PM_FINANCE','PM_SCIENCE','PM_SPORTS','PM_CLIMATE','PM_CRYPTO']),
};

const apply = process.argv.includes('--apply');

const distinct = await prisma.$queryRaw`
  SELECT sport, league, COUNT(*)::int AS n
  FROM sports_fixture_cache
  GROUP BY sport, league
  ORDER BY n DESC
`;

const polluted = [];
for (const row of distinct) {
  const allowed = SPORT_LEAGUE_WHITELIST[row.sport];
  if (!allowed) continue;                  // unknown sport — leave alone
  if (!allowed.has(row.league)) polluted.push(row);
}

console.log(`Polluted (sport, league) pairs found: ${polluted.length}\n`);
let total = 0;
for (const p of polluted) {
  console.log(`  sport=${p.sport} league=${p.league}  ${p.n} rows`);
  total += p.n;
}
console.log(`\nTotal rows to delete: ${total}`);

if (!apply) {
  console.log('\nDry-run. Re-run with --apply to actually delete.');
  await prisma.$disconnect();
  process.exit(0);
}

let deleted = 0;
for (const p of polluted) {
  const r = await prisma.sportsFixtureCache.deleteMany({ where: { sport: p.sport, league: p.league } });
  console.log(`  Deleted ${r.count} rows for (${p.sport}, ${p.league})`);
  deleted += r.count;
}

await prisma.eventLog.create({
  data: {
    eventType: 'CACHE_POLLUTION_CLEANUP',
    entityType: 'system',
    entityId: 'sports_fixture_cache',
    payload: {
      pairs: polluted.map(p => `${p.sport}/${p.league}=${p.n}`),
      totalDeleted: deleted,
      note: 'One-shot cleanup of (sport, league) pairs outside SPORT_LEAGUE_WHITELIST. Future pollution prevented by upsertMatch guard.',
    },
  },
});
console.log(`\nDeleted ${deleted} rows total. Logged CACHE_POLLUTION_CLEANUP event.`);

await prisma.$disconnect();
