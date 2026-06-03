/**
 * Verify a list of (cancelled) pool IDs against the new CTF-direct resolver.
 *
 * For each pool ID prefix in `IDS` below (8-char prefix is enough — we match
 * via id::text LIKE 'XXXX%'), the script:
 *   1. Loads the pool row from whatever DATABASE_URL points at (read-only).
 *   2. For PM pools, pulls the cache row to get conditionId. If the
 *      column doesn't exist on the target DB (prod hasn't run the
 *      migration), or if the cache row pre-dated the column, falls back
 *      to fetching conditionId from Gamma /markets?id=<matchId>.
 *   3. Calls readCtfResolution(conditionId) against Polygon.
 *   4. Prints a verdict: would the new code have BLOCKED the cancellation,
 *      or would it have cancelled anyway?
 *
 * Verdict logic (assumes pool was cancelled with reason gamma-delisted /
 * gamma-delisted-immediate — see pm-cancel.ts):
 *   • CTF resolved → SAVED. New code would have FINISHED the cache row
 *     and the pool would have resolved normally. The cancellation was a
 *     false positive.
 *   • CTF pending → SAVED. New code would have held the pool open; the
 *     market is still resolvable on-chain.
 *   • CTF refund → SAVED (but flagged for admin). New code would have
 *     left the pool for force-refund, not auto-cancel.
 *   • CTF unknown → STILL CANCELLED. conditionId malformed or the
 *     condition was never registered on CTF (truly dead market).
 *   • CTF rpc-error → can't tell; new code would also retry next cycle.
 *
 * Usage:
 *   DATABASE_URL="postgresql://…" POLYGON_RPC_URL="…" \
 *     npx tsx scripts/verify-pool-ids.ts
 *
 * Override the list at the top of this file or pass IDs via argv:
 *   npx tsx scripts/verify-pool-ids.ts a6a8a318 1c7c5d8d 9b7dabd9
 */
import 'dotenv/config';
import { prisma } from '../src/db';
import { readCtfResolution } from '../src/services/polymarket/ctf-resolver';
import { polymarketFetch } from '../src/services/sports/polymarket-fetch';

// The 50-row sample the operator surfaced on 2026-06-03 from Railway prod.
// Override at runtime via argv: any IDs passed as arguments take precedence.
const DEFAULT_IDS: string[] = [
  'a6a8a318', '1c7c5d8d', '9b7dabd9', 'dd8a5916', 'bc0e6435',
  'dcc3f4ba', 'eac01057', '3c8efbd3', '72283172', 'c4053b47',
  '7f95f993', 'b23928c3', '33375306', '64783d30', '5bc07dc5',
  'fbefaf01', '239c797c', '4fe4b39a', 'e92fe300', '33d03284',
  '93984b5a', 'be049d26', '2f26587f', '502bf37d', '03d7c0ab',
  'e5cfa66a', '2d176e3a', '0e472122', '76356ab2', '38bfb406',
  '1ab7d598', 'd9306e8d', '39bb2996', '85df6206', 'bd25148c',
  '69e0d528', '8f30c9b4', 'd2114aaa', '06ed1341', '7ef75312',
  '21baf49b', '820c283f', '7a978880', '7c28b5ae', '052410df',
  '7156b4c1', 'f6c5831f', 'de63b181', 'e12acf3c', '4f461d32',
];

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

type PoolRow = {
  id: string;
  matchId: string | null;
  league: string | null;
  homeTeam: string | null;
  status: string;
  winner: string | null;
  poolType: string;
};

async function findPool(prefix: string): Promise<PoolRow | null> {
  // Use $queryRaw to do the prefix match — Prisma doesn't expose `LIKE`
  // on uuid columns directly, but id::text LIKE 'xxx%' works for any
  // uuid representation.
  const rows = await prisma.$queryRawUnsafe<PoolRow[]>(
    `SELECT id, match_id AS "matchId", league, home_team AS "homeTeam",
            status::text AS status, winner::text AS winner,
            pool_type AS "poolType"
       FROM pools
      WHERE id::text LIKE $1
      LIMIT 1`,
    `${prefix}%`,
  );
  return rows[0] ?? null;
}

