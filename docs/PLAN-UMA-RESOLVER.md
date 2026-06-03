# Plan — UMA-direct resolution for Polymarket pools

**Branch**: `feature/uma-resolver`
**Goal**: stop cancelling 0-bet PM pools just because Polymarket pulled the
listing from Gamma. Read resolution from UMA's Optimistic Oracle on
Polygon as the primary source, fall back to Gamma when UMA hasn't
ruled yet.

## Background

Polymarket markets settle in three layers:

```
Polymarket Gamma (HTTP)   ← editorial catalog
       ↓
UmaCtfAdapter (Polygon)   ← Polymarket's adapter — registers each market
       ↓                    with UMA, exposes getQuestion(questionID)
OptimisticOracleV2 (UMA)  ← the actual oracle
       ↓
ConditionalTokens (CTF)   ← YES/NO token redemption
```

Today `polymarket-sync.ts:resolutionPoll()` only reads Gamma. When
Polymarket retires a market (hourly cycle rotation, editorial pull,
duplicate cleanup) Gamma returns `[]` and we mark the cache `CANCELLED`.
`pm-cancel.ts:sweepStuckPmPools()` then cancels the matching pool with
`gamma-delisted-immediate`. The UMA question for that market is **still
live on-chain** — the cancellation is purely an editorial side-effect.

Recent example (2026-06-03):

| Pool       | League     | Reason                                    |
|------------|------------|-------------------------------------------|
| `f811f82b` | PM_CULTURE | gamma-delisted-immediate (matchId=2414437) |
| `ee679fc0` | PM_FINANCE | gamma-delisted-immediate (matchId=2409705) |
| `cce0d013` | PM_FINANCE | gamma-delisted-immediate (matchId=2409710) |
| `a18bd387` | PM_FINANCE | gamma-delisted-immediate (matchId=2409695) |
| `bff4b3bd` | PM_FINANCE | gamma-delisted-immediate (matchId=2409616) |

All 0 bets, so no refund pain. But the same path will eventually catch a
pool with money in it — and that's a worse failure mode than letting UMA
take an extra few days.

## Architecture — hybrid (Gamma + UMA)

Keep Gamma for **discovery** (catalog, lockTime, ancillary metadata —
icons, tags, subcategory). Move resolution to UMA-first.

```
                       ┌─── readUmaQuestion(questionId) ────┐
                       │                                    │
resolutionPoll() ──────┤  resolved?    → mark FINISHED      │
                       │  paused?      → leave for admin    │
                       │  pending?     → check Gamma        │
                       │  unknown?     → check Gamma        │
                       │                                    │
                       └───── pollPolymarketMarket() ───────┘  ← today's path
```

Decision matrix:

| UMA              | Gamma            | Action                                  |
|------------------|------------------|-----------------------------------------|
| resolved         | (any)            | FINISHED with UMA outcome               |
| pending          | resolved         | FINISHED (Gamma usually leads by ~1min) |
| pending          | pending          | retry next cycle                        |
| pending          | delisted         | retry next cycle — **do not cancel**    |
| paused           | (any)            | flag for admin review (CANCELLED only after grace) |
| unknown          | delisted >120h   | cancel (no oracle, no listing — dead)   |
| unknown          | resolved         | FINISHED with Gamma outcome (admin-resolved special) |

## Steps

### 1. Schema + ingestion (DONE in this commit)

- [x] `SportsFixtureCache.questionId` column (`migration.sql`)
- [ ] Backfill column from Gamma response (`market.questionID`) in
  `polymarket-sync.ts:syncByLeague()`
- [ ] One-off backfill for existing rows: `scripts/backfill-pm-question-id.ts`

### 2. UMA reader (PARTIALLY DONE)

- [x] `services/polymarket/uma-resolver.ts` skeleton + ABI
- [ ] Add `viem` dependency (`pnpm add viem` in `apps/api`)
- [ ] Polygon RPC client with `POLYGON_RPC_URL` env (free tier:
  `https://polygon-rpc.com` works for low traffic; Alchemy free tier for
  prod)
- [ ] Implement `readUmaQuestion()`:
  - Call `adapter.getQuestion(questionId)`
  - If `resolved && !paused`: query `QuestionResolved` event for the
    settled outcome (last 50k blocks should always cover, since UMA
    resolutions happen within ~24h of `requestTimestamp`)
  - Cache reads for 60s (avoid hammering RPC on the 10-min poll)

### 3. Integrate into resolutionPoll

- [ ] Read flag `POLYMARKET_USE_UMA=true` (default false during rollout)
- [ ] In `pollPolymarketMarket()`, when the row has `questionId`,
  call UMA first; fall back to Gamma on `pending`/`unknown`
- [ ] Update `pm-cancel.ts:sweepStuckPmPools()` to skip pools where UMA
  still answers `pending` or `paused`, even if Gamma says delisted

### 4. Observability

- [ ] EventLog entries differentiate source: `POOL_PM_RESOLVED` payload
  gets `oracle: 'uma' | 'gamma' | 'hybrid'`
- [ ] Counter logs in `resolutionPoll`: `uma-resolved=X gamma-resolved=Y
  uma-pending-gamma-delisted=Z paused=W`
