# Sports Pool Lifecycle — Technical Flow

## Overview

```
TheSportsDB ──► Fixture Cache ──► Pool Creation ──► Live Scores ──► Resolution ──► Claims
                    (DB)           (DB + Chain)     (3-tier poll)    (Chain)        (Chain)
```

---

## PHASE 1: Fixture Sync

```
                    ┌──────────────────────────────┐
                    │     TheSportsDB API (V1/V2)  │
                    └──────────┬───────────────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
        dailySync()     matchWindowPoll()   preMatchRefresh()
        (04:00 UTC)     (every 5 min)       (every 30 min)
        14-day window   active matches      kickoff changes
              │                │                │
              └────────────────┼────────────────┘
                               ▼
                    ┌──────────────────────┐
                    │  SportsFixtureCache  │
                    │  ──────────────────  │
                    │  externalId (matchId)│
                    │  sport, league       │
                    │  homeTeam, awayTeam  │
                    │  kickoff, status     │
                    │  homeScore, awayScore│
                    └──────────────────────┘
```

---

## PHASE 2: Pool Creation

```
createMatchPools() — every 2 hours
         │
         ▼
  ┌─────────────────────────────┐
  │ For each league (NBA, NHL,  │
  │ PL, CL, etc.):             │
  │                             │
  │ getCachedUpcomingFixtures() │
  │ ▼                           │
  │ Filter:                     │
  │  - kickoff in next 30 days  │
  │  - no existing pool         │
  │  - not cancelled/postponed  │
  └─────────────┬───────────────┘
                │
                ▼
  ┌─────────────────────────────┐
  │   createSportsPool(match)   │
  │                             │
  │  1. Insert DB row FIRST     │
  │     status = JOINING        │
  │     startTime = kickoff     │
  │     lockTime = kickoff - 1m │
  │     endTime = kickoff + dur │
  │                             │
  │  2. On-chain:               │
  │     buildInitializePoolIx() │
  │     sendRawTransaction()    │
  │     (rollback DB if fails)  │
  │                             │
  │  3. Background:             │
  │     generateMatchAnalysis() │
  │     (H2H from TheSportsDB) │
  └─────────────┬───────────────┘
                │
                ▼
        ┌───────────────┐
        │  Pool (DB)    │       ┌───────────────┐
        │  status=JOIN  │──────►│  Pool (Chain) │
        │  matchId=ext  │       │  PDA created  │
        └───────────────┘       └───────────────┘
```

---

## PHASE 3: Pre-Match (Betting Open)

```
    User                    Frontend                   Backend
     │                        │                          │
     │  Visit /match/:id      │                          │
     │───────────────────────►│  GET /api/pools/:id      │
     │                        │─────────────────────────►│
     │                        │◄─────────────────────────│
     │  See teams, odds       │                          │
     │                        │                          │
     │  Place bet             │  POST /api/bets          │
     │───────────────────────►│─────────────────────────►│
     │                        │   1. Validate pool open  │
     │  Sign TX (wallet)      │   2. Check lockTime      │
     │◄──────────────────────►│   3. On-chain transfer   │
     │                        │   4. Record bet in DB    │
     │                        │◄─────────────────────────│
     │                        │                          │
     │                        │  WS: pool:updated        │
     │  See updated odds      │◄─────────────────────────│
     │◄──────────────────────│                          │
     │                        │                          │

    Timeline:
    ├──────────────────────── JOINING ──────────────────────────┤
    │                                                           │
  created                                              lockTime  kickoff
                                                      (kick-1m)  (startTime)
    │◄──── Bets accepted ────►│◄── No new bets ──►│
```

---

## PHASE 4: Live Score Tracking

