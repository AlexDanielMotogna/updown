# Polymarket Domain Separation — Design Doc

Branch: `feature/polymarket-domain`. Goal: stop modelling Polymarket (PM) prediction
markets as "sports matches". Give PM its own clean domain so we stop patching the
same class of bugs (mis-typed pools, inverted time windows, split resolution,
delisting mishandling). **Nothing ships to `main`/prod until the whole thing is
verified and merged.**

## 1. Problem (the one root cause)
PM markets piggyback the sports pipeline:
- Stored as `poolType: 'SPORTS'`, identified by `league` starting `PM_`.
- Live in `sportsFixtureCache` (`sport='POLYMARKET'`).
- Created by `createSportsPool`, resolved by sports `resolveMatchPools`.
- Reuse sports **time semantics**: `startTime = kickoff`. For PM `kickoff = market.endDate`,
  so `lockTime (endDate−1h) < startTime (endDate)` → the betting window is inverted/nonsensical.

This conflation is the source of every recurring PM symptom.

## 2. Goals / Non-goals
**Goals**
- A first-class `poolType: 'POLYMARKET'` discriminator + single predicate (`isPmPool`).
- A correct PM **time model** (bet now → lock near deadline → resolve after deadline via CTF).
- PM **resolution self-contained** (detection + on-chain settle in one module, CTF-first — already CTF-first after Phase 1).
- One source of truth for PM category metadata (labels/icons/colors) instead of 3 hardcoded copies.

**Non-goals (for this branch)**
- Rewriting the sports pipeline.
- Changing the Anchor program.
- Changing claim/payout logic.

## 3. Target architecture
```
services/polymarket/
  market-source.ts   // Gamma ingest (was bulkSync/syncCategory in polymarket-sync.ts)
  resolver.ts        // CTF-first detection + on-chain settle (was resolutionPoll + the PM half of resolveMatchPools)
  ctf-resolver.ts    // (exists) on-chain CTF read
  lifecycle.ts       // create PM pools + sweep/cancel (was createSportsPool PM branch + pm-cancel.ts)
  types.ts           // PmMarket, PmPoolState
scheduler/polymarket-sync.ts  // thin: wires the above on intervals
```
Sports keeps its own pipeline untouched. PM stops calling `createSportsPool` /
`resolveMatchPools`.

## 4. Key decisions
1. **Discriminator**: add `'POLYMARKET'` to `PoolType`. Predicate helpers:
   - BE: `isPmPool(p) => p.poolType === 'POLYMARKET'` (keep `league` PM_ as the category).
   - FE: `lib/poolKind.ts` → `kindOf(pool): 'crypto' | 'sports' | 'pm'`. Replace ad-hoc
     `poolType !== 'SPORTS'` / `league.startsWith('PM_')` checks with `kindOf`.
2. **Routing**: PM keeps using `/match/[id]` (it already renders PM there). So everywhere
   that routes `SPORTS → /match` must also route `POLYMARKET → /match`; `crypto` check
   becomes `kind === 'crypto'` (not `poolType !== 'SPORTS'`).
3. **Time model (PM)**: `startTime = createdAt (now)`, `lockTime = endDate − LOCK_BUFFER`
   (default 1h), `endTime = endDate`. Guard: skip creation if `lockTime <= now`.
4. **Resolution gating**: the PM resolver gates on the PM cache (`kickoff = endDate <= now`)
   and the pool's `endTime`, **not** `startTime`. This is why separation is required —
   it lets PM use the correct gate without breaking the sports `startTime` gate.
5. **Data model**: KEEP `sportsFixtureCache` for PM in this branch (it's already scoped by
   `sport='POLYMARKET'`). A dedicated `PolymarketMarket` table is a *follow-up* (low value,
   high churn) — out of scope here to limit risk.
6. **Category metadata**: one module `pmCategories` (labels/icons/colors) consumed by
   BetRow / PoolPositionRow / MatchBetModal / category-meta (today 3+ hardcoded copies).

## 5. Migration (existing data)
- Backfill: `UPDATE pools SET pool_type='POLYMARKET' WHERE league LIKE 'PM\_%'` (local/dev/prod).
- Existing PM pools keep their (old) time fields — only NEW pools get the new time model.
  Their resolution still works (resolver gates on cache/endTime).
- Reversible: a single UPDATE back to 'SPORTS' if needed.

## 6. Call-site impact (from audit)
### Backend — must change (today rely on PM == SPORTS)
- `pm-cancel.ts:280,327` and `polymarket-sync.ts:782` and `admin/actions.ts:386` —
  `poolType:'SPORTS' + league PM_` → `poolType:'POLYMARKET'`.
- `polymarket-explorer.ts:150,220,283` — PM lookups `poolType:'SPORTS'` → `'POLYMARKET'`.
- `sports-scheduler.ts:206` (create) → set `'POLYMARKET'` for PM; `:255` `resolveMatchPools`
  → exclude PM (PM resolves in its own module).
- `pools.ts:45,239`, `users.ts:266`, `notifications.ts:46,152,196`, `resolution-inspector.ts:106`
  → branch on the new type.
### Backend — safe (SPORTS_ONLY, no change): fixture-sync badge backfill, sports-explorer,
  pool-validation (zombie), livescore/poller.
### Frontend — ~20 files: add `'POLYMARKET'` to the `poolType` union (`lib/api.ts:46`),
  introduce `kindOf`, and replace `poolType !== 'SPORTS'` (crypto) + `league.startsWith('PM_')`
  with it. Routing files (page.tsx, pool/[id], MarketSearch, Notification*) add the PM branch.
  Card/odds/sidebars/profile rows switch to `kindOf`.

## 7. Implementation sequence (each = typecheck + review; nothing to prod)
1. **Predicate + types** — add `POLYMARKET` to BE/FE types, add `isPmPool`/`kindOf`. No behavior change yet (PM still created as SPORTS).
2. **Creation** — `createSportsPool` (or new `createPmPool`) sets `poolType:'POLYMARKET'` + new time model. Backfill existing pools.
3. **Resolver split** — move PM on-chain settle into `services/polymarket/resolver.ts`, gate on endTime/cache; remove PM from sports `resolveMatchPools`.
4. **Consumers** — update all backend queries (section 6) to the new type.
5. **Frontend** — `kindOf` rollout + routing + cards.
6. **Cleanup/cancel** — `pm-cancel.ts` + cleanup queries to new type.
7. **Metadata unify** — single `pmCategories` module.
8. **Verify end-to-end** (inspector, create→bet→resolve on a test market) → **merge to main**.

## 8. Risk & rollback
- All work on `feature/polymarket-domain`; prod runs old code until merge.
- Each step typechecks; logic-risk steps (4, 5) reviewed call-site by call-site.
- Data migration is a single reversible UPDATE.
- If a step regresses, revert the branch commit; main never affected.
