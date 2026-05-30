# Strategy — Cold-Start Problem & XP Economy

> Analysis of UpDown's incentive system and the parimutuel cold-start problem
> (why would a user be the first bettor on an empty pool?). Output of a
> 10-agent codebase + competitor research session, with concrete proposals
> ranked by impact/effort.
>
> **Date**: 2026-05-30
> **Status**: STRATEGIC PROPOSAL (not yet executed)
> **Scope**: Frontend, backend, contract changes flagged where needed.

---

## TL;DR

**Why would someone be the first bettor on an empty pool today?** Honestly,
they wouldn't — and the code proves it. A safety net **already exists** (the
scheduler auto-refunds single-bettor or one-sided pools via synthetic-price
resolution), but the UI never surfaces it, the protocol still charges a 5%
fee on the refund, and the user sees "1.0x odds" in the bet form which reads
as "I'll get my own money back if I win."

**Is the current incentive system enough?** No. UpDown has the components
(XP, levels, tournaments, squads, referrals, faucet) but they're
**disconnected from each other and from the cold-start problem**. Squads
aren't really squads (no shared pools, no cross-member notifications),
tournaments are isolated from parimutuel pools, UP Coins accrue with no
spend sink, and notifications don't pull anyone back.

**What should we do?** A mix of three things:
1. Surface the safety net that **already exists** (zero-eng marketing win).
2. Seed liquidity with the authority wallet as a CAC line item with
   closed-form max loss per pool (≈ $0.50/side at pool creation).
3. Connect XP/coins/squads/tournaments so each piece reinforces the next
   (UP Coins redemption, squad mate notifications, challenge links, etc).