```
    pollLiveScores() — every 30 seconds
         │
         ▼
┌────────────────────────────────────────────────────────────────────┐
│                                                                    │
│  TIER 0: TheSportsDB /livescore/all (PRIMARY)                     │
│  ─────────────────────────────────────                            │
│  • 1 call → ALL live events globally                              │
│  • At midnight UTC: also poll per-sport feeds                     │
│  • Cost: FREE                                                     │
│  • Updates: every 30s                                             │
│                                                                    │
│       Found in feed? ──► cacheSet() + persistToDb()               │
│            │                                                       │
│            │ NO (missing from feed)                                │
│            ▼                                                       │
│  TIER 1: TheSportsDB /lookup/event/{id} (INDIVIDUAL)              │
│  ────────────────────────────────────────                         │
│  • Per-event lookup (max 5 per cycle)                             │
│  • Catches: events TheSportsDB dropped from feed                  │
│  • Returns NS/TBD: cache but don't persist (game not started)     │
│  • Returns P1/Q2/etc: cache + persist (game IS live)              │
│  • Cost: FREE                                                     │
│                                                                    │
│       Still unresolved? ──► detectStaleEvents()                   │
│            │                                                       │
│            ▼                                                       │
│  ┌─────────────────────────────────────────┐                      │
│  │  Staleness Detection                    │                      │
│  │  ─────────────────                      │                      │
│  │  DISAPPEARED: was in feed, now gone     │                      │
│  │  NEVER_APPEARED: kickoff passed, absent │                      │
│  │  STUCK_NS: NS but 30+ min past kickoff │                      │
│  │  SCORE_FROZEN: score unchanged 5+ min   │                      │
│  └─────────────────┬───────────────────────┘                      │
│                    │                                               │
│            ▼                                                       │
│  TIER 2: The Odds API /v4/sports/{sport}/scores (FALLBACK)        │
│  ──────────────────────────────────────────────────                │
│  • Grouped by sport (1 call = ALL games for that sport)           │
│  • Match by team name (normalizeTeam)                             │
│  • Max 2 sports per cycle                                         │
│  • Cooldown: 2 min per sport                                      │
│  • Cost: 1 credit/call (500 free/month)                           │
│  • Circuit breaker: disabled at <50 credits                       │
│                                                                    │
│       Still unresolved?                                            │
│            │                                                       │
│            ▼                                                       │
│  TIER 3: ChatGPT (LAST RESORT)                                    │
│  ──────────────────────────────                                   │
│  • Per-event query to gpt-4o-mini                                 │
│  • Cooldown: 1 min per event                                      │
│  • Max 3 per cycle                                                │
│  • Returns confident: true/false                                  │
│  • Skips NS/TBD (unless STUCK_NS)                                 │
│  • Cost: ~$0.001 per call                                         │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│  Score resolved → 3 destinations:       │
│                                         │
│  1. In-memory cache (immediate access)  │
│  2. LiveScore DB table (survives crash) │
│  3. syncFinishedToUi():                 │
│     └─ Pool.homeScore/awayScore updated │
│     └─ FixtureCache status = FINISHED   │
└─────────────────────────────────────────┘
```

### Frontend Live Score Display

```
    Frontend                        Backend
       │                              │
       │  useLiveScores() hook        │
       │  polls every 30s             │
       │  GET /api/pools/livescores   │
       │─────────────────────────────►│
       │                              │ getAllLiveScoresWithFallback()
       │                              │ merge: cache + DB
       │◄─────────────────────────────│
       │                              │
       │  Map<eventId, LiveScore>     │
       │  match pool.matchId to get   │
       │  live score for each card    │
       │                              │
       │  MatchCard shows:            │
       │  ┌────────────────────┐      │
       │  │ MIA 38 - 36 PHI   │      │
       │  │ ● Q2 8:42         │      │
       │  │ ▓▓▓▓▓░░░░ 55% MIA │      │
       │  └────────────────────┘      │
```

---

## PHASE 5: Match Resolution

```
resolveMatchPools() — every 5 minutes
         │
         ▼
┌────────────────────────────────────────────┐
│  Query: pools WHERE                        │
│    poolType = 'SPORTS'                     │
│    status IN ('ACTIVE', 'JOINING')         │
│    startTime <= now                        │
│                                            │
│  Batch read results (0 API calls!):        │
│    getCachedFixtureResults(matchIds)        │
│    ┌──────────────────────────────────┐    │
│    │ Source 1: SportsFixtureCache     │    │
│    │ Source 2: LiveScore DB           │    │
│    │ Source 3: TheSportsDB lookup     │    │
│    └──────────────────────────────────┘    │
└─────────────────┬──────────────────────────┘
                  │
                  ▼
        Match FINISHED?
        ┌─────┴─────┐
        │ NO        │ YES
        │ wait      │
        ▼           ▼
      (skip)  ┌──────────────────────────────────┐
              │  Determine winner:                │
              │                                   │
              │  homeScore > awayScore → HOME     │
              │  awayScore > homeScore → AWAY     │
              │  homeScore = awayScore → DRAW     │
              │                                   │
              │  Map to pool side:                │
              │  HOME → UP, AWAY → DOWN           │
              └──────────────┬────────────────────┘
                             │
                             ▼
              ┌──────────────────────────────────┐
              │  resolvePoolOnChain()            │
              │                                  │
              │  Cases:                          │
              │  ┌────────────────────────────┐  │
              │  │ 0 bets → resolve + close   │  │
              │  │ 1 bet → auto-refund        │  │
              │  │ 1-sided → refund all       │  │
              │  │ normal → resolve w/ winner  │  │
              │  └────────────────────────────┘  │
              │                                  │
              │  On-chain TX:                    │
              │  buildResolveWithWinnerIx()      │
              │                                  │
              │  DB update:                      │
              │  pool.status = RESOLVED          │
              │  pool.winner = UP/DOWN/DRAW      │
              │  pool.finalPrice = result JSON   │
              └──────────────┬───────────────────┘
                             │
                             ▼
              ┌──────────────────────────────────┐
              │  Notifications:                  │
              │  • WS: pool:status broadcast     │
              │  • User rewards (XP/coins)       │
              │  • Referral commissions           │
              └──────────────────────────────────┘
```

