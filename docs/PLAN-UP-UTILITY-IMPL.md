# UP Utility - Implementation Plan (Phase A)

> Draft (2026-07-05). Turns `docs/UP-UTILITY-SPEC.md` into buildable work.
> Companion to `docs/TOKENOMICS-PRESALE.md` and `docs/LAUNCH-CHECKLIST.md`.
> Not legal/financial advice.

## Guiding principle
The spec's core rule is `emission <= sinks + buyback`. A code audit (2026-07-05)
found the app can EMIT but not DRAIN: the UP Coins ledger already exists, but
`coinsRedeemed` is never written and `EmissionConfig` is a dead table. So the app
today is a pure faucet, which is the death spiral the spec warns about.

Phase A fixes exactly that, **fully off-chain, no token and no blockchain required**,
on the existing in-app UP Coins. This lets us test the emission/sink balance with
real users BEFORE the SPL token has money value. Every Coin a user spends pre-TGE is
one less Coin that converts into dumpable UP at the TGE.

A sink only works if it maps to something users of a predictions + trading app
already want: **pay less fees, level/earn faster, or status.** Red line: nothing that
grants economic edge inside a shared parimutuel pool (that steals value from other
players). The Phase A sinks are all safe on that axis.

---

## STATUS (2026-07-05) — Phase A SHIPPED (branch `feature/up-token-utility`, not merged)

All of Phase A is built + verified (backend live-tested, web typechecked; not yet
browser click-tested end to end). **Backend ships to prod + dev; the user-facing UI is
dev-only for now** (gated, see below) while it gets polished.

DONE:
- **Emission budget** wired. `services/emission.ts` (`reserveEmission` clamps continuous
  faucets, `recordEmission` accounts fixed grants, `scaleComponents`, `getEmissionStats`).
  Gated into `awardBetWin` / `awardTradeFills` + one-time grants. New `EmissionDaily`
  table. Back-compat: no active config = passthrough. Seed/activate via
  `scripts/seed-emission.mjs` or the admin tab. **Still DORMANT** (never activated in any env).
- **Spend primitive** `services/coin-spend.ts` `spendCoins()` — atomic overspend guard,
  idempotent, writes `coinsRedeemed` (was dead) + a `CoinSpend` row (`burned` flag).
  `applyInTx` hook grants the item atomically with the debit. `getSinkStats()`.
- **Sink 1 Streak-savers** (`services/streak-saver.ts`): buy (burns), auto-consumed in
  `resetStreak` on a loss to protect the streak (1 saver / losing bet). Route
  `POST /api/users/streak-saver`.
- **Sink 2 Cosmetics** (`services/cosmetics.ts`): `Cosmetic` + `UserCosmetic`, buy (burns) +
  equip (one per kind). Routes `GET/POST /api/users/cosmetics`, `PATCH .../equip`. Seed
  `scripts/seed-cosmetics.mjs` (10 items). `equippedCosmetics` in profile.
- **Sink 3 Boosts** (`services/boosts.ts`): time-limited 2x XP/COINS (1h/24h, capped 2x,
  one active per kind). Applied at award site; boosted coins still pass the emission budget.
  `ActiveBoost` (+`sku` so the store marks the exact bought tile). Routes `GET/POST /api/users/boosts`.
- **Admin** `routes/admin/economy.ts` + `admin/components/UpEconomy.tsx` (tab Economy →
  "UP Economy"): emission-vs-sink dashboard + epoch controls. NOT gated (operator tooling,
  stays in prod so emission can be managed there).
- **Web UX**: dedicated **`/store`** page (buy-only, sections Boosts/StreakSavers/Cosmetics);
  profile **Inventory "backpack"** dialog to equip cosmetics + see consumables/active boosts;
  equipped cosmetics render on the **own profile header** (name color, title, badge, avatar
  frame); floating **boost badges** (bottom-left, icon-per-kind + live H:MM:SS countdown);
  shared `useBoosts` hook; `CosmeticsGrid` (buy|equip modes).
- **Dev gating** `lib/features.ts` `STORE_UI_ENABLED` (true on local `next dev` + LOCAL/DEV;
  false on PROD/UNKNOWN; override `NEXT_PUBLIC_ENABLE_STORE`). Hides in prod: Store nav
  (header+mobile), profile backpack, `/store` page, boost badges. Backend un-gated.