async function findCacheConditionId(matchId: string): Promise<string | null> {
  // Try the cache row first — fastest, no Gamma round-trip. The cache
  // row may not have condition_id on a DB where the migration hasn't
  // been applied yet (prod as of 2026-06-03), in which case the catch
  // returns null and we fall through to Gamma.
  try {
    const rows = await prisma.$queryRawUnsafe<{ conditionId: string | null }[]>(
      `SELECT condition_id AS "conditionId"
         FROM sports_fixture_cache
        WHERE sport='POLYMARKET' AND external_id=$1
        LIMIT 1`,
      matchId,
    );
    return rows[0]?.conditionId ?? null;
  } catch {
    return null;
  }
}

async function fetchConditionIdFromGamma(matchId: string): Promise<{ kind: 'ok'; conditionId: string } | { kind: 'delisted' } | { kind: 'missing' }> {
  // Open markets respond to the bare id lookup. Closed/delisted markets
  // return [] there but DO come back when we add closed=true. We try the
  // open path first (single round-trip for the live cache) and fall
  // through to the archived path. This is the exact fix that uncovered
  // 47 supposedly-uncheckable cancellations on the first verify run —
  // they were all retrievable via the closed=true endpoint.
  for (const path of [`/markets?id=${matchId}`, `/markets?closed=true&id=${matchId}`]) {
    try {
      const data = await polymarketFetch(path);
      if (Array.isArray(data) && data.length === 0) continue;
      const market = Array.isArray(data) ? data[0] : data;
      if (!market) continue;
      const cid = normalizeHex32(market.conditionId);
      if (!cid) continue;
      return { kind: 'ok', conditionId: cid };
    } catch {
      // try next path
    }
  }
  return { kind: 'delisted' };
}

type Verdict = 'SAVED' | 'SAVED (refund)' | 'CORRECTLY CANCELLED' | 'UNKNOWN — Gamma also empty' | 'RPC-ERROR — retry' | 'NOT-PM — skip' | 'NOT-FOUND';
type Row = {
  prefix: string;
  league: string | null;
  matchId: string | null;
  ctfState: string;
  source: 'cache' | 'gamma' | 'n/a';
  title: string;
  verdict: Verdict;
};

function verdictFor(ctfKind: string): Verdict {
  if (ctfKind === 'resolved') return 'SAVED';
  if (ctfKind === 'pending') return 'SAVED';
  if (ctfKind === 'refund') return 'SAVED (refund)';
  if (ctfKind === 'unknown') return 'CORRECTLY CANCELLED';
  if (ctfKind === 'rpc-error') return 'RPC-ERROR — retry';
  return 'CORRECTLY CANCELLED';
}

