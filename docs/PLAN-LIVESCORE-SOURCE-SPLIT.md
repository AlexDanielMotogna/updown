# Plan — TheSportsDB primary, The Odds API fallback (livescore + resolution)

**Status:** ✅ **Phases A, B, C, D shipped** 2026-06-01. Phase E (housekeeping) is this commit. Reversed the architecture introduced by commits `ee93073` ("Odds API primary livescore") and `f120702` ("instant resolve trigger") earlier the same day.

Phase-by-phase ship log:

| Phase | Commit  | What |
|-------|---------|------|
| A     | `a39ed8e` | Flipped poller merge: SDB rows win for events both sources have. Restored `strProgress` on every live pool. |
| B     | `9760614` | Grace-window FT fallback (5 min past expected end) + `KNOCKOUT_DISABLE_ODDS_FALLBACK={CL,EL}` + UI `awaitingFinalResult` flag, `DeterminingCard`, "Awaiting result" pill. |
| C     | `9d3bc57` | `displaySource` + `ftSource` per-bucket counters in `metrics.ts`, `ftStuckKnockoutCount` gauge, `SourceSplitPanel` in admin SystemHealth tab. |
| D     | (this commit) | `'LIVE' → 'In Play'` STATUS_LABELS entry as a belt-and-suspenders for events only Odds API has (leagues outside SDB coverage). Avoids the `LIVE · LIVE` stutter. |
| E     | (this commit) | This status block + memory updates + stale comment cleanup. |

**What's still open**: Decision 3 of this plan ("downgrade the $60/mo Odds API plan after 2-week soak"). The Phase C `SourceSplitPanel` is the dashboard for that decision; revisit around 2026-06-15.

## TL;DR

- TheSportsDB Premium = **$10/mo**. The Odds API = **$60/mo**.
- TheSportsDB exposes everything we need for display (`strProgress` minute, period codes 1H/HT/2H, AET/PEN markers). The Odds API exposes nothing the cheaper feed doesn't already have for non-knockout football.
- Current code makes The Odds API authoritative, which discards SDB's minute data and over-pays for the worse feed.
- New direction: **TheSportsDB drives everything**; The Odds API is a thin fallback for two narrow cases — (1) leagues SDB doesn't cover and (2) SDB lag on FT detection (grace-window-based).

## Investigation summary (2026-06-01)

Verified against both APIs with a real finished match (Cruzeiro 1-1 Fluminense, BSA, 2026-05-31).

### TheSportsDB

| Endpoint | Returns | Notes |
|---|---|---|
| `/lookup/event/{id}` | 47 fields incl. `strStatus`, `intHomeScore`, `intAwayScore` | **Does NOT include `strProgress`** — game minute lives in `/livescore`, not `/lookup` |
| `/livescore/all` | All live events across sports | Already called every poll cycle |
| `/livescore/{sport}` | Live events per sport (e.g. Soccer) | Already called at midnight UTC boundary; **includes `strProgress`** ("74", "90+3") |
| `/lookup/event_results/{id}` | `{ Message: ... }` | **Premium-blocked** with our current key |
| `/lookup/event_stats/{id}` | `{ Message: ... }` | **Premium-blocked** |
| `/lookup/event_timeline/{id}` | `{ Message: ... }` | **Premium-blocked** |

`strStatus` values observed: `1H`, `HT`, `2H`, `FT`, `AET`, `PEN`, `Q1-Q4`, `P1-P3`, etc. `strProgress` observed: `"74"`, `"90+3"`, `"5"`, etc.

### The Odds API

`/scores?daysFrom={N}` returns only:

```json
{
  "id", "sport_key", "sport_title", "commence_time",
  "completed": true|false,
  "home_team", "away_team",
  "scores": [{name, score}, ...],
  "last_update"
}
```

- ❌ No clock, no period, no half/quarter
- ❌ No AET/PEN flag — a CL knockout 1-1 reg → 2-1 ET resolves to `completed: true` with the ET score, with no way to tell our `regulationWinner()` it should collapse to DRAW
- ✅ Cheap-per-call but expensive-per-month at our usage tier