- **UP Coins are 100% off-chain DB** (no SPL mint, nothing sent on-chain). Dev helper
  `scripts/grant-coins.mjs` to fund a wallet for testing.

## REMAINING UI WORK (before enabling the Store in prod)
The backend is solid; the UI still needs polish (this is why it's dev-gated). Open items:
1. **Public cosmetic rendering** — equipped cosmetics only show on the user's OWN profile
   header. Extend to the **leaderboard**, activity feed, and how OTHERS see a user, or the
   status sink has little social value. (Backend already returns `equippedCosmetics`.)
2. **Real cosmetic art** — badges are emoji, frames/name-colors are raw hex, titles are
   plain text. Needs designed assets + a nicer preview. Consider rarity tiers.
3. **Store visual design** — the `/store` page is functional but plain. Wants proper
   sectioning/tabs, item cards with art, "owned/new" states, empty states, mobile layout.
4. **Inventory polish** — currently a modal; consider a full page or richer layout; item art.
5. **Feedback/notifications** — toast when a streak-saver is consumed on a loss; when a boost
   is about to expire / expires; success toasts on purchase (currently inline).
6. **Boost UX** — option to extend/replace an active boost (today buying same-kind is blocked);
   pre-`sku` active boosts (bought before the sku field) show as "Locked" without highlighting
   the exact tile until they expire — cosmetic, self-heals.
7. **Balancing** — prices (streak-saver 20 UP, boosts 30/400, cosmetics 50-400) and the
   emission caps are placeholders; tune with the economy model + the emission dashboard.
8. **i18n** — UI strings are English; primary user is Spanish-speaking.
9. **Onboarding/discovery** — explain what UP Coins buy; surface the Store to new users.

OPS (not UI): activate an emission epoch per env via the admin UP Economy tab when ready
(it stays dormant until then). Apply migrations on deploy (`prisma migrate deploy`).

---

## Current state (verified in code)
- Coins ledger: `User.coinsBalance / coinsLifetime / coinsRedeemed`
  (`apps/api/prisma/schema.prisma:209-212`), BigInt, stored units, display = /100
  (`apps/api/src/utils/coins.ts`, `UP_COINS_DIVISOR = 100`).
- `coinsRedeemed` is never decremented/written anywhere -> **no spend path exists**.
- Emission (faucet) is built + farm-proof: `awardBetWin / awardBetResolution /
  awardTradeFills` (`apps/api/src/services/rewards.ts`), rewards at resolution not
  placement, `RewardLog` (append-only) + `RewardGrant` unique(wallet,type) idempotency.
- Per-wallet daily cap hardcoded `DAILY_WALLET_CAP = 500 UP` (`coins.ts:27`); trading
  coins have no cap.
- Streaks already tracked: `User.currentStreak / bestStreak`, reset in
  `resetStreak` (`rewards.ts:677`), bonus in `calculateStreakBonus` (`coins.ts:115`).
- Coin multiplier `getLevelMultiplier(level)` 1.0x -> 2.0x (`levels.ts:71-82`), applied
  in `calculateCoinsForTrade / calculateCoinsForBet / calculateWinBonus`.
- `EmissionConfig` table exists (`schema.prisma:393-406`: `dailyCoinsCap`, `epoch`,
  `totalAllocated`, `totalDistributed`, `decay`, `active`) but has **0 usages in src**.

---

## Scope of Phase A
1. Emission control: wire `EmissionConfig` (global cap + decay + `totalDistributed`).
2. Core spend primitive: `spendCoins()`, the mirror of the award functions.
3. Three sinks on the off-chain ledger:
   - Streak-savers (freeze/protect a streak)
   - Cosmetics (badges / frames / titles / name colors)
   - Boosts (time-limited XP / coin multiplier)
4. Admin: configure emission + sink store catalog and prices.
5. Metrics: emission-vs-sink dashboard (the spec's balance rule, made observable).

Out of scope for Phase A (see Phase B/C at the end): SPL mint, staking/Streamflow,
buyback bot, on-chain burn, governance, tournaments-in-UP, fee discount by staked UP.

---

## 1. Emission control (wire EmissionConfig)
**Why:** today aggregate emission is uncapped. Presale buyers at $0.004 get diluted if
free-earned UP floods the market. This is the highest-leverage, lowest-effort change:
the table is already designed.

**Work:**
- Add `getActiveEmissionConfig()` helper (cache per-epoch) in a new
  `apps/api/src/services/emission.ts`.
- Every award path (`awardBetWin`, `awardTradeFills`, milestone/referral grants) calls
  a single gate `applyEmissionBudget(amount)` BEFORE granting: check `active`, compute
  the current daily budget from `dailyCoinsCap * decay(epoch)`, and if the day's
  `totalDistributed` would exceed it, throttle (scale down) or skip and log.
- Atomically increment `EmissionConfig.totalDistributed` in the same `$transaction`
  as the coin credit, so it can't drift.
- Move the hardcoded `DAILY_WALLET_CAP` into config (per-wallet cap is a field candidate).
- Define a decay curve (higher early, tapering) so the P2E bucket (3.2B) lasts years.
  Parameterize `decay` as a function of `epoch` (e.g. geometric per month).

**Admin:** editable `dailyCoinsCap`, `decay`, `epoch`, `active`, per-wallet cap.

**Acceptance:** with a low cap set, awards visibly throttle; `totalDistributed`
increments; dashboard shows daily emission against the budget line.

---

## 2. Core spend primitive: `spendCoins()`
**Why:** all three sinks need one safe, atomic, idempotent debit. Mirror of the award
functions.

**Data model (Prisma):**
- New `CoinSpend` (or `CoinTransaction`) table: `id`, `walletAddress`, `type`
  (STREAK_SAVER | COSMETIC | BOOST), `sku`, `amount` BigInt, `burned` Bool
  (burn vs treasury), `metadata` Json, `createdAt`. Indexed by wallet.
- Optional `idempotencyKey` unique to make retries safe.

**Service (`apps/api/src/services/coin-spend.ts`):**
```
spendCoins({ wallet, amount, type, sku, idempotencyKey }):
  $transaction:
    user = SELECT ... FOR UPDATE
    require(user.coinsBalance >= amount)   // reject overspend
    UPDATE user SET coinsBalance -= amount, coinsRedeemed += amount
    INSERT CoinSpend row
  return new balance
```
- Serializers already expose `coinsRedeemed` (`serializers.ts:257,291`), so the UI
  reflects spend immediately with no extra work.
- `burned` flag drives the burn-vs-treasury split the spec leaves open. Phase A is
  off-chain so "burn" = these Coins simply never convert at TGE (record them as burned
  for the snapshot); "treasury" = they DO count toward a treasury Coins pool.

**Acceptance:** overspend rejected; balance and `coinsRedeemed` move atomically; retry
with same `idempotencyKey` is a no-op.

---

## 3. Sink 1 - Streak-savers
**Desire:** don't lose progress. Proven sink (Duolingo/Snapchat). Pure burn.

**Data model:** `User.streakSavers Int @default(0)` (or an inventory row).

**Flow:**
- Purchase: `POST /coins/streak-saver` -> `spendCoins(type=STREAK_SAVER, burned=true)`
  + increment `streakSavers`. Price = admin config.
- Consume: in `resetStreak` (`rewards.ts:677`), if a loss/miss would reset the streak
  and `streakSavers > 0`, consume one and preserve `currentStreak` instead of resetting.
  Decision: auto-consume vs opt-in prompt. Recommend opt-in prompt (clearer value),
  with an "auto-protect" toggle for power users.
- Cap: max N savers held; optional cooldown so it can't fully negate the streak mechanic.

**UI:** buy button near the streak widget; "streak protected" state on next loss.

---

## 4. Sink 2 - Cosmetics
**Desire:** status. Zero economic risk (safest sink). Pure burn.

**Data model:**
- `Cosmetic` catalog: `id`, `sku`, `kind` (BADGE | FRAME | TITLE | NAME_COLOR),
  `name`, `price` BigInt, `active`, `metadata` Json (asset ref / color).
- `UserCosmetic`: `walletAddress`, `cosmeticId`, `equipped` Bool, `acquiredAt`,
  unique(wallet, cosmeticId).

**Flow:**
- Purchase: `POST /coins/cosmetics/:sku` -> `spendCoins(type=COSMETIC, burned=true)`
  + insert `UserCosmetic`.
- Equip: `PATCH` sets `equipped` (one active per kind).
- Render: profile + leaderboard read equipped cosmetics. Profile surface already exists.

**UI:** a simple store grid (reuse admin DataTable patterns) + equipped state on profile.

---

## 5. Sink 3 - Boosts (time-limited XP / coin multiplier)
**Desire:** level/earn faster. Burn. Must be capped so it doesn't trivialize progression.

**Data model:** `ActiveBoost`: `walletAddress`, `kind` (XP | COINS), `multiplier`
(e.g. 2.0), `expiresAt`, `createdAt`. At most one active per kind.

**Flow:**
- Purchase: `POST /coins/boosts/:sku` -> `spendCoins(type=BOOST, burned=true)` + create
  `ActiveBoost` with `expiresAt = now + duration`.
- Apply COINS boost: in `calculateCoinsForBet / calculateCoinsForTrade /
  calculateWinBonus` (`coins.ts`), multiply the result by the active COINS boost.
- Apply XP boost: multiply `XP_ACTIONS` / `tradeXpForFill` output at the award site.
- Caps: max duration, cooldown between purchases, and note that XP boost indirectly
  lowers fees (level -> fee) so cap it. Boosted emission STILL passes through the
  `applyEmissionBudget` gate from section 1 (a boost cannot exceed the global budget).

**UI:** boost store card with active-boost countdown.

> Note: the 1.0x->2.0x value is the COIN multiplier (`getLevelMultiplier`), not XP; XP
> per action is fixed. An "XP boost" introduces a new XP-multiplier concept at the
> award site.

---

## 6. Admin
- Emission tab: edit `EmissionConfig` (cap, decay, epoch, per-wallet cap, active).
- Store tab: CRUD the sink catalog (streak-saver price, cosmetics, boosts) + toggle
  active + set burn-vs-treasury per SKU.
- Reuse existing admin abstractions (DataTable / Paginator / useAdminResource).

## 7. Metrics (make the balance rule observable)
- Dashboard: daily emission (sum of awards) vs daily sink (sum of `CoinSpend`) vs the
  budget line. This is the spec's `emission <= sinks + buyback` rule, visible.
- Buyback is 0 in Phase A (no token yet); the panel is ready for Phase C.

---

## Sequencing (tickets)
1. `EmissionConfig` wiring + gate in award paths + admin emission tab. (highest leverage)
2. `spendCoins()` primitive + `CoinSpend` table.
3. Streak-savers (smallest sink, exercises the primitive end-to-end).
4. Cosmetics (safe, high status value).
5. Boosts (needs the caps + apply-at-award-site plumbing).
6. Admin store tab + metrics dashboard.

Each ships independently; 1 and 2 unblock everything else.

---

## Phase B (next, needs some on-chain)
- Tournaments payable in UP (Anchor program is mint-agnostic, no program change).
  BLOCKED on the tournaments redesign (current model is being rebuilt over
  sports/crypto/PM pools). See `project_tournament_prediction_timing`.
- Prediction fee discount by UP staked (add stake as a second input to `resolveFeeBps`,
  `utils/payout.ts:86`). Stake-based (locked), not hold-based.

## Phase C (needs the SPL token live + real traffic)
- Staking (Streamflow, permissionless) driving fee discount + earn boost + fee share.
- Buyback & burn: segregate the fee wallet (today prediction fees land in the shared
  authority ATA), Jupiter swap USDC->UP, burn path. Manual admin trigger first
  (testable on devnet), auto-bot later reusing the liquidity-bot pattern. Cross-chain
  caveat: HL builder rewards live on Arbitrum, prediction fees on Solana.
- Trading fee discount is a MINOR perk: HL caps builder fee at 10 bps perps / 100 bps
  spot, and it is our only trading revenue (competes with buyback). Do not overweight it.
- Governance.

Related: `docs/UP-UTILITY-SPEC.md`, `docs/TOKENOMICS-PRESALE.md`,
`docs/LAUNCH-CHECKLIST.md`, `docs/REWARDS-XP-LEVELS.md`, `docs/TRADING-FEES-AND-XP.md`.
