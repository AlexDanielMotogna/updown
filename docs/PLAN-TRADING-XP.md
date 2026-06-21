# Plan — Trading rewards (XP + UP coins, near-instant)

> Status: **schema + XP poller built; coins + near-instant crediting in progress.**

## Context
Traders on the terminal earn nothing toward their UpDown level. We want trading to
grant **XP and UP coins** into the **same** systems as prediction markets, so volume
on HyperLiquid moves a user up levels, mints UP coins, and shows on the existing
leaderboard. Crediting should feel **near-instant** (the terminal pings the API on a
fill; the API re-verifies via `userFills`), with a background poller as safety net.

### Decisions (from product)
- **Volume-based**, weighted by **maker/taker**. The HL fill's `fee` already encodes
  both (taker rate 0.045% = 3× maker 0.015%, and fee scales with volume), so XP is
  derived from **fee paid per fill** — automatically volume-based + taker-weighted.
- **Unified level**: add to the existing `User.totalXp` / `level` (no separate track).
- Credited from **actual fills** (`userFills`), not order placement — a fill is what
  pays the fee. Farm-proof via per-fill dedupe.

## XP formula
In `apps/api/src/utils/levels.ts` (next to `XP_ACTIONS`):
- `tradeXpForFill(feeUsd: number): bigint` → `BigInt(Math.round(Math.max(0, feeUsd) * TRADE_XP_PER_FEE_USD))`.
- `TRADE_XP_PER_FEE_USD` default ~**200** → a $1,000 taker trade (~$0.45 fee) ≈ 90 XP,
  a $1,000 maker trade (~$0.15 fee) ≈ 30 XP. Negative fees (rebates) clamp to 0. Tunable.

## UP coins for trading volume
Betting mints **0.10 UP per $1 staked** (`apps/api/src/utils/coins.ts`: 10 base units
= $1, display = stored/100, × level multiplier, daily cap 500 UP). Trading notional is
leveraged/large, so the per-$ rate is lower.
- **0.01 UP per $1 of notional volume** (`TRADE_COINS_BASE_PER_USD = 1` base unit/$1),
  × `getLevelMultiplier(level)`. Volume-based (flat per $, not fee-weighted — XP already
  carries the maker/taker weighting). Min notional $1.

  | Volume (notional) | UP coins (lvl 1) |
  |---|---|
  | $1,000 | 10 UP |
  | $10,000 | 100 UP |
  | $100,000 | 1,000 UP |

- **Anti-abuse:** trades pay real maker/taker + builder fees, so wash-farming costs
  money — **no daily cap in v1** (add `TRADE_COINS_DAILY_CAP` later if needed). Coins
  credit once per fill via the same `trade_fills.tid` dedupe as XP.
- New helper `calculateCoinsForTrade(notionalUsd, level): bigint` in `coins.ts`.

## Near-instant crediting (option 2)
- The terminal's `useAccountStream` already emits `{ kind:'fill' }` from the WS
  `userFills` feed. On a new fill id it calls `creditFills()` →
  `POST /api/exchange/credit-fills` (debounced ~3s, mainnet only).
- The API resolves the user's active mainnet connection and runs the **server-verified**
  credit (re-fetches `userFills`; never trusts client fill data) via the shared
  `creditConnectionFills(accountAddress)`. Returns `{ newFills, xpAwarded, coinsAwarded }`.
- No persistent server-side WS; runs only on real fills. The 120s poller stays as a
  safety net (same shared function).

## Schema (one migration — `apps/api/prisma/schema.prisma`)
- New **`TradeFill`** table (persist every awarded fill — dedupe + history + analytics +
  builder-revenue):
  ```
  model TradeFill {
    id            String   @id @default(uuid())
    walletAddress String   @map("wallet_address")   // UpDown identity
    accountAddress String  @map("account_address")  // HL/EVM account the fill belongs to
    exchange      String   @default("hyperliquid")
    tid           BigInt   @unique                   // HL fill id → idempotency
    coin          String
    side          String                              // BUY | SELL
    px            String
    sz            String
    notionalUsd   String   @map("notional_usd")
    feeUsd        String   @map("fee_usd")
    pnlUsd        String?  @map("pnl_usd")
    dir           String?                             // HL dir ("Open Long"…)
    xpAwarded     BigInt   @default(0) @map("xp_awarded")
    time          BigInt
    createdAt     DateTime @default(now()) @map("created_at")
    user User @relation(fields: [walletAddress], references: [walletAddress])
    @@index([walletAddress, time])
    @@index([accountAddress, time])
    @@map("trade_fills")
  }
  ```
  Add the back-relation `tradeFills TradeFill[]` on `User`.