### The current bug (visible to user)

`poller.ts` step 3 in the merge loop:

```ts
for (const entry of freshEntries /* TheSportsDB */) {
  freshIds.add(entry.eventId);
  if (oddsApiIds.has(entry.eventId)) continue;   // ← discards SDB row with strProgress
  cacheSet(entry);
  toPersist.push(entry);
}
```

When Odds API encounters the event first, SDB's row is dropped — including its `strProgress`. The frontend then renders `LIVE · ${formatLiveStatus('LIVE', '')}` → "LIVE · LIVE".

## Goal

```
┌──────────────────────────────────────────────────────────────────┐
│  TheSportsDB         primary for everything                      │
│  /livescore/{sport}  → display: status, progress, score           │
│  /lookup/event/{id}  → resolution: strStatus (FT/AET/PEN/…)       │
│                                                                  │
│  The Odds API        FALLBACK only, fires when:                  │
│  /scores             1. SDB has no row for an active pool        │
│                          AND grace window past expected FT,       │
│                       2. league is NOT in SDB's coverage          │
└──────────────────────────────────────────────────────────────────┘
```

Pricing: keeps SDB ($10/mo) doing all the work. Odds API ($60/mo) becomes a thin safety net we could downgrade or even cancel after a soak period.

## Why this isn't just reverting `ee93073`

The original problem solved by `ee93073` was real: SDB's `/livescore/all` sometimes lags 1-3 min behind real full time on football leagues, so pools stuck in "LIVE · 2nd Half 90+6'" past their actual end time. That lag is still real. But:

- The lag is the exception, not the rule.
- The fix made the exception the new rule (Odds API for everything), which broke `strProgress` display on every live pool.
- A grace-window fallback gives us the exception handler we need without the regression.

## Phases (priority order, each ships independently)

### Phase A — Stop discarding SDB minute data ⚡ (the immediate visible fix)

**Goal**: SDB always wins for display; Odds API only fills gaps for events SDB doesn't return.

**Files**: `apps/api/src/services/sports/livescore/poller.ts`

**Changes**:
- Rename `pollOddsApiPrimary` → `pollOddsApiFallback`.
- Move the Odds API call to AFTER `fetchLivescoreAll()` instead of before.
- Invert the merge: for each Odds API result, skip if SDB already covered the event (`sdbIds.has(entry.eventId)`).
- Track `sdbIds` (events SDB returned this cycle) instead of `oddsApiIds`.

**Risk**: very low. Single-file, single-conditional flip. The frontend immediately starts seeing `strProgress`.

**Test**: Manual — load an active soccer match page during 1st/2nd half, verify "LIVE · 1st Half 23'" appears within 60s of kickoff.

### Phase B — Odds API as FT fallback with grace window + UI waiting state

**Goal**: SDB drives resolution. Odds API triggers `syncFinishedToUi` only for non-knockout pools where SDB hasn't reported FT after a 5-min grace window past expected end. While the grace window is elapsing — or indefinitely for knockouts — the UI shows an "Awaiting final result" state instead of pretending the match is still live.

**Files**:
- `apps/api/src/services/sports/livescore/poller.ts` (gate the Odds API FT trigger by grace + knockout-skip)
- `apps/api/src/services/sports/livescore/types.ts` (`ODDS_API_FT_FALLBACK_GRACE_MS = 5 * 60_000`, `KNOCKOUT_DISABLE_ODDS_FALLBACK = new Set(['CL','EL'])`)
- `apps/web/src/hooks/useLiveScores.ts` (new derived flag `awaitingFinalResult`)
- `apps/web/src/app/match/[id]/page.tsx` (extend `awaitingResolution` to include `awaitingFinalResult` — already drives `DeterminingCard`)
- `apps/web/src/components/MarketCard.tsx` (right-meta shows "Awaiting result" badge when `awaitingFinalResult` is true)

