# Plan — migrate sports fixture creation to The Odds API

**Status:** ❌ **CANCELLED** 2026-06-01. Superseded by `PLAN-LIVESCORE-SOURCE-SPLIT.md` which keeps TheSportsDB primary for everything (livescore, FT detection, fixture creation) because SDB Premium is $10/mo vs The Odds API $60/mo. Document kept for historical context only — DO NOT implement.

---

(Original plan below, no longer relevant)

**Status:** drafted 2026-06-01, **not implemented**. Keep until we hit a case where TheSportsDB stops returning a fixture that exists in Odds API.

**Context:** in this session we flipped **livescore + resolution** to The Odds API as primary (commits `ee93073`, `f120702`, plus on-chain `resolve.rs` upgrade at slot `466272633`). What is **still on TheSportsDB**:

- `services/sports/fixture-cache.ts` → `getCachedUpcomingFixtures()` → `sportsDbFetchV2()` for upcoming matches.
- `services/sports/api-sports-adapter.ts` → `fetchUpcomingMatches()`, `fetchMatchById()` for football + sport-day lookups.
- Pool creation in `sports-scheduler.ts` (`createSportsPool`) consumes the above.

That asymmetry (create with SDB, resolve with Odds API) works today because livescore matches by **team name** (via `normalizeTeam`) rather than by `matchId`. But it leaves us blind to fixtures Odds API knows about but SDB doesn't.

---

## Goal

Single sports data source for fixture creation **and** resolution: **The Odds API primary**, TheSportsDB only as fallback for leagues / sports Odds API doesn't cover.

## Why not do it now

- TheSportsDB still works for the leagues we cover (BSA, PL, PD, SA, BL1, FL1, CL, EL, NBA, NHL, NFL, MMA). No active "missing fixture" reports.
- Migrating the fixture path touches the adapter layer (`api-sports-adapter.ts`, `polymarket-adapter.ts`), the cache (`fixture-cache.ts`), the scheduler's `createSportsPool` path, and the `MatchAdapter` interface. Bigger blast radius than the livescore swap, which only touched the poller + a single hook in the resolver.
- The Odds API `events` endpoint is **separate** from `scores` and costs **1 credit per sport, per call**. At our current 30s livescore poll cadence we'd double the credit burn unless we cache the fixture sync at a longer interval (e.g. once per hour, which is plenty for upcoming-match listings).

Defer until either: a real fixture-gap incident, or until we want to drop TheSportsDB entirely.

---

## Phases

### Phase 0 — Verification (no code)

Manually hit `GET /v4/sports/{sportKey}/events?apiKey=...` for the leagues we cover and compare against TheSportsDB's next-events output. Things to check:

1. Coverage: every league we currently create pools for is returned by Odds API.
2. ID stability: what does `OddsApiEvent.id` look like? Is it stable across calls? Can we use it as `matchId` in our schema?
3. Team naming: does it match the `scores` endpoint we already use? (it should — same upstream).
4. Time format: `commence_time` is ISO UTC, already compatible with our `startTime`.
5. Credit usage: how many credits per fixture sync per sport? At hourly cadence × 5 sports we're at ~3,600/month — well within budget.

### Phase 1 — Odds API fixture source

Add `services/sports/livescore/odds-api-fixtures.ts` (sibling of `odds-api-source.ts`) exposing:

```ts
export async function fetchOddsApiFixtures(sportKey: string): Promise<OddsApiEvent[]>;
export function matchFixturesToLeague(events: OddsApiEvent[], leagueCode: string): Match[];
```

Mirror the credit-floor + 401/403 handling we already wrote in `odds-api-source.ts`. Don't share state — let metrics for fixtures be separate (`oddsApiFixtureCalls`, `oddsApiFixtureCreditsRemaining`).

### Phase 2 — Wire as primary in `getCachedUpcomingFixtures`

In `services/sports/fixture-cache.ts`:

```ts
export async function getCachedUpcomingFixtures(
  sportFamily: string,        // 'FOOTBALL' | 'POLYMARKET' | 'NBA' | …
  leagueCodeOrSport: string,
): Promise<Match[]> {
  // 1) Try Odds API first
  const sportKey = LEAGUE_TO_ODDS_API[leagueCodeOrSport];
  if (sportKey) {
    const events = await fetchOddsApiFixtures(sportKey);
    if (events.length > 0) return matchFixturesToLeague(events, leagueCodeOrSport);
  }
  // 2) Fall back to current TheSportsDB path
  return existingSportsDbFlow(sportFamily, leagueCodeOrSport);
}
```

### Phase 3 — Map `OddsApiEvent.id` → our `matchId`

