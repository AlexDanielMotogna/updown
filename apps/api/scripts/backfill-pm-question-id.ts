/**
 * One-time backfill: populate `questionId` on existing Polymarket fixture-cache
 * rows so the UMA-direct resolver (services/polymarket/uma-resolver.ts) can
 * read settlement straight from UmaCtfAdapter on Polygon.
 *
 * New rows already get questionId at ingest time (polymarket-sync.ts:upsert).
 * This script catches everything that was synced before the column existed.
 *
 * Behaviour:
 *   - Iterate rows where questionId IS NULL and the cache isn't already
 *     CANCELLED (no point chasing dead markets — Gamma will return [] anyway).
 *   - For each, fetch /markets?id=<externalId> from Gamma.
 *   - Write the normalised 0x… bytes32. Skip rows whose Gamma response omits
 *     questionID (admin-resolved specials) — leave them NULL so the resolver
 *     falls through to Gamma.
 *   - Throttle 200ms between calls (Gamma rate-limits aggressive callers).
 *   - Idempotent: re-running only touches still-null rows.
 *
 * Usage (point DATABASE_URL at the target DB):
 *   DATABASE_URL="postgresql://..." npx tsx scripts/backfill-pm-question-id.ts
 *
 * Add `--dry-run` to log what would be written without touching the DB.
 */
import { prisma } from '../src/db';
import { polymarketFetch } from '../src/services/sports/polymarket-fetch';

const THROTTLE_MS = 200;
const DRY_RUN = process.argv.includes('--dry-run');

function normalizeQuestionId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withPrefix = trimmed.toLowerCase().startsWith('0x') ? trimmed.toLowerCase() : `0x${trimmed.toLowerCase()}`;
  if (withPrefix.length !== 66) return null;
  if (!/^0x[0-9a-f]{64}$/.test(withPrefix)) return null;
  return withPrefix;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const rows = await prisma.sportsFixtureCache.findMany({
    where: {
      sport: 'POLYMARKET',
      questionId: null,
      status: { notIn: ['CANCELLED'] },
    },
    select: { id: true, externalId: true, league: true, homeTeam: true, status: true },
  });

  console.log(`[Backfill] Found ${rows.length} PM fixture rows missing questionId${DRY_RUN ? ' (DRY-RUN)' : ''}`);

  let updated = 0;
  let delisted = 0;
  let missing = 0;
  let errors = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const data = await polymarketFetch(`/markets?id=${row.externalId}`);
      if (Array.isArray(data) && data.length === 0) {
        // Gamma delisted — questionId is gone from the editorial layer. The
        // adapter on Polygon still has it, but without the id we can't query.
        // Leave NULL; the next sweep will cancel via the existing path.
        delisted++;
        if (i < 5) console.log(`  [${row.externalId}] delisted from Gamma — leaving questionId NULL`);
      } else {
        const market = Array.isArray(data) ? data[0] : data;
        const questionId = normalizeQuestionId(market?.questionID);
        if (!questionId) {
          missing++;
          if (i < 5) console.log(`  [${row.externalId}] Gamma response lacks questionID — admin-resolved special?`);
        } else {
          if (DRY_RUN) {
            if (i < 5) console.log(`  [${row.externalId}] would set questionId=${questionId.slice(0, 12)}…`);
          } else {
            await prisma.sportsFixtureCache.update({
              where: { id: row.id },
              data: { questionId },
            });
          }
          updated++;
        }
      }
    } catch (err) {
      errors++;
      console.warn(`  [${row.externalId}] fetch failed:`, err instanceof Error ? err.message : err);
    }

    if (i % 25 === 0 && i > 0) {
      console.log(`[Backfill] Progress ${i}/${rows.length} — updated=${updated} delisted=${delisted} missing=${missing} errors=${errors}`);
    }
    await sleep(THROTTLE_MS);
  }

  console.log(`[Backfill] Done${DRY_RUN ? ' (DRY-RUN)' : ''}: updated=${updated} delisted=${delisted} missing=${missing} errors=${errors} of ${rows.length}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(err => {
    console.error('[Backfill] Fatal:', err);
    prisma.$disconnect().finally(() => process.exit(1));
  });