**Backend changes**:
- After both sources run, walk active pools. For each pool with `startTime + matchDurationMinutes + GRACE` already passed:
  - If SDB reported `strStatus in FINISHED_STATUSES` → resolve via SDB (already handled, regulation-safe).
  - If only Odds API reported `completed: true`:
    - If `pool.league in KNOCKOUT_DISABLE_ODDS_FALLBACK` → skip (wait for SDB indefinitely).
    - Else if grace window expired → trigger resolve via Odds API, log `ftSource='odds-api-fallback'` for observability.
  - Otherwise keep waiting (no premature Odds API resolve).

**Frontend changes (the user-visible part)**:
- `useLiveScore` (per-pool hook) returns a new derived boolean `awaitingFinalResult`:
  ```
  awaitingFinalResult = startTime + matchDurationMs < now
                     && !isFinishedStatus(liveScore?.status ?? '')
                     && pool.status !== 'RESOLVED'
                     && pool.status !== 'CLAIMABLE'
  ```
- `match/[id]/page.tsx` already has an `awaitingResolution` branch wired into `DeterminingCard`. Extend its trigger from `matchFinished` to `(matchFinished || awaitingFinalResult)`. No new component needed.
- `MarketCard.tsx` right-meta slot: when `awaitingFinalResult`, show a small "Awaiting result" pill in place of the live timer (replaces the "LIVE · LIVE" stutter for the brief grace-window stretch).

**Risk**: medium-low. The frontend `awaitingFinalResult` derivation is pure UI — no on-chain or DB write. The backend Odds API fallback is gated by both the grace window and the knockout-skip set, so the worst case (Odds API mis-resolves AET) cannot fire on CL/EL.

**Test**:
- Soccer match (BSA, regular season): play around with `ODDS_API_FT_FALLBACK_GRACE_MS=10_000` (10s) on dev to force the fallback path; verify `ftSource='odds-api-fallback'` logged and resolve fires.
- CL knockout: simulate by temporarily adding the league to `KNOCKOUT_DISABLE_ODDS_FALLBACK`; verify pool stays in `awaitingFinalResult` state past kickoff+90min until SDB reports.

### Phase C — Coverage map + observability

**Goal**: visible per-event "who's reporting this" so we can monitor health and downgrade the Odds API plan with confidence.

**Files**:
- `apps/api/src/services/sports/livescore/metrics.ts` (new counters: `displaySource` map, `ftSource` map)
- `apps/api/src/routes/admin/health.ts` (expose `% pools display-sourced from SDB`, `% FT detected by SDB first`, `% FT trigger from Odds API fallback`)
- `apps/web/src/app/admin/components/SystemHealth.tsx` (render the new metrics)

**Risk**: very low (read-only metrics).

### Phase D — Frontend safety label

**Goal**: when only Odds API has data (rare — league not in SDB), don't render "LIVE · LIVE".

**Files**: `apps/web/src/hooks/useLiveScores.ts`

**Changes**:
- Add `'LIVE': 'In Play'` to `STATUS_LABELS`.
- Add `'LIVE'` to `NO_PROGRESS_STATUSES` (we never write a progress value for the generic LIVE).

**Risk**: very low. Pure display.

### Phase E — Cleanup

**Goal**: keep the codebase honest about the architecture.

**Files**:
- `apps/api/src/services/sports/livescore/poller.ts` — update inline comments referring to "Odds API primary" (they currently lie).
- `MEMORY.md` + `memory/project_livescore_rewrite.md` — update notes.
- `docs/PLAN-FIXTURE-SYNC-ODDS-API.md` — already deferred plan; cross-link the cost rationale.

**Risk**: zero (docs/comments only).

## Files affected (full list)