---

## PHASE 6: Claims & Cleanup

```
         RESOLVED
            │
            │ (2 second delay)
            ▼
  processClaimableTransitions()
            │
            ▼
         CLAIMABLE ◄─── Users can now claim
            │
            │         ┌─────────────────────────────┐
            │         │  User claims winnings:       │
            │         │  POST /api/bets/:id/claim    │
            │         │  ▼                           │
            │         │  On-chain: transfer from     │
            │         │  pool vault → user wallet    │
            │         │  ▼                           │
            │         │  DB: bet.claimed = true      │
            │         └─────────────────────────────┘
            │
            │ (vault empty + 30s)
            ▼
  processPoolClosures()
            │
            ▼
  closePoolOnChain()
  ├─ Reclaim rent from PDA
  ├─ If 0 bets: delete from DB
  └─ If bets: keep for history


  State machine:
  ┌──────────┐    ┌──────────┐    ┌───────────┐    ┌────────┐
  │ JOINING  │───►│ RESOLVED │───►│ CLAIMABLE │───►│ CLOSED │
  └──────────┘    └──────────┘    └───────────┘    └────────┘
   bets open      winner set       users claim     rent back
```

---

## Complete Timeline Example

```
NBA: Miami Heat vs Philadelphia 76ers

T-14d     dailySync() → fixture in SportsFixtureCache
T-12d     createMatchPools() → Pool created (JOINING)
          On-chain PDA initialized

T-1min    lockTime → no more bets accepted

T=0       Kickoff! (startTime)
          LiveScore poller starts tracking

T+30s     TheSportsDB /livescore/all returns score
          Cache: MIA 2 - PHI 0

T+1h      ... polling every 30s, scores updating ...
          TheSportsDB drops event from feed (bug)

T+1h2m    detectStaleEvents → DISAPPEARED
          Tier 2: Odds API called → MIA 54 - PHI 48 (LIVE)
          Score resolved, cache updated

T+2h30m   Game ends: FT MIA 110 - PHI 102
          syncFinishedToUi():
            Pool.homeScore=110, awayScore=102
            FixtureCache.status=FINISHED, winner=HOME

T+2h35m   resolveMatchPools():
            getCachedFixtureResults() → HOME wins
            resolvePoolOnChain(winner=UP)
            Pool.status = RESOLVED

T+2h37m   processClaimableTransitions()
            Pool.status = CLAIMABLE
            WS: pool:status broadcast
            Users notified

T+3h      All claims processed
            processPoolClosures()
            closePoolOnChain() → rent reclaimed
```

---

## Key Files

| File | Role |
|---|---|
| `scheduler/fixture-sync.ts` | Sync fixtures from TheSportsDB |
| `scheduler/sports-scheduler.ts` | Create + resolve pools |
| `scheduler/resolve-logic.ts` | On-chain resolution logic |
| `services/sports/fixture-cache.ts` | Fixture data access layer |
| `services/sports/livescore/poller.ts` | Main 30s poll loop |
| `services/sports/livescore/sportsdb-source.ts` | TheSportsDB adapter |
| `services/sports/livescore/odds-api-source.ts` | Odds API fallback |
| `services/sports/livescore/chatgpt-source.ts` | ChatGPT last resort |
| `services/sports/livescore/staleness.ts` | Stale event detection |
| `services/sports/livescore/cache.ts` | In-memory score cache |
| `services/sports/livescore/db-persistence.ts` | DB persistence + UI sync |
| `websocket/index.ts` | Real-time WS broadcasts |
| `routes/pools.ts` | REST API endpoints |