- `RewardReason` enum: add `TRADE_VOLUME`.
- `ExchangeConnection`: add `lastFillTime BigInt? @map("last_fill_time")` — cursor to
  bound the `userFills` window per account.
- Apply locally with `migrate dev`; prod applies on deploy (api `start` runs
  `migrate deploy`).
- Dedupe now lives on `TradeFill.tid` (unique); RewardLog just records the XP award
  (reason `TRADE_VOLUME`, metadata `{tids, totalNotional, totalFee}`) — no dedupeKey needed.

## Award function — `apps/api/src/services/rewards.ts`
Mirror the existing `awardBetResolution` pattern (increment `totalXp`, recompute
`level` via `getLevelForXp`, write `RewardLog`, `emitUserReward`):

`awardTradeFills(walletAddress, accountAddress, fills: {tid, coin, side, px, sz, feeUsd, notionalUsd, pnlUsd, dir, time}[])`
1. Dedupe: query `TradeFill` for existing `tid IN [...]`; drop already-stored fills.
2. Per fresh fill: `xp = tradeXpForFill(feeUsd)` and `coins = calculateCoinsForTrade(notionalUsd, level)`; sum both.
3. One `prisma.$transaction`: `createMany` TradeFill rows (`skipDuplicates: true` on the
   unique `tid` as a race guard); increment `User.totalXp` (+ set `level`),
   `coinsBalance` + `coinsLifetime`; write `RewardLog` rows (XP/`TRADE_VOLUME` and
   COINS/`TRADE_VOLUME`).
4. `emitUserReward(walletAddress, { xp, coins, level, levelUp, totalXp })`.

Idempotent + farm-proof (rewards only from real fills, once per `tid` via the unique key).

## Poller — `apps/api/src/services/trading-xp/poller.ts` (registered in `index.ts`)
Mirror `startLiquidityBotScheduler` (`services/liquidity-bot/bot.ts`): a `setTimeout`
loop with a `running` guard, env-gated.
- Gate behind `TRADING_XP=on` (default off), **mainnet only**.
- Each cycle: `prisma.exchangeConnection.findMany({ where: { exchange:'hyperliquid',
  isTestnet:false, active:true } })` (join `user.walletAddress`).
- Per connection it calls the shared **`creditConnectionFills(accountAddress)`**:
  `new InfoClient(MAINNET).userFills(accountAddress)`, keep fills with
  `time > lastFillTime`, map, call `awardTradeFills`, advance `lastFillTime`.
- Throttle ~400ms between accounts (RPC friendliness, like the liquidity bot).
- Register in `apps/api/src/index.ts` startup (try/catch) as `startTradingXpPoller()`.

## Near-instant endpoint — `apps/api/src/routes/exchange.ts`
- `POST /api/exchange/credit-fills { walletAddress, isTestnet? }` → resolve `userId` →
  active mainnet hyperliquid connection → `creditConnectionFills(accountAddress)` →
  `{ newFills, xpAwarded, coinsAwarded }`. Server-verified, no-op on testnet.
- Terminal: `creditFills()` in `apps/terminal/src/lib/api.ts`, called (debounced ~3s,
  `!IS_TESTNET`) when `useAccountStream` sees a new `fill` id.

## Leaderboard / UI
- No leaderboard change needed: trading XP flows into `totalXp`, so
  `/api/users/leaderboard?sort=xp` and the level/XP chips in the app header + terminal
  navbar (already shipped) reflect it automatically.
- `RewardReason.TRADE_VOLUME` shows in the reward log / activity for transparency.

## Verification
- `pnpm --filter api typecheck` clean; `pnpm --filter api test` (rewards) green.
- Local: set `TRADING_XP=on`, with an active mainnet `ExchangeConnection` that has real
  fills (e.g. the builder/test wallet `0x8351…`). Run the api; confirm one cycle logs
  awarded XP, `RewardLog` has `TRADE_VOLUME` rows with unique `dedupeKey`, `User.totalXp`
  increased, and a **second** cycle awards nothing (dedupe holds).
- Confirm the level/XP chip in the terminal navbar + app header reflect the new total.
- Keep `TRADING_XP` off in prod until validated; turn on when ready.

## Open knobs (tune at build time)
- `TRADE_XP_PER_FEE_USD` magnitude (XP economy balance vs prediction-market XP).
- Optional daily cap / minimum fill size if wash-trading becomes a concern (HL fees
  make wash trading costly already, so likely unnecessary at launch).
