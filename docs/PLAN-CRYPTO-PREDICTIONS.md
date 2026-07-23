# Plan — Crypto Predictions event

Temporary prod-facing event until the Devnet launch. A dedicated `/crypto-predictions`
page that runs the **exact same on-chain mechanic as the main app**, but crypto-only
(5‑minute BTC/ETH/SOL pools), with real persistent users auto-funded with **1000 test
USDC** (no faucet) and a **weekly PNL leaderboard**.

Source doc: `docs/EVENT PREDICTION.md`. Decisions below are confirmed by the user.

---

## 1. Confirmed model (NOT paper trading)

- **Same as the app, exactly** — real on-chain 5‑minute crypto pools, real bets, real
  parimutuel + time-weighted payout, real auto-claim. We **reuse the whole existing
  engine**; nothing about pool creation / betting / resolution / payout changes.
- **Real persistent users** — the app's `User` (Privy embedded Solana wallet). Created
  on first login, reused across sessions and the rest of the app. No separate/temporary
  user model.
- **Money = devnet test USDC**, auto-minted **1000** on account creation (reusing the
  faucet's `mintTo`), so no Faucet UI is needed. ("$1000 virtual" = auto-given test USDC.)
- Runs on **devnet** (prod is devnet/testing), so 1000 test USDC has no real value.

So the net-new work is small and mostly frontend: a dedicated page + navbar, a weekly
PNL leaderboard, one-time auto-funding, TradingView charts, static banners, and the prod
lockdown. **No new Prisma models for pools/bets/users.**

---

## 2. What we REUSE as-is (no changes)

- **Pools**: the existing on-chain 5‑min `CRYPTO` pools for BTC/ETH/SOL (`scheduler/*`,
  `Pool` model). Already created + resolved every 5 min.
- **Bet flow**: `pool/PlaceBetCard.tsx`, `bet/BetFormControls.tsx`, `hooks/useWalletBridge.ts`
  (Privy sign + on-chain deposit), `routes/bets.ts`, `utils/payout.ts`, `usePoolWeighting.ts`,
  `pool/ResolutionCards.tsx`. On-chain, parimutuel, time-weighted — untouched.
- **User / auth**: Privy embedded wallet + `User` model + `registerUser()`
  (`services/rewards.ts`), `POST /api/users/register`. Balance = the wallet's USDC
  (`hooks/useUsdcBalance.ts`).
- **PNL / profit**: `routes/users.ts::realizedProfitMap` (`Σ(payout − stake)` over settled
  bets), `profile/TradingTab.tsx` / `PnLChart.tsx` as display templates.
- **Faucet mint**: `routes/faucet.ts` `mintTo` (already mints exactly 1000 USDC + 0.05 SOL).
- **Leaderboard UI**: `LeaderboardBoards.tsx` / `useLeaderboard.ts` / `LeaderboardRow.tsx`.
- **Prod lockdown**: the same mechanism `/worldcup` uses (redirect all prod routes to the
  event, full app dev-only) — extend it to `/crypto-predictions`.

---

## 3. Net-new work

### 3.1 Auto-fund on signup (backend)
- On first event login / registration, if the user has never been funded, mint **1000 test
  USDC** (+ a little SOL for fees) to their embedded wallet — reuse `faucet.ts`'s mint path,
  but **automatic and one-time** (a `User.autoFundedAt` flag or an `EventFunding` marker so
  it never double-mints).
- Endpoint: `POST /api/crypto-predictions/join` (or fold into `registerUser`) → ensures the
  `User`, mints once, returns balance. Idempotent.
- **Anti-abuse**: reuse the World Cup IP cap (`ipUnderParticipantCap`, env-tunable) so one
  person can't farm many auto-funded accounts / the weekly leaderboard.

### 3.2 Weekly PNL leaderboard (backend + UI) — *net-new, confirmed*
- `GET /api/crypto-predictions/leaderboard?window=week` — realized PNL per user over
  **crypto pools** with `resolvedAt >= weekStart` (rolling Monday 00:00 UTC window; no
  stored reset, just a windowed query built on the `realizedProfitMap` SQL pattern).
- Optionally include open-position mark for a live "current PNL" (see §3.3).
- UI: reuse `LeaderboardBoards`/`LeaderboardRow` with a single "Weekly PNL" board.

### 3.3 Navbar PNL (backend + UI)
- `GET /api/crypto-predictions/me` → `{ balance, realizedPnl, openPnl, weeklyPnl, rank }`.
- **Realized** from settled bets; **open** = for each unresolved bet, mark it winning/losing
  by comparing the live price to the pool's strike (reuse the price feed). Navbar shows
  balance + live PNL, refreshed on a light poll (5–10s) — reuse the account/query patterns.

### 3.4 The page `/crypto-predictions` (frontend)
Clone the World Cup shell (`app/worldcup/page.tsx`) — standalone page, Privy login, but
inside it wire the **real app** hooks (wallet bridge, bets, balance).

- **Navbar**: logo left; right → live **PNL**, **balance**, connected wallet, profile menu.
- **3 columns**:
  - **Left** — **Weekly Leaderboard** (§3.2).
  - **Center** — 3 rows of **(Pool Card → TradingView Chart)**: each card is the real
    `PlaceBetCard` for that asset's current 5‑min pool; to its right a **free TradingView
    Advanced-Chart widget** (`BTCUSDT`/`ETHUSDT`/`SOLUSDT`) in a small reusable
    `<CryptoChart asset=… />`. Charts synced to their asset.
  - **Right** — **static info banners** (Testnet launch, news, announcements, promo like
    "first to reach X wins $100"). Hard-coded config array for v1.

### 3.5 Prod lockdown (confirmed)
- Extend the existing `/worldcup`-style prod lockdown so accessing **updown.my** serves the
  event page (crypto-predictions), full app dev-only. Reuse the exact mechanism already in
  place; just point/allow the new route.

---

## 4. Data model — minimal

No new pool/bet/user models. Only a one-time-funding marker:
```
// on User (or a tiny side table):
autoFundedAt  DateTime?   // set when the 1000 test USDC was minted, prevents double-fund
```
(If a side table is cleaner: `EventFunding { userId @unique, fundedAt, txSig }`.)

---

## 5. Decisions (confirmed)

1. **Auto-fund trigger**: mint 1000 test USDC (+SOL) on the **first authenticated load**, once.
2. **Leaderboard scope**: everyone in the event — on prod the app is fully locked and the
   event is the only surface, so all authenticated players are event participants.
3. **Lockdown**: prod redirects to `/crypto-predictions` **instead of** `/worldcup` (this
   event **replaces** World Cup on prod). Nobody can reach the rest of the app on prod.
4. **SOL for fees**: yes — auto-fund also sends a little SOL so the user can sign on-chain bets.

---

## 6. Phases

- **P0** — Branch `feature/crypto-predictions`. Add `autoFundedAt` + migration. Public router skeleton. Lockdown allowlist for the route.
- **P1** — Backend: auto-fund (once, reuse faucet mint + IP cap) via `POST /join`; `GET /me` (balance + realized/open/weekly PNL); `GET /leaderboard?window=week`.
- **P2** — Page shell + navbar (balance + live PNL) + center column: 3 real `PlaceBetCard`s (current 5‑min pool per asset) each paired with a free TradingView chart.
- **P3** — Left column weekly leaderboard; right column static banners.
- **P4** — Prod lockdown wired; mobile/empty/error states; anti-abuse; copy.

---

## 7. Reuse summary

| Need | Reuse from | Effort |
|---|---|---|
| Page shell + Privy login | `app/worldcup/page.tsx` | clone (wire real hooks) |
| Pools (5‑min crypto) | existing scheduler + `Pool` | as-is |
| Bet card + on-chain bet + payout | `PlaceBetCard`, `useWalletBridge`, `routes/bets.ts`, `utils/payout.ts` | as-is |
| User + balance | `User`, `registerUser`, `useUsdcBalance` | as-is |
| Auto-fund 1000 USDC | `routes/faucet.ts` mint path | wrap (auto, once) |
| Realized PNL | `routes/users.ts::realizedProfitMap` | extend (week window) |
| Leaderboard UI | `LeaderboardBoards`/`useLeaderboard` | reuse |
| PNL display | `profile/TradingTab.tsx`/`PnLChart.tsx` | template |
| TradingView chart | free TradingView Advanced-Chart widget | thin new |
| Prod lockdown | existing `/worldcup` lockdown | extend |
| Anti-abuse IP cap | `routes/worldcup.ts::ipUnderParticipantCap` | reuse |
