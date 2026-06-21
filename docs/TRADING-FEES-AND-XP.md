# Trading — fees, the `trade_fills` table, and XP economy

Reference for the terminal's HyperLiquid perps trading: what fees are charged,
what we persist per fill, and how trading converts to UpDown XP. Drop the
user-facing parts (fee table, XP rates) into the app's public docs when ready.

---

## 1. Fees charged on a trade

Two independent fees apply to a fill:

| Fee | Who sets it | Rate | Paid to | When |
|-----|-------------|------|---------|------|
| **Maker** (HL) | HyperLiquid | **0.0150%** (1.5 bps) | HyperLiquid | on a fill that *added* liquidity (resting limit order) |
| **Taker** (HL) | HyperLiquid | **0.0450%** (4.5 bps) | HyperLiquid | on a fill that *crossed* the book (market / marketable limit) |
| **Builder fee** (UpDown) | UpDown | **0.0500%** (5 bps) | UpDown builder wallet | on every order routed with our builder code |

Notes:
- HL maker/taker rates are the base tier and decrease with 14-day volume / staking.
  We read the user's actual rates from `userFees` (`userAddRate` / `userCrossRate`)
  and show them in the terminal's Account Info.
- **Builder fee** is our revenue. Configured by `HYPERLIQUID_BUILDER_ADDRESS` +
  `HYPERLIQUID_BUILDER_FEE` (in **tenths of a basis point**; `50` = 5 bps = 0.05%).
  Cap for perps is 10 bps. Requires the builder wallet to hold ≥100 USDC perps and
  the user to have approved the builder fee once (one signature).
- Withdrawals: flat **1 USDC** fee, min 2 USDC (HL). Deposits and Spot↔Perps
  transfers are free. Min deposit 5 USDC.

**Effective cost example (per $1,000 notional):**
- Maker fill: $0.15 (HL) + $0.50 (builder) = **$0.65**
- Taker fill: $0.45 (HL) + $0.50 (builder) = **$0.95**

---

## 2. `trade_fills` table (persisted history)

Every credited HyperLiquid fill is stored (one row per exchange fill). Powers XP
dedupe, the user's own trade history, and volume/fee analytics + builder revenue.
Defined in `apps/api/prisma/schema.prisma` (model `TradeFill`, table `trade_fills`).

| Column | Type | Meaning |
|--------|------|---------|
| `id` | uuid | PK |
| `wallet_address` | text | UpDown identity (FK → `users`) |
| `account_address` | text | HL/EVM account the fill belongs to (lowercased) |
| `exchange` | text | `hyperliquid` (default) |
| `tid` | bigint **unique** | exchange fill id → idempotency key |
| `coin` | text | e.g. `BTC` |
| `side` | text | `BUY` \| `SELL` |
| `px` | text | fill price |
| `sz` | text | fill size (base) |
| `notional_usd` | text | \|px × sz\| |
| `fee_usd` | text | fee paid on this fill (HL fee; encodes maker/taker) |
| `pnl_usd` | text? | closed PnL (HL `closedPnl`), null if none |
| `dir` | text? | HL direction label, e.g. "Open Long" |
| `xp_awarded` | bigint | XP granted for this fill |
| `time` | bigint | fill time (ms) |
| `created_at` | timestamp | row insert time |

Indexes: unique `tid`; `(wallet_address, time)`; `(account_address, time)`.

Useful queries:
- **User volume / fees:** `SUM(notional_usd)`, `SUM(fee_usd)` grouped by `wallet_address`.
- **Builder revenue (our cut):** builder fee = 5 bps of notional →
  `SUM(notional_usd) * 0.0005` (the `fee_usd` column is the *HL* fee, not ours).
- **Trade history (UI):** `WHERE wallet_address = ? ORDER BY time DESC`.

---

## 3. XP economy (trading → unified level)

Trading XP feeds the **same** `User.totalXp` / `level` as prediction markets, so
it shows on the existing leaderboard and the level/XP chips (app header + terminal
navbar). See `docs/PLAN-TRADING-XP.md` for the build.

- **Formula:** `XP = round(feeUsd × TRADE_XP_PER_FEE_USD)` per fill
  (`apps/api/src/utils/levels.ts`). Volume-based and taker-weighted automatically,
  because the fee scales with notional and the taker rate is 3× maker.
- **Default `TRADE_XP_PER_FEE_USD = 200`** (tunable):

  | Trade (notional) | HL fee | XP |
  |---|---|---|
  | $1,000 maker | ~$0.15 | ~30 XP |
  | $1,000 taker | ~$0.45 | ~90 XP |
  | $10,000 taker | ~$4.50 | ~900 XP |

  (Compare prediction markets: BET_PLACED = 100 XP, BET_WON = 150 XP.)
- **Credited from real fills** (`userFills`), not order placement — a fill is what
  pays the fee. Each fill credits once (dedupe via `trade_fills.tid`).
- **Farm-proof:** wash trading still pays the real maker/taker + builder fees, so
  it's not free to farm; XP is proportional to fees actually paid.
- **Reward log:** each award writes a `RewardLog` row with `reason = TRADE_VOLUME`
  and metadata `{ fills, totalNotional, totalFee, tids }` for transparency/audit.
- **Gating:** crediting runs only when `TRADING_XP=on` (default off), mainnet only.
  Tunables: `TRADING_XP_INTERVAL_SECONDS` (default 120).

### UP coins (alongside XP)
Trades also mint **UP coins** by notional volume, into the same coin balance as
betting (`apps/api/src/utils/coins.ts` → `calculateCoinsForTrade`).
- **0.01 UP per $1 of notional volume** (`TRADE_COINS_BASE_PER_USD = 1` base unit/$1)
  × level multiplier. Volume-based (not fee-weighted). Min notional $1.

  | Volume (notional) | UP coins (lvl 1) |
  |---|---|
  | $1,000 | 10 UP |
  | $10,000 | 100 UP |
  | $100,000 | 1,000 UP |

- No daily cap in v1 (real fees deter wash farming); credited once per fill (`tid`).

### Near-instant crediting
The terminal pings `POST /api/exchange/credit-fills` when its WS sees a new fill;
the API re-fetches `userFills` (server-verified) and credits immediately
(`creditConnectionFills`). The 120s poller stays as a safety net.

---

## 4. Tunables (env / constants)

| Knob | Where | Default |
|------|-------|---------|
| `HYPERLIQUID_BUILDER_ADDRESS` | apps/api env | builder wallet (public) |
| `HYPERLIQUID_BUILDER_FEE` | apps/api env | `50` (tenths-bps = 0.05%) |
| `TRADE_XP_PER_FEE_USD` | `apps/api/src/utils/levels.ts` | `200` |
| `TRADING_XP` | apps/api env | off (`on` to enable crediting) |
| `TRADING_XP_INTERVAL_SECONDS` | apps/api env | `120` |