async function main(): Promise<void> {
  if (!process.env.POLYGON_RPC_URL) {
    console.error('POLYGON_RPC_URL not set');
    process.exit(1);
  }
  const ids = process.argv.length > 2 ? process.argv.slice(2) : DEFAULT_IDS;
  console.log(`Verifying ${ids.length} pool IDs against CTF on Polygon\n`);
  console.log(`prefix    | league      | title                                          | matchId  | source | ctf       | verdict`);
  console.log(`----------+-------------+------------------------------------------------+----------+--------+-----------+-----------------------`);

  const rows: Row[] = [];
  let saved = 0, savedRefund = 0, correct = 0, unknown = 0, rpcErr = 0, notPm = 0, notFound = 0;

  for (const prefix of ids) {
    const pool = await findPool(prefix);
    if (!pool) {
      console.log(`${prefix.padEnd(9)} | (not found in pools table)`);
      rows.push({ prefix, league: null, matchId: null, ctfState: '-', source: 'n/a', title: '(not found)', verdict: 'NOT-FOUND' });
      notFound++;
      continue;
    }
    if (!pool.league?.startsWith('PM_')) {
      console.log(`${prefix.padEnd(9)} | ${(pool.league || '').padEnd(11)} | ${(pool.homeTeam || '').slice(0, 46).padEnd(46)} | ${(pool.matchId || '').padEnd(8)} | n/a    | n/a       | NOT-PM — skip`);
      rows.push({ prefix, league: pool.league, matchId: pool.matchId, ctfState: '-', source: 'n/a', title: pool.homeTeam || '', verdict: 'NOT-PM — skip' });
      notPm++;
      continue;
    }
    if (!pool.matchId) {
      console.log(`${prefix.padEnd(9)} | ${pool.league.padEnd(11)} | (no matchId)`);
      rows.push({ prefix, league: pool.league, matchId: null, ctfState: '-', source: 'n/a', title: pool.homeTeam || '', verdict: 'NOT-FOUND' });
      notFound++;
      continue;
    }

    // Try cache first, fallback to Gamma.
    let conditionId = await findCacheConditionId(pool.matchId);
    let source: 'cache' | 'gamma' = 'cache';
    if (!conditionId) {
      const gamma = await fetchConditionIdFromGamma(pool.matchId);
      source = 'gamma';
      if (gamma.kind === 'ok') conditionId = gamma.conditionId;
      else {
        // Delisted from Gamma + no cached conditionId = no way to consult CTF.
        const tag = gamma.kind === 'delisted' ? 'gamma-empty' : 'no-condid';
        console.log(`${prefix.padEnd(9)} | ${pool.league.padEnd(11)} | ${(pool.homeTeam || '').slice(0, 46).padEnd(46)} | ${pool.matchId.padEnd(8)} | ${source.padEnd(6)} | ${tag.padEnd(9)} | CORRECTLY CANCELLED`);
        rows.push({ prefix, league: pool.league, matchId: pool.matchId, ctfState: tag, source, title: pool.homeTeam || '', verdict: 'CORRECTLY CANCELLED' });
        if (gamma.kind === 'delisted') unknown++;
        else correct++;
        continue;
      }
    }

    const ctf = await readCtfResolution(conditionId);
    const verdict = verdictFor(ctf.kind);
    const ctfLabel = 'outcome' in ctf ? `res/${ctf.outcome === 1 ? 'YES' : 'NO'}` : ctf.kind;
    console.log(`${prefix.padEnd(9)} | ${pool.league.padEnd(11)} | ${(pool.homeTeam || '').slice(0, 46).padEnd(46)} | ${pool.matchId.padEnd(8)} | ${source.padEnd(6)} | ${ctfLabel.padEnd(9)} | ${verdict}`);
    rows.push({ prefix, league: pool.league, matchId: pool.matchId, ctfState: ctfLabel, source, title: pool.homeTeam || '', verdict });
    if (verdict === 'SAVED') saved++;
    else if (verdict === 'SAVED (refund)') savedRefund++;
    else if (verdict === 'CORRECTLY CANCELLED') correct++;
    else if (verdict === 'UNKNOWN — Gamma also empty') unknown++;
    else if (verdict === 'RPC-ERROR — retry') rpcErr++;
  }

  console.log('');
  console.log(`SUMMARY ─────────────────────────────────────────────────────────`);
  console.log(`  SAVED (would have been held / resolved):  ${saved}`);
  console.log(`  SAVED (would have been flagged refund):   ${savedRefund}`);
  console.log(`  CORRECTLY CANCELLED (CTF unknown/dead):   ${correct + unknown}`);
  console.log(`  RPC-ERROR (transient):                    ${rpcErr}`);
  console.log(`  NOT-PM (skipped):                         ${notPm}`);
  console.log(`  NOT-FOUND in pools:                       ${notFound}`);
  console.log(`  ──`);
  console.log(`  Total processed:                          ${rows.length}`);
  const pmTotal = saved + savedRefund + correct + unknown + rpcErr;
  if (pmTotal > 0) {
    const savePct = ((saved + savedRefund) / pmTotal * 100).toFixed(1);
    console.log(`  False-positive cancellation rate avoided: ${savePct}%  (${saved + savedRefund}/${pmTotal} PM rows)`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(err => {
    console.error('[Verify] Fatal:', err);
    prisma.$disconnect().finally(() => process.exit(1));
  });
