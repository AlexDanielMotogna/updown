# Pool-creation toggle (per interval) + RPC cost re-audit

> Status: **implemented** (pending `prisma generate` on a machine where the API dev
> server isn't locking the engine).

## Context
The API was burning ~33M Solana RPC compute units / $15 in 2 days. Re-audit found
the steady drivers are the scheduler's on-chain writes, and those scale with **how
many pools exist**. Short-interval pools (3m/5m/15m) are created constantly
(~2,600/day) and each one later resolves + closes — so they dominate RPC churn.
We're still in testing (few/no users), so we want to **stop creating short pools**
and flip them on with one click in admin when users arrive.

## RPC re-audit (verified)
- No WebSocket subscriptions (clean). Liquidity bot OFF. Trading-XP uses HyperLiquid.
- Already cut: transition tick 10s→30s; removed 2 getBalance-per-close; unpaid-payout
  retry 60s→5min.
- Biggest remaining steady driver: **pool closures** (`getTokenAccountBalance` per
  candidate + `sendAndConfirm`), which scales with pool count → reducing short-pool
  creation cuts creates + resolves + closes together.
- Note: `CLOSE_LOSING_BETS=on` adds a 60s sweep (up to ~43k RPC/day) — keep OFF
  unless draining a rent backlog.

## Implementation (done)
- **Schema** (`apps/api/prisma/schema.prisma`): `PoolCreationConfig` single-row —
  `allow3m/allow5m/allow15m/allow1h` booleans. **Default: short OFF, 1h ON.**
  Migration `…_add_pool_creation_config` applied locally; prod applies on deploy.
- **Service** (`apps/api/src/services/pool-creation/config.ts`): `getPoolCreationConfig()`
  + `isIntervalCreationAllowed(intervalKey)` (30s cache) + `invalidatePoolCreationCache()`.
- **Gate** (`apps/api/src/scheduler/pool-creator.ts` `createPool`): early
  `if (!isIntervalCreationAllowed(template.intervalKey)) return null;` — skips DB insert
  + the 3 on-chain RPC calls. Existing pools still resolve/close.
- **Admin API** (`apps/api/src/routes/admin/pool-creation.ts`, registered in
  `routes/admin/index.ts`): `GET /api/admin/pool-creation`, `PUT` (subset of the 4
  booleans) → invalidates cache. `x-admin-key` auth via the shared adminAuth.
- **Admin UI** (`apps/web/src/app/admin/components/PoolCreation.tsx`): per-interval
  ON/OFF pills + Save, mirrors LiquidityBot. Registered in the **Pools** group as
  "Creation" (`apps/web/src/app/admin/page.tsx`).

## Verification
- `prisma generate` (stop the API dev server first — it locks the engine on Windows),
  then `pnpm --filter api typecheck` clean.
- Admin → Pools → Creation: toggles load; turn 3m ON, Save → within ≤30s (cache) a
  3m JOINING pool appears; turn OFF → no new 3m pools created (existing ones still
  resolve/close).
- Confirm RPC/CU drops with short intervals OFF.