Decision point: do we keep TheSportsDB `eventId` in our DB, or switch to Odds API IDs?

Option A — **Odds API IDs**: clean break, single source. **Breaks** any existing matchId references in user-facing URLs. Requires a migration to remap fixtures that already exist.

Option B — **Keep SDB IDs**: when fixture comes from Odds API, look up the matching SDB event (by team name + commence_time) and use SDB's eventId. Falls back to Odds API ID when SDB has nothing. **No migration**, but keeps both systems' IDs in play (one of the very problems we're solving).

Recommendation: **A**, accept the one-time migration. Phase 0 verification needs to confirm `OddsApiEvent.id` is stable across calls so URLs don't break post-creation.

### Phase 4 — Cache cadence

Today `getCachedUpcomingFixtures` is cached via `SportsFixtureCache` table. Add a per-source TTL:

- Odds API source: refresh every **60 min**.
- TheSportsDB source: refresh every **15 min** (current cadence).

Reason: Odds API listings rarely change for matches > 2h out, and 60-min refresh × 5 sports = 120 credits/day = within budget.

### Phase 5 — Polymarket adapter

`polymarket-adapter.ts` is independent (PM markets are not in Odds API). No changes needed — keep its own fixture path.

### Phase 6 — Cleanup

Once Phase 1-4 are running clean for a week with no fallback hits, mark `api-sports-adapter.ts` and `sportsDbFetchV2()` as deprecated (`@deprecated` JSDoc). Don't delete — keep as fallback for unusual leagues + Polymarket adapter still references some pieces.

---

## Files to touch

- **New**: `apps/api/src/services/sports/livescore/odds-api-fixtures.ts`
- **Modified**:
  - `apps/api/src/services/sports/fixture-cache.ts` (`getCachedUpcomingFixtures` flips)
  - `apps/api/src/services/sports/api-sports-adapter.ts` (mark fallback path, add JSDoc)
  - `apps/api/src/services/sports/livescore/types.ts` (extend `LEAGUE_TO_ODDS_API` if needed)
  - `apps/api/src/scheduler/sports-scheduler.ts` (no logic changes — just consumes the new fixture source transparently)
  - `apps/api/src/routes/admin/health.ts` (surface fixture API metrics)
  - DB migration (only if Option A in Phase 3): remap existing `matchId` values

## Risks

1. **ID stability** — if `OddsApiEvent.id` is not deterministic across calls, Option A in Phase 3 is unsafe. Phase 0 must validate.
2. **Team name drift across endpoints** — Odds API `events` and `scores` should return identical team names. If they ever drift, the fixture↔livescore match would fail. Mitigate with `normalizeTeam` (already does most of the work) + a periodic sanity check that surfaces mismatches.
3. **Credit budget** — fixture refresh adds ~120 credits/day. Within the 100K/month plan, but worth metrics.
4. **Polymarket cross-pollination** — PM adapter uses some SDB primitives. Keep it isolated; do not delete shared code until PM path is independently audited.
5. **Cup competition coverage** — Odds API may not list domestic cup fixtures (Copa do Brasil, FA Cup, Coppa Italia, etc.). Keep TheSportsDB fallback running for those.

## Rollout

1. Phase 0 verification (manual, no code).
2. Phase 1+2 behind a feature flag `FIXTURE_SOURCE_ODDS_API=true`. Default off. Verify on dev.
3. Soak on dev for 24h. Compare fixtures created vs. baseline.
4. Flip flag on prod. Monitor `[Fixture] OddsAPI:X SDB:Y` per-cycle log for a week.
5. Phase 6 cleanup once steady-state.

## Out of scope

- Migrating the **fight cards** path (MMA / UFC) — Odds API has it (`mma_mixed_martial_arts`) but our use case is light and the existing SDB path is enough.
- Migrating **historical** matches (past results outside the 2-day window). The Odds API `scores?daysFrom=N` caps at N=3 days. For older results we'd still need TheSportsDB.

## Open questions to revisit before implementation

1. Should we shrink the football-cup coverage too (CL/EL) and only use Odds API where they have group + knockout rounds? Or keep CL/EL on TheSportsDB for the AET-status indicator we still need for regulation-time resolution (see `docs/PLAN-TIME-WEIGHTED-PAYOUTS.md` and the gap noted in `regulation-time.ts`).
2. Do we add a `data_source` enum column on `Pool` so the UI/admin can see which feed created each pool?
3. Once `THE_ODDS_API` is the only fixture source, can we drop the `THESPORTSDB_KEY` env var entirely (or keep it for the Polymarket adapter)?