This document is the long-form version. The execution roadmap is in
[§7 Roadmap](#7-suggested-roadmap).

---

## 1. The problem in one paragraph

UpDown is a parimutuel betting platform on Solana. In parimutuel, the first
bettor has **no counterparty**: their bet sits alone on one side, the pool
looks dead, and their displayed payout multiplier is 1.0x because the math
`(stake / sideTotal) × totalPool = (stake / stake) × stake = stake`. That
creates a classic chicken-and-egg: nobody wants to be first because being
first looks unrewarding, so pools sit empty, so nobody wants to be first.

Every mature prediction-market and parimutuel platform (Polymarket, Kalshi,
Manifold, horse-racing tote) has explicitly solved this. They all **pay for
liquidity in some form**: subsidies, market makers, guaranteed pools, per-user
early-bird bonuses. UpDown currently does nothing of the kind.

---

## 2. The current incentive landscape — what exists today

What follows is the audit of the actual code (file:line citations) for each
system. Read this as ground truth, not specs.

### 2.1 XP system

Source of truth: `docs/REWARDS-XP-LEVELS.md` + `apps/api/src/utils/levels.ts`
+ `apps/api/src/services/rewards.ts`.

**Earning rules** (XP is awarded at pool resolution, never at deposit —
fixed in [bug_xp_farming_placement.md](../MEMORY.md)):

| Action | XP | Condition | Source |
|---|---:|---|---|
| Bet placed (participation) | 100 | Pool resolves normally (two-sided) | `rewards.ts:awardBetResolution` |
| Daily first bet bonus | 200 | Once per UTC day | `rewards.ts` |
| Bet won | 150 | Winning bet claimed | `rewards.ts:awardBetWin` |
| Win streak bonus | `100 × (min(streak,10) − 2)` | Streak ≥ 3, capped at 800 | `rewards.ts:winStreakBonus` |
| Referral accepted | 500 | One-time per referral | `referrals.ts` |
| Claim completed | 50 | Any claim submission | `rewards.ts:awardClaimCompleted` |

**Level curve** (formula: `threshold(L) = Σ floor(500 × (n−1)^1.8)`):

| Level | Cumulative XP | XP from prev | Fee | Coin Mult |
|---:|---:|---:|---:|---:|
| 1 | 0 | — | 5.00% | 1.0× |
| 2 | 500 | 500 | 5.00% | 1.0× |
| 5 | 11,915 | 6,062 | 4.75% | 1.0× |
| 10 | 97,362 | 26,097 | 4.50% | 1.1× |
| 15 | 318,562 | 57,809 | 4.25% | 1.2× |
| 20 | 730,569 | 100,167 | 4.00% | 1.35× |
| 30 | 2,329,192 | 214,430 | 3.50% | 1.7× |
| 40 | 5,275,014 | 365,499 | 3.00% | 2.0× |

**Honest assessment**: meaningful unlocks don't begin until **Level 15+**
(0.75% fee discount, 1.2× coin multiplier). Level 10 takes ~97K XP ≈ 3-4
weeks of daily play. Most new users churn before they ever feel a perk.

### 2.2 UP Coins system

Source: `apps/api/src/utils/coins.ts`.

| Action | Coins (base units) | Display |
|---|---:|---:|
| Bet placed (base) | $USDC × 10 × levelMult × dailyRate | 0.10 UP per $1 |
| Bet won (bonus) | 50% of base | — |
| Win streak (3+) | `min(streak × 200, 2000)` | up to 20 UP |
| Level up | `newLevel × 500` | Lv2 = 10 UP, Lv40 = 200 UP |
| Referral accepted | 5,000 | 50 UP |

**Daily cap**: 50,000 base units (500 UP) per wallet.
**Diminishing returns**: bets 1–20/day at 100%, 21–40 at 50%, 41+ at 0%.

**Critical gap**: there is **no spend sink for UP Coins**. They accrue
forever with no catalog, no redemption, no perks. The economy is leaky.

### 2.3 Payout math

Source: `programs/parimutuel_pools/src/instructions/claim.rs:77–90` (on-chain)
+ `apps/api/src/utils/payout.ts:32–40` (preview).

Formula:
```
gross_payout = (user_bet × total_pool) / total_winning_side
fee          = gross_payout × fee_bps / 10000   // unless single bettor
net_payout   = gross_payout − fee
```

**Fee schedule** (`apps/api/src/utils/fees.ts`): 5.00% (default / Lv<5) →
3.00% (Lv≥40), per 5-level tier.

**Fee waiver**: only if there's exactly **1 distinct wallet across the whole
pool** (`apps/api/src/utils/bets.ts:11–18`). Not per-side.

**Concrete scenarios**:

| Scenario | Setup | User bet | Outcome | Net payout | Multiple |
|---|---|---:|---|---:|---:|
| Balanced late entrant | $100/$100, add $10 UP | $10 | UP wins | $18.14 | 1.81× |
| First bettor + later flow | empty, then $60/$200 | $10 (first) | UP wins | $41.17 | 4.12× |
| Skewed contrarian | $1000/$10, add $10 DOWN | $10 | DOWN wins | $484.50 | **48.45×** |
| Lone winner | $100 UP, $0 DOWN | $100 | UP wins | $100 (5% fee on refund) | 0.95× |
| Lone loser | $100 UP, $0 DOWN | $100 | DOWN wins (synthetic) | refund − 5% | 0.95× |

**Key UX problem**: the first scenario (the lone winner) feels like a loss —
the user "won" but got 0.95× their stake back because of the fee on the
refund-equivalent. They don't know the refund is happening; they see "winner
paid out" and a number smaller than what they put in.

### 2.4 Empty-pool UX

Source: agent audit of `MarketCard.tsx`, `BetForm.tsx`, `SideSelector.tsx`,
match detail page, `resolve-logic.ts`.

- **MarketCard** falls back to a hardcoded `2.0x` (crypto) or `3.0x` (sports)
  when `total == 0`. Cosmetic only.
- **BetForm / Match page** correctly compute `1.0x` for the first bettor.
  Discrepancy with the card.
- **SideSelector** shows "No predictions yet" — placeholder, not explanation.
- **No banner / tooltip / disclaimer** anywhere explaining the cold-start
  situation or the auto-refund safety net.
- **Resolution scheduler** (`apps/api/src/scheduler/resolve-logic.ts:308–328`):
  if `betCount === 1`, call `handleSingleBettorRefund` with synthetic prices
  that make the bettor's side "win", then `autoRefundBets`. If one-sided,
  invert winner and refund.
- **On-chain refund** (`programs/parimutuel_pools/src/instructions/refund.rs`)
  uses the same payout formula → returns stake minus 5% fee.

**The safety net works.** The user just doesn't know.

### 2.5 Tournaments

Source: `apps/api/src/services/tournament.ts`,
`apps/api/src/services/tournament-bracket.ts`, schema lines 324–427.

- Admin-created only (no auto-scheduling, no user-created).
- Entry-fee funded, **no platform subsidy**.
- Winner takes 95% of prize pool, platform takes 5%, **losers get $0**.
- 8-person tournament with $5 entry: winner $38, EV per player = **−$0.25**.
- **Zero connection to parimutuel pools.** No FK, no shared data, no shared
  XP. A Champions League tournament does not pull users into Champions
  League parimutuel pools.

### 2.6 Referrals

Source: `apps/api/src/services/referrals.ts:9–11`.

- **Commission**: 1% of every referee bet (`COMMISSION_BPS = 100`), lifetime,
  uncapped. Triggered at pool resolution, independent of win/loss.
- **Payout**: USDC, instant on-chain, manual claim, $1 minimum.
- **Referee bonus**: 50 UP coins + 500 XP. **No USDC for referee** (weak vs
  competitors like Stake.us which give $25 cash).
- **Anti-fraud**: prevents same-wallet self-referral. **Doesn't prevent**
  multi-wallet self-referral (no KYC).
- **UI bug**: tooltip says "20% of platform fees" but code is "1% of bet
  amount". They happen to coincide when `fee = 5%` (`20% × 5% = 1%`), but
  diverge when fee drops with level. Fix the copy.

### 2.7 Squads

Source: `apps/api/src/services/squads.ts`, `apps/api/prisma/schema.prisma:283`.

- Squad **isn't shared betting**. Each member places individual bets with
  individual payouts. Squad = chat room + per-squad leaderboard.
- No squad-specific XP boost, no shared chest, no squad badges, no squad
  pool subsidies.
- **No cross-member notifications**: when Alice bets $50 UP, her 19
  squadmates see nothing.
- No friend system, no following, no user discovery, no profile browsing.

### 2.8 Faucet & test economy

Source: `apps/api/src/routes/faucet.ts:8–13`.

- **1,000 USDC + 0.05 SOL per claim**, 1-hour cooldown, **no daily cap**
  (24 claims/day = 24K USDC max per wallet).
- Cooldown is **in-memory only** — server restart wipes it. No DB log.
- Devnet USDC mint: `By87mHK9Meinfv4AEqTx9qyYmGDLUcwiywpkkCWwGUVz`.
- **No login bonus, no welcome flow.**
- Strategic implication: the USDC is **play money**. Sunk-cost fallacy
  doesn't apply. Engagement must come from gamification, not loss aversion.

### 2.9 Notifications

Source: `apps/api/src/services/notifications.ts`, `NotificationToasts.tsx`,
`NotificationPanel.tsx`, websocket events index.

What works:
- POOL_WON / POOL_LOST / POOL_CLAIMABLE / REFUND_RECEIVED (DB + toast).
- COINS_EARNED / LEVEL_UP / XP_EARNED (WebSocket toast + confetti).
- TOURNAMENT_REGISTERED / TOURNAMENT_MATCH_WON|LOST / TOURNAMENT_WON.

What's missing (huge):
- **No push notifications** (no FCM, OneSignal, Web Push, Service Worker).
- **No email** (no SendGrid, Resend, Mailgun).
- **No onboarding / welcome / first-bet bonus** flow.
- **No squad mate activity notifications** (the most obvious cold-start
  lever — a squadmate betting could ping the other 19 instantly).
- **No empty-pool warnings** ("3 pools in your category have no DOWN side").
- **No inactivity reminder** ("you haven't bet in 3 days").
- **Streak silently tracked** — no celebration toast, no "keep it alive".

---

## 3. The six critical gaps

The audit reveals a pattern: every system is **locally correct but globally
disconnected**. Each one falls short for the same structural reason — none
of them feed the others.

1. **The safety net is invisible.** Auto-refund of single-bettor and
   one-sided pools works, but the UI never tells the user, and the 5% fee
   still applies → user experiences -5% EV on a refund they didn't even
   know was a refund.
2. **The XP curve is brutal in the early game.** Level 5 (first fee
   discount) is ~12K XP ≈ 100 resolved pools. Level 10 is ~97K XP ≈ 3-4
   weeks of daily play. No perceptible milestone in between.
3. **UP Coins are a leaky bucket.** Accrue forever, no spend sink, no
   catalog, no redemption. The whole XP/coin economy lacks a sink.
4. **Squads aren't squads.** No shared pools, no cross-member XP, no
   notifications when squadmates act. They're glorified Discord rooms.
5. **Notifications don't pull anyone back.** No push, no email, no
   onboarding, no inactivity nudges, no celebration of streaks.
6. **Tournaments are isolated from pools.** Tournaments draw USDC out
   (entry fees) but route none of it into parimutuel pools. They compete
   with pools for user attention rather than feeding them.

---

## 4. How competitors solve the cold-start problem

Every mature platform pays for liquidity in some form. The exact mechanism
varies, but the principle is universal: **treat cold-start subsidy as a CAC
line item with a closed-form max loss per pool**.

| Platform | Mechanism | Approx cost |
|---|---|---|
| Polymarket | Liquidity Rewards ~$1K/day per politics market + 4% holding rewards + maker rebates 20-25% of taker fee | $5M+/mo Treasury |
| Kalshi | Susquehanna as designated MM + Fee Rebate Program up to $7K/wk per MM | Up to $5M/mo |
| Manifold | 5 mana / unique trader (first 50) + 20 mana / unique trader liquidity subsidy with decay | Creator-funded + protocol mana |
| **Horse-racing tote** (the actual parimutuel reference) | **Guaranteed pools** (track tops up to floor) + **minimum payouts** ($2.20 on $2 stake = 0.10× floor) + **pool seeding** (house bets streamed by patented "seeder" software) + **carryovers** from unfilled pools | Track eats "minus pools" |

**The horse-racing pattern is the closest to UpDown** (parimutuel, real
money, 80+ years of operational track record). Their playbook is exactly
what we need: seed pools, guarantee floors, carry overflow into the next
pool.

**Patterns explicitly NOT recommended:**
- LMSR / AMM market maker (Polymarket abandoned it for capital efficiency
  reasons; Manifold rejected it; wrong tool for parimutuel anyway).
- Maker/taker rebates (assumes order book; doesn't apply to parimutuel).
- PredictIt-style $850 hard caps (solves whale dominance, not bootstrap).
- Native protocol token for resolution (Augur REP — too much regulatory
  and engineering surface for current stage).

---

## 5. Top 5 proposals — ranked by impact / effort

Each proposal lists: mechanism, engineering cost (S/M/L T-shirt), operator
risk (max $ exposure), behavioral impact, composability with existing
systems.

### Rank 0 (do this week regardless) — **Surface the existing safety net**

**Mechanism**: copy + tooltip in `BetForm` and `MarketCard` when
`total === 0`: *"Be first — if no one matches you, your stake is
auto-refunded."* Remove the hardcoded `2.0x` fallback in MarketCard when
the pool is empty (it lies; the real multiplier for the first bettor is
1.0x with a refund safety net).

- **Eng**: S (frontend only, 1 day).
- **Risk**: $0.
- **Impact**: turns the perception of "1.0x is bad" into "1.0x with
  protected downside is the safest bet on the platform." Zero-cost
  marketing of something we already built.
- **Composability**: makes every other proposal in this doc more credible.

### Rank 1 — **House seeding bot (B1)**

**Mechanism**: a scheduled API task uses the authority wallet to deposit
$0.50 on each side (or $0.34/$0.33/$0.33 for 3-way) the moment a pool is
created. The pool no longer looks dead. Tag the authority's `Bet` row with
a flag so it's excluded from leaderboards / XP.

- **Eng**: M (scheduler hook + wallet tag + tests). **No contract change**
  — the `deposit` ix already accepts any signer.
- **Risk**: bounded per pool. Authority loses one side, recovers the other
  minus fee. Worst case (pool empty besides seed) = refund of own seed
  with fee = ~$0.05 per pool. **At 1000 pools/day → ~$50–100/day, capped.**
- **Impact**: huge psychological lift. $0.50/$0.50 reads as "game already
  starting" vs the dead $0/$0.
- **Composability**: stacks with everything. Counts toward "pool depth" UX
  signals (e.g. arena bar).

### Rank 2 — **Founder's Fee Discount (A2)**

**Mechanism**: the first wallet to deposit on a pool pays `fee_bps = 0`
at claim. API already chooses `fee_bps` per user via `getFeeBps(level)`;
just add a check "is this wallet the first bet on this pool?" before
signing the claim ix.

- **Eng**: S (API only, no contract change).
- **Risk**: bounded — max one wallet per pool gets the discount, max loss
  per pool = fee on that wallet's payout. Typical pool $10–$100, fee 5% →
  **$0.50–$5 max loss per pool.** Capped by platform's own fee revenue,
  not authority subsidy.
- **Impact**: direct economic incentive + clean marketing message: *"Be
  first, pay zero fee."*
- **Composability**: stacks with Rank 0 (refund safety net) and Rank 1
  (house seed creates a pool that already looks alive when the first user
  arrives).

### Rank 3 — **UP Coins redemption catalog (G3)**

**Mechanism**: visible spend sink for the coins everyone is accruing:
- 100 UP → $1 USDC (treasury-funded, daily cap).
- 50 UP → free entry to next tournament.
- 200 UP → cosmetic profile banner.
- Other tiers (badges, leaderboard frames, etc).

- **Eng**: M (catalog table, redemption flow, authority-signed USDC
  transfer for the cash tier).
- **Risk**: only the $1 USDC tier has real-money exposure. Cap with daily
  limits ($50/day platform-wide) and treasury budget.
- **Impact**: **mandatory** if we want any XP/coin mechanic to feel valuable
  long-term. Without a sink, the entire economy is a leaky bucket. Every
  rank-up, every streak, every bonus becomes a real economic loop.
- **Composability**: amplifies every other reward in this doc.

### Rank 4 — **Challenge link (D3)**

**Mechanism**: when user A bets on UP, they get a "Challenge a friend"
share link. Friend opens it, lands on the pool with DOWN pre-selected and
an "Accept Challenge" CTA. If friend deposits, both get +50 XP and a
"Duel" badge. Route through referrals so the 1% commission applies when
the friend has no referrer yet.

- **Eng**: M (`?challenge=<betId>` query handler + new XP action +
  share-link UI).
- **Risk**: $0 — virtual rewards only.
- **Impact**: **simultaneously solves cold-start AND drives acquisition**.
  The best viral unlock in this list without a contract change.
- **Composability**: best when stacked with referrals (auto-referral when
  friend isn't referred yet) and with squad mate notifications.

### Rank 5 — **Early-bird XP/coin multiplier (E1)**

**Mechanism**: bets in the first 25% of the deposit window earn 1.5× XP
and 1.5× UP coins on resolution; decays linearly to 1.0× by lock-time.
Persist `placedFractionOfWindow` on each `Bet` row at deposit-confirm time.

- **Eng**: S (one scalar + persistence).
- **Risk**: $0 — virtual rewards, daily cap on UP Coins already protects
  against farming.
- **Impact**: pulls deposit activity forward in the pool lifecycle —
  exactly where cold-start matters most.
- **Composability**: multiplies with the existing level coin multiplier.

### Honorable mentions (not in top 5 but worth considering)

| Code | Mechanism | Why it matters |
|---|---|---|
| A1 | Pioneer Badge + first-bettor XP bonus | Cheap, virtual, gamifies being first. |
| B2 | Conditional seed (matches lone bettor at T-5) | Variant of B1 with smaller cost surface. |
| B3 | Liquidity Bounty (+5% to first bettor if pool refunds) | Converts neutral refund into a positive event. |
| C1 | Floor-guaranteed odds for early bettors | Solves "I won but only got 1.02×" UX moment. |
| C2 | First-bet-of-the-day insurance (50% stake refund on loss) | Daily retention hook. |
| D1 | Squad-pool seed pact (need 2 commits in 60s) | Aborts pools that would die. |
| D2 | "Light the Match" alert for imbalanced pools | In-session counterpart to push notifications. |
| E2 | Pool extension if undersubscribed | **Requires contract change.** Defer until volume justifies. |
| F1 | Pioneer's Cup weekly tournament | Recurring acquisition for repeat pioneers. |
| F2 | Tournament seed slots | Tournament UX gets the same B1 treatment. |
| G1 | Participation streak (XP for active days, not just wins) | Removes the "one loss erases everything" feeling. |
| G2 | Weekly quests / side missions | Direct traffic to neglected categories. |
| H1 | Category-based out-of-session push (needs Service Worker) | Re-attract dormant users. |
| H2 | Comeback bonus after 3+ days inactive | Recovery of churned users. |

---

## 6. Things to fix while we're here (free wins)

These are bugs / inconsistencies that the audit surfaced. Worth fixing even
if none of the strategy above ships.

- **Referral copy bug** — UI tooltip says "20% of platform fees" but the
  code is "1% of every bet". They happen to coincide at `fee = 5%`. Fix
  the copy or fix the formula, not both. (`ReferralShareLink.tsx:34`).
- **MarketCard odds discrepancy** — falls back to hardcoded `2.0x` / `3.0x`
  when `total = 0`, while BetForm correctly shows `1.0x`. Pick one.
- **Faucet cooldown is in-memory only** — server restart wipes it. Persist
  to DB. (`apps/api/src/routes/faucet.ts:11–13`).
- **No persistent faucet claim log** — can't audit claims from our DB. Add
  a `FaucetClaim` table.
- **Streak silently tracked** — no toast when streak increments past
  milestones (3, 5, 10). Add a celebration.
- **Daily-first-bet bonus silent** — surface a banner "200 XP bonus
  available — place your first bet today!"

---

## 7. Suggested roadmap

Five sprints, ordered by effort and the dependency graph.

### Sprint 1 (1 week) — zero risk, pure UX

- Rank 0: surface refund safety net + fix the `1.0x vs 2.0x` discrepancy.
- Squad mate notifications when a squadmate places a bet (uses existing
  `notifications.ts` + WebSocket — zero risk).
- "Light the Match" banner for imbalanced pools (D2, no XP bonus v1).
- Fix the referral copy bug ("1% of every bet").
- Surface streak milestones (toast on streak 3, 5, 10).

### Sprint 2 (2–3 weeks) — liquidity foundation

- **B1 house seeding bot** with daily exposure cap ($100).
- **A2 founder's fee discount** for the first depositor.
- Persist faucet cooldown to DB + add `FaucetClaim` log table.

### Sprint 3 (3–4 weeks) — close the economic loop

- **G3 UP Coins redemption catalog** (cash + free tournament entry +
  cosmetics).
- **E1 early-bird multiplier** (1.5× XP/coins in the first 25% window).
- **G1 participation streak** (XP for active days, not just wins).

### Sprint 4 (4–6 weeks) — virality + retention

- **D3 challenge links** with auto-referral integration.
- **H2 comeback bonus** (3+ days inactive → 2× XP + 100 UP).
- **Real squad shared pools** (members co-deposit, shared payout,
  shared XP) — confirms whether the squad feature has a real product
  shape or should be deprecated.

### Sprint 5+ (month 2–3) — bigger plays if metrics justify

- **E2 pool extension** if a contract change is justified by the metric
  "pools refunded due to undersubscription".
- **Service Worker + Web Push** to enable out-of-session notifications
  (H1, category-based pool alerts).
- Re-evaluate tournament integration once pools are healthy.

---

## 8. Exposure budget — treat subsidies as CAC

For each mechanism with real-money exposure, cap upfront. Reassess monthly.

| Mechanism | Daily cap | Monthly cap |
|---|---:|---:|
| B1 house seeding | $100 | $3,000 |
| A2 fee discount (revenue loss, no out-of-pocket) | — | — |
| G3 USDC redemption (the $1 tier) | $50 | $1,500 |
| C2 first-bet-of-day insurance (if shipped) | $200 | $6,000 |
| B3 liquidity bounty (if shipped) | $50 | $1,500 |
| **Total upper bound** | | **~$12K/mo** |

For context: Kalshi spends up to **$5M/mo** on MM rebates alone. This
budget is two orders of magnitude smaller and aimed at the most leveraged
point in the funnel (the first bettor on each pool).

---

## 9. The opinionated take

If forced to pick **three things to ship this week** and defer everything
else, these are them:

1. **Surface the refund safety net** (1 day of copy / tooltip — a change
   that costs nothing and reframes the entire first-bettor experience).
2. **B1 house seeding at $0.50/side** (1 week of scheduler work — changes
   the perception of the product from "dead pools everywhere" to "pools
   already in progress").
3. **Squad mate bet notifications** (2 days — turns squads into what they
   should be: a social FOMO loop for filling each other's pools).

These three together change the first-bet flow from
**"risky + 1.0x + alone"** to
**"already-started pool + downside-protected + my squad is watching"**.

Until this baseline is fixed, the rest of the backlog (XP curve tuning,
tournaments, redemption catalog, etc.) is treating symptoms, not the
disease.

---

## 10. Open questions

These are decisions the strategy doesn't make for you:

1. **Real money or stay devnet?** This affects everything. Devnet play
   money makes engagement gamification-dependent (so XP / coins / badges
   matter more, not less). Real money makes loss aversion do most of the
   work but adds regulatory surface.
2. **Tournament integration**: do we keep tournaments as a separate
   product, or refactor them to feed parimutuel pools (e.g., bracket
   matches *are* parimutuel pools tagged into a tournament)?
3. **Squad pools v2**: do squads pool money together (shared deposit,
   shared payout) or stay individual? This is a product question — both
   are valid, and the answer changes which proposals make sense.
4. **Authority wallet split**: should subsidy-paying live on a separate
   wallet from the protocol authority? Easier monitoring + blast radius
   bound — already flagged in `PLAN-AUTO-PAYOUT.md`.

---

## File references (for whoever picks this up)

| File | Why |
|---|---|
| `programs/parimutuel_pools/src/instructions/deposit.rs` | Confirms B1/B2 need no contract change — authority can already deposit. |
| `programs/parimutuel_pools/src/instructions/claim.rs` | `fee_bps` is per-claim, so A2 (founder fee discount) is API-only. |
| `programs/parimutuel_pools/src/instructions/refund.rs` | Confirms the safety net A3 already exists. |
| `apps/api/src/scheduler/resolve-logic.ts:308–328` | Single-bettor and one-sided refund triggers. |
| `apps/api/src/utils/payout.ts:32–40` | Payout preview math + fee waiver rule. |
| `apps/api/src/utils/fees.ts:5–18` | Fee schedule by level. |
| `apps/api/src/utils/coins.ts` | UP Coins formulas, daily cap, diminishing returns. |
| `apps/api/src/services/rewards.ts` | XP / coin award entry points (A1, E1, G1, H2 hook here). |
| `apps/api/src/services/notifications.ts` | `createNotification` primitive (D2, H1, squad mate alerts). |
| `apps/api/src/services/referrals.ts:9–11` | Commission rate + referee bonus constants. |
| `apps/api/src/services/squads.ts` | Current squad mechanics (chat + leaderboard, no shared pool). |
| `apps/api/src/routes/faucet.ts` | Template for authority-signed USDC transfers (B3, C1, G3 cash tier). |
| `docs/REWARDS-XP-LEVELS.md` | Canonical economy spec — update when any new mechanic ships. |
| `apps/web/src/components/MarketCard.tsx:116–119` | Hardcoded 2.0x fallback when pool empty (fix for Rank 0). |
| `apps/web/src/components/BetForm.tsx:91–99` | Payout preview formula (cold-start tooltip lives here). |
| `apps/web/src/components/referral/ReferralShareLink.tsx:34` | "20% of platform fees" copy bug. |

---

## Appendix — methodology

This document is the synthesis of a 10-agent parallel analysis run on
2026-05-30. Agents were instructed to audit specific subsystems (XP,
payout math, empty-pool UX, tournaments, referrals, squads, faucet,
notifications), research how 6 competitor platforms solve cold-start
(Polymarket, Kalshi, Manifold, horse-racing tote, Augur/Gnosis, PredictIt /
Betfair), and brainstorm proposals constrained to UpDown's architecture
(no CLOB migration, authority wallet pays subsidies, prod is testing-only).

Findings, file references, and proposals were synthesized into this doc.
Numbers and citations are sourced from the codebase as of the date above —
re-verify before acting on any specific dollar amount or file location.