| File | Phase | Change |
|---|---|---|
| `apps/api/src/services/sports/livescore/poller.ts` | A, B, E | Flip merge priority; add grace-window FT fallback w/ knockout skip; update comments |
| `apps/api/src/services/sports/livescore/types.ts` | B | Add `ODDS_API_FT_FALLBACK_GRACE_MS`, `KNOCKOUT_DISABLE_ODDS_FALLBACK` |
| `apps/api/src/services/sports/livescore/odds-api-source.ts` | A | No code change; comments only |
| `apps/api/src/services/sports/livescore/metrics.ts` | B, C | New counters `displaySource`, `ftSource`, `ftStuckKnockoutCount` |
| `apps/api/src/routes/admin/health.ts` | C | Expose new ratios |
| `apps/web/src/app/admin/components/SystemHealth.tsx` | C | Render ratios + stuck-knockout count |
| `apps/web/src/hooks/useLiveScores.ts` | B, D | New `awaitingFinalResult` flag; `'LIVE' → 'In Play'` label; `'LIVE'` to NO_PROGRESS |
| `apps/web/src/app/match/[id]/page.tsx` | B | Extend `awaitingResolution` trigger to include `awaitingFinalResult` |
| `apps/web/src/components/MarketCard.tsx` | B | Right-meta shows "Awaiting result" pill when `awaitingFinalResult` |
| `MEMORY.md`, `memory/project_livescore_*.md` | E | Update narrative |

**Files NOT affected** (verified):
- `apps/api/src/services/sports/livescore/sportsdb-source.ts` — already returns `strProgress` correctly; no change.
- `apps/api/src/services/sports/livescore/db-persistence.ts` — `syncFinishedToUi` already handles either source's FT correctly via `regulationWinner`.
- `apps/api/src/services/sports/fixture-cache.ts` — `getCachedFixtureResults` 3-tier read still works.
- `apps/api/src/scheduler/sports-scheduler.ts` — `resolveMatchPools` reads from caches; agnostic of source.
- `apps/api/src/services/sports/regulation-time.ts` — already collapses AET/PEN to DRAW correctly.

## Risks

1. **SDB lag re-introduces stuck pools.** If SDB's FT arrives 3+ min after real FT and we wait `GRACE=5min` before Odds API fallback, users wait ~8 min for resolution on the slowest cases. Mitigation: tune `GRACE` after a week of metrics. If lag p95 < 3 min on soccer, set `GRACE=4min`. Worst case beats current behaviour because today resolution is INSTANT but display is wrong all the time; new model has perfect display always + maybe-slow resolve a fraction of the time.
2. **SDB key revocation / rate limit.** Single-source-of-truth means SDB downtime = display goes blank. Today's setup also degrades when SDB is down (Odds API has no clock). Net new risk: zero. Mitigation: existing `isOddsApiDisabled()` check inverts cleanly to `isSDBDisabled()` for "drop all the way to Odds API" emergency mode.
3. **Coverage gap regression.** Some sport/league in `LEAGUE_TO_ODDS_API` might not be in SDB. Mitigation: Phase C metrics surface this in admin/health; we can re-add per-league overrides if needed.
4. **Knockout AET window.** A CL knockout going to ET that SDB never reports `strStatus=AET` for (SDB bug or feed gap) would either (a) stuck until manual admin resolve, or (b) Odds API fallback resolves to wrong winner after grace. See open question 2.

## Rollback

Each phase is independently revertable:
- Phase A: revert the single conditional in `poller.ts`. ~5 LOC.
- Phase B: revert the grace-window block. ~30 LOC.
- Phase C/D/E: purely additive; revert if confusing.

No DB migration required at any phase.

## Decisions (resolved 2026-06-01)

### 1. Grace window: **5 minutes**, surfaced in the UI

`ODDS_API_FT_FALLBACK_GRACE_MS = 5 * 60_000`.

Past kickoff + match-duration + 5 min, if SDB still hasn't reported FT but Odds API has → resolve via Odds API. This window is invisible to the resolver but **MUST be visible to the user** while it elapses.

**UI requirement (new Phase B.2)**: while a pool is in the grace window — i.e. past expected FT, SDB has not yet reported a finished status, but the match is no longer in-play (`strProgress >= 90` or the kickoff+matchDuration timestamp passed) — the match page and market card must show an "Awaiting final result" state instead of the live timer.

