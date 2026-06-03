/**
 * Smoke-test the CTF resolver against real conditionIds from the local DB.
 *
 * Probes recent PM cache rows + a hand-picked set of known-resolved
 * markets from Polymarket's closed feed. Confirms:
 *   - POLYGON_RPC_URL is wired and reachable
 *   - readCtfResolution decodes payoutNumerators correctly
 *   - resolved outcomes match the Gamma-derived winner
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." POLYGON_RPC_URL="..." \
 *     npx tsx scripts/test-ctf-resolver.ts
 */
import 'dotenv/config';
import { prisma } from '../src/db';
import { readCtfResolution } from '../src/services/polymarket/ctf-resolver';
import { polymarketFetch } from '../src/services/sports/polymarket-fetch';

async function probeOurCache(): Promise<void> {
  const rows = await prisma.sportsFixtureCache.findMany({
    where: {
      sport: 'POLYMARKET',
      conditionId: { not: null },
    },
    select: { externalId: true, conditionId: true, status: true, homeTeam: true, winner: true },
    orderBy: { kickoff: 'desc' },
    take: 10,
  });
  console.log(`── Our cache (${rows.length} rows with conditionId) ──`);
  for (const row of rows) {
    const start = Date.now();
    const state = await readCtfResolution(row.conditionId!);
    const ms = Date.now() - start;
    const outcome = 'outcome' in state ? (state.outcome === 1 ? 'HOME/YES' : 'AWAY/NO') : '';
    console.log(`  [${row.externalId}] cache=${row.status}${row.winner ? `/${row.winner}` : ''}  ctf=${state.kind}${outcome ? `/${outcome}` : ''}  ${ms}ms  "${(row.homeTeam || '').slice(0, 40)}"`);
  }
  console.log('');
}

async function probeKnownResolved(): Promise<void> {
  const list = await polymarketFetch('/markets?closed=true&limit=5&order=endDate&ascending=false');
  console.log(`── Known-resolved markets from Gamma /markets?closed=true (${list.length}) ──`);
  let matches = 0;
  let mismatches = 0;
  for (const m of list) {
    const cid: string | undefined = m.conditionId;
    if (!cid) continue;
    const prices: string[] = JSON.parse(m.outcomePrices || '[]');
    const gammaSays = prices[0] === '1' ? 'HOME/YES' : prices[1] === '1' ? 'AWAY/NO' : 'unknown';
    const start = Date.now();
    const state = await readCtfResolution(cid);
    const ms = Date.now() - start;
    const ctfSays = 'outcome' in state ? (state.outcome === 1 ? 'HOME/YES' : 'AWAY/NO') : null;
    const verdict = ctfSays && gammaSays === ctfSays ? ' ✓match' : ctfSays ? ' ✗MISMATCH' : '';
    if (verdict === ' ✓match') matches++;
    if (verdict === ' ✗MISMATCH') mismatches++;
    console.log(`  [${m.id}] gamma=${gammaSays}  ctf=${state.kind}${ctfSays ? `/${ctfSays}` : ''}${verdict}  ${ms}ms  "${(m.question || '').slice(0, 40)}"`);
  }
  console.log(`  → CTF vs Gamma: ${matches} match, ${mismatches} MISMATCH\n`);
}

async function main(): Promise<void> {
  if (!process.env.POLYGON_RPC_URL) {
    console.error('[Smoke] POLYGON_RPC_URL not set');
    process.exit(1);
  }
  await probeOurCache();
  await probeKnownResolved();
  console.log('[Smoke] Done.');
}

main()
  .then(() => prisma.$disconnect())
  .catch(err => {
    console.error('[Smoke] Fatal:', err);
    prisma.$disconnect().finally(() => process.exit(1));
  });
