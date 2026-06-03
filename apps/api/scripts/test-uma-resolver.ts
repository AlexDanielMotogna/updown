/**
 * Smoke-test the UMA resolver against real questionIds from the local DB.
 *
 * Picks recent PM cache rows that have a questionId — preferring FINISHED
 * markets so we exercise the QuestionResolved event scan path — and calls
 * readUmaQuestion() on each. Confirms:
 *   - POLYGON_RPC_URL is wired and reachable
 *   - The adapter address and ABI match (no decode errors)
 *   - QuestionResolved event scan finds outcomes for already-FINISHED rows
 *   - UMA's outcome matches the Gamma-derived winner stored in the cache
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." POLYGON_RPC_URL="..." \
 *     npx tsx scripts/test-uma-resolver.ts
 */
import { prisma } from '../src/db';
import { readUmaQuestion } from '../src/services/polymarket/uma-resolver';

async function probe(label: string, where: { status: string; take: number }): Promise<void> {
  const rows = await prisma.sportsFixtureCache.findMany({
    where: {
      sport: 'POLYMARKET',
      questionId: { not: null },
      status: where.status,
    },
    select: { externalId: true, questionId: true, status: true, homeTeam: true, kickoff: true, winner: true },
    orderBy: { kickoff: 'desc' },
    take: where.take,
  });
  console.log(`── ${label}: ${rows.length} markets ────────────────────────────────`);
  let matches = 0;
  let mismatches = 0;
  for (const row of rows) {
    const start = Date.now();
    const state = await readUmaQuestion(row.questionId!);
    const ms = Date.now() - start;
    const title = (row.homeTeam || '').slice(0, 40);
    const umaOutcome = 'outcome' in state ? (state.outcome === 1 ? 'HOME' : 'AWAY') : null;
    const verdict = state.kind === 'resolved' && row.winner
      ? (umaOutcome === row.winner ? ' ✓match' : ' ✗MISMATCH')
      : '';
    if (verdict === ' ✓match') matches++;
    if (verdict === ' ✗MISMATCH') mismatches++;
    console.log(`  [${row.externalId}] cache=${row.status}${row.winner ? `/${row.winner}` : ''}  uma=${state.kind}${umaOutcome ? `/${umaOutcome}` : ''}${verdict}  ${ms}ms  "${title}"`);
    if ('error' in state) console.log(`    ↳ rpc error: ${state.error.slice(0, 120)}`);
  }
  if (matches > 0 || mismatches > 0) {
    console.log(`  → UMA vs Gamma winner: ${matches} match, ${mismatches} MISMATCH`);
  }
  console.log('');
}

async function main(): Promise<void> {
  if (!process.env.POLYGON_RPC_URL) {
    console.error('[Smoke] POLYGON_RPC_URL not set — set it in apps/api/.env first');
    process.exit(1);
  }
  await probe('FINISHED markets (exercise event scan + winner match)', { status: 'FINISHED', take: 5 });
  await probe('SCHEDULED markets (should all be pending)', { status: 'SCHEDULED', take: 5 });
  console.log('[Smoke] Done.');
}

main()
  .then(() => prisma.$disconnect())
  .catch(err => {
    console.error('[Smoke] Fatal:', err);
    prisma.$disconnect().finally(() => process.exit(1));
  });