- Component reuse: the `DeterminingCard` already extracted in `apps/web/src/components/pool/ResolutionCards.tsx` (commit `ee93073`) is exactly this state. It's already wired into `/match/[id]` for the `awaitingResolution` branch. We extend that branch's trigger to fire as soon as we enter the grace window, not only after on-chain RESOLVED.
- New derived flag on `useLiveScore` result: `awaitingFinalResult: boolean` — true when the pool's startTime + matchDuration is in the past AND `liveScore.status` is not in `FINISHED_STATUSES`.
- Existing `awaitingResolution` logic in `match/[id]/page.tsx` (which currently checks `matchFinished && !isResolved`) gets the `awaitingFinalResult` flag OR'd in.

**Files added to Phase B**:
- `apps/web/src/hooks/useLiveScores.ts` — add the `awaitingFinalResult` derivation
- `apps/web/src/app/match/[id]/page.tsx` — extend the trigger for `DeterminingCard`
- `apps/web/src/components/MarketCard.tsx` — show "Awaiting result" badge in the right-meta slot when `awaitingFinalResult` is true
- `apps/web/src/components/pool/ResolutionCards.tsx` — no change (already handles the visual)

### 2. Knockout AET handling: **wait for SDB indefinitely** (no Odds API fallback)

For CL/EL knockouts, the Odds API FT fallback is **disabled**. If SDB doesn't report `strStatus=AET/PEN`, the pool stays in "Awaiting final result" until either SDB reports or an admin steps in.

Rationale: a wrong winner on a CL knockout costs user trust; a 30-minute delay on the rare SDB-misses-AET case doesn't. Regulation semantics are sacred — we never resolve a knockout via Odds API's `completed: true` because that signal includes ET goals and would pick the wrong winner.

**Implementation**:
- Hard-coded set `KNOCKOUT_DISABLE_ODDS_FALLBACK = new Set(['CL', 'EL'])` in `livescore/types.ts` (extensible — future cup competitions add here).
- In Phase B's grace-window block: `if (KNOCKOUT_DISABLE_ODDS_FALLBACK.has(pool.league)) continue;` — skip the Odds API fallback entirely.
- Pool stays in `awaitingFinalResult` UI state forever (or until admin uses the manual resolve action).
- Metrics: `ftStuckKnockoutCount` so we can surface in admin/health when this is happening.

### 3. Downgrade Odds API plan after 2 weeks of metrics

After Phase A+B+C ship and run for 2 weeks:
- If Phase C's `ftSource` metric shows **< 5% of FT detections via Odds API fallback** → downgrade or cancel the $60/mo Odds API plan.
- Open follow-up task: re-evaluate fixture creation. With Odds API potentially gone, `PLAN-FIXTURE-SYNC-ODDS-API.md` is moot — keep SDB primary for fixtures.

### 4. Fixture creation source: SDB stays primary

`PLAN-FIXTURE-SYNC-ODDS-API.md` is **cancelled** in light of this decision. SDB drives fixture creation, livescore display, and resolution. The Odds API role shrinks to a thin FT-detection fallback for non-knockout leagues, and may be retired entirely after the 2-week metrics window.

## Out of scope

- Migrating fixture creation to Odds API (the prior plan in `docs/PLAN-FIXTURE-SYNC-ODDS-API.md` — should be cancelled, not implemented).
- ChatGPT fallback layer — unchanged.
- The `pollMissingPools` individual SDB lookup — unchanged, already a safety net.
- On-chain program changes — none required.

## Trigger to revisit / cancel this plan

- SDB starts charging more than Odds API (currently inverse → strong financial driver).
- SDB drops `strProgress` from `/livescore/{sport}` (the entire premise collapses → re-evaluate which feed has clock data).
- A new sport/league we want to cover is in Odds API but not SDB (Phase C metrics would surface it).