- [ ] `/api/admin/pm/uma-health` endpoint surfacing recent UMA reads

### 5. Cutover

- [ ] Run with `POLYMARKET_USE_UMA=true` on dev for 7d, compare against
  Gamma-only
- [ ] If no discrepancies (or only false-positive cancellations avoided),
  flip prod
- [ ] Delete `gamma-delisted-immediate` Phase 1 path from
  `sweepStuckPmPools()` once UMA is trusted

## 2026-06-03 — Path B chosen: query CTF directly

Pivot from the UmaCtfAdapter approach (Path A) to querying Polymarket's
Conditional Tokens Framework (`0x4D97DCd97eC945f40cF65F87097ACe5EA0476045`
on Polygon). CTF is the canonical settlement layer for every PM market
regardless of which UMA adapter wrapped the request, so a single
contract + single ABI gives 100% coverage.

Validated against three actually-closed markets pulled from
`/markets?closed=true&limit=5`:

| Market                              | Gamma           | CTF             |
|-------------------------------------|-----------------|-----------------|
| Katana FDV > $1B one day after launch | NO won (0,1)   | NO won (0,1) ✓  |
| Espresso FDV > $200M                | YES won (1,0)   | YES won (1,0) ✓ |
| Espresso FDV > $100M                | YES won (1,0)   | YES won (1,0) ✓ |

100% agreement. CTF returns `payoutDenominator=0` for unresolved
markets, so the resolver can cleanly distinguish pending from resolved
without ambiguity.

Implementation lives in `services/polymarket/ctf-resolver.ts`:
`readCtfResolution(conditionId)` returns one of
`resolved | refund | pending | unknown | rpc-error`.
The UMA-direct `uma-resolver.ts` was deleted along with its
question-id backfill, since the CTF path supersedes it.

## 2026-06-03 — (superseded) Smoke-test finding for Path A

After the resolver was wired end-to-end (commits up to `1f50ffd`) we
probed 10 cached questionIds against the static UmaCtfAdapter address
(`0x6A9D…F74`) with a corrected 10-field ABI. **Every question returned
the zero struct** — `requestTimestamp` decodes as the literal value
`32` (the ABI offset pointer for the empty `ancillaryData` bytes tail
in a zeroed struct), `creator=0x00…00`, `resolved=false`. The
questions are NOT registered with that contract.

Gamma's per-market `resolvedBy` field points at a different address
(`0x65070BE91477460D8A7AeEb94ef92fe056C2f2A7` for US x Iran). Probing
that contract with the same ABI also returns the zero struct, which
either means it has a different struct layout OR it's a different
contract type entirely (Polymarket settlement, not the UMA adapter).

So: the resolver is mechanically correct (viem + RPC + decode all
work — see `scripts/test-uma-resolver.ts` output), but the static
`UMA_CTF_ADAPTER_POLYGON` address is the wrong target for the
real-world distribution of markets we ingest today. The flag stays
**off** — turning it on right now would resolve nothing via UMA and
fall through to Gamma for every market (safe but pointless).

Two paths forward, pick after a short spike:

  A. **Per-market resolver dispatch** — add `resolvedBy` to the cache,
     stash it on ingest, pass to `readUmaQuestion(questionId, adapter)`.
     Probe each known Polymarket adapter (`0x6A9D…F74`,
     `0x65070BE9…`, the NegRisk variant if found) with the right ABI.
     1-2 days of contract archaeology + code.

  B. **Query the UMA Optimistic Oracle V2 directly** using the
     ancillary data hash. Bypasses Polymarket's adapter layer entirely
     and reads from UMA's source-of-truth oracle. Cleaner long-term,
     but the request key is the ancillary-data hash (not the
     questionID), so we'd need to compute it from market metadata. 2-3
     days.

Until one of these lands, the existing Gamma path stays primary and
the UMA scaffolding is dead code behind the off flag — no regression
risk, no upside yet.

## Limits / honest caveats

1. **Coverage** ~85% of markets resolve via UMA-CTF. Sports markets
   with data feeds (NBA, NFL stat lines) and admin-emergency markets
   resolve outside UMA — those keep the Gamma-only path.
2. **Latency** — UMA has a proposal window (2h) + dispute window (2h)
   after `requestTimestamp`. We don't gain latency, we gain durability.
3. **Disputed markets** — go to UMA DVM (token-holder vote) and take
   2-7 days. Today we wait the same. The `paused` flag exposes them so
   the admin can see "this market is in dispute" instead of guessing.
4. **RPC cost** — every cache row with `questionId` becomes one read
   per poll cycle (10 min). ~100 active PM rows = 600 reads/hr on
   Polygon, well within free tier limits.

## Effort estimate

| Step | Effort |
|------|--------|
| Schema + ingestion + backfill | 2h |
| `viem` client + `readUmaQuestion` impl | 4h |
| Integration in resolutionPoll + sweep | 3h |
| EventLog payload + counters + admin endpoint | 2h |
| Dev observation + cutover | 2d wallclock (mostly waiting) |

Total: ~1.5 dev-days + 2 days observation before prod flip.
