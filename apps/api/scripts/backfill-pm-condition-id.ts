/**
 * One-time backfill: populate `conditionId` (and `questionId`) on existing
 * Polymarket fixture-cache rows so the CTF resolver
 * (services/polymarket/ctf-resolver.ts) can read settlement straight
 * from Polygon.
 *
 * New rows already get both ids at ingest time. This script catches the
 * cold tail — rows ingested before the columns existed and not refreshed
 * yet by the bulk sync.
 *
 * Behaviour:
 *   - Iterate rows where conditionId IS NULL and the cache isn't already
 *     CANCELLED (no point chasing dead markets).
 *   - For each, fetch /markets?id=<externalId> from Gamma.
 *   - Persist normalised 0x… bytes32 for both conditionId and questionId.
 *     Skip rows whose Gamma response omits the field.
 *   - Throttle 200ms between calls.
 *   - Idempotent: re-running only touches still-null rows.
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." npx tsx scripts/backfill-pm-condition-id.ts
 *
 * Add `--dry-run` to log what would be written without touching the DB.
 */
import 'dotenv/config';
import { prisma } from '../src/db';
import { polymarketFetch } from '../src/services/sports/polymarket-fetch';

const THROTTLE_MS = 200;
const DRY_RUN = process.argv.includes('--dry-run');

function normalizeHex32(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  const withPrefix = lower.startsWith('0x') ? lower : `0x${lower}`;
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
      conditionId: null,
      status: { notIn: ['CANCELLED'] },
    },
    select: { id: true, externalId: true, league: true, homeTeam: true, status: true, questionId: true },
  });

  console.log(`[Backfill] Found ${rows.length} PM fixture rows missing conditionId${DRY_RUN ? ' (DRY-RUN)' : ''}`);

  let updated = 0;
  let delisted = 0;
  let missing = 0;
  let errors = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const data = await polymarketFetch(`/markets?id=${row.externalId}`);
      if (Array.isArray(data) && data.length === 0) {
        delisted++;
        if (i < 5) console.log(`  [${row.externalId}] delisted from Gamma — leaving conditionId NULL`);
      } else {
        const market = Array.isArray(data) ? data[0] : data;
        const conditionId = normalizeHex32(market?.conditionId);
        const questionId = normalizeHex32(market?.questionID);
        if (!conditionId) {
          missing++;
          if (i < 5) console.log(`  [${row.externalId}] Gamma response lacks conditionId`);
        } else {
          if (DRY_RUN) {
            if (i < 5) console.log(`  [${row.externalId}] would set conditionId=${conditionId.slice(0, 12)}…`);
          } else {
            await prisma.sportsFixtureCache.update({
              where: { id: row.id },
              data: {
                conditionId,
                // Also write questionId if absent — costs nothing extra.
                ...(row.questionId ? {} : { questionId }),
              },
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
