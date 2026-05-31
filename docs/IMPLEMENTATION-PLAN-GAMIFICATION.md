# Implementation Plan - Gamification, Status & Cold-Start

> Tactical follow-up to [STRATEGY-COLD-START-AND-XP.md](./STRATEGY-COLD-START-AND-XP.md).
> Merges the 10-agent codebase audit with the 8-problem product brief from the
> founder. Output is a single ranked list of features we actually ship, in
> what order, with file-level pointers and concrete eng cost.
>
> **Date**: 2026-05-30
> **Status**: ACTIONABLE PLAN - pending sequencing approval.

---

## 0. Foundation - the three loops we're building toward

Every feature in this plan reinforces one (or more) of these three loops.
If a feature doesn't feed a loop, we cut it.

### Core Loop (money + progression)
```
Bet → Earn XP → Level Up → Unlock Benefit → Bet More
```
The user's stake grows because progression makes higher stakes feel
purposeful, and benefits unlock that compound at each level.

### Reputation Loop (status + identity)
```
Predict correctly → Accuracy rises → Climb leaderboard
→ Gain reputation (BTC Expert, Top 1% Predictor)
→ Become recognised → Predict more
```
Money attracts; status retains. Without this loop, the platform is just a
casino.

### Referral / Social Loop (organic growth)
```
Invite friend → Friend trades → Earn XP + USDC commission → Level faster
→ Unlock benefit → Invite more friends
```
Acquisition cost approaches zero if the loop closes.

> **Reading guide**: the "8 problems" below come from the founder's brief.
> For each I write what the audit found, then the recommended
> implementation. Section 7 is the final ranked plan.

---

## 1. Problem #1 - Users Don't Know Their Payout

**Founder's idea**: don't display "$523 YES / $347 NO". Display
"YES 1.66x / NO 2.51x". Users instantly understand "if I'm right, I roughly
double my money."

**Audit finding**: the `BetForm` already computes the multiplier correctly
on bet input, but the **market card and the outcomes row both show
percentages**, not multiplier. The hero/featured card shows percentages too.
On an empty pool, `MarketCard` even falls back to a hardcoded `2.0x` /
`3.0x` that doesn't match the real `1.0x` the bet form computes
(`apps/web/src/components/MarketCard.tsx:116-119`).

**Recommendation**: ship dual display everywhere - keep the % bar visualisation
(it conveys "balance of opinion") and add the multiplier next to it as the
primary numeric. Strip the misleading 2.0x fallback.

**Multiplier formula** (matches existing on-chain payout):
```
multiplier = totalPool / sideTotal     // when sideTotal > 0
            = 1.00x                    // when sideTotal == 0 (cold-start)
```

**Where to ship**:
- `apps/web/src/components/MarketCard.tsx` - primary card.
- `apps/web/src/components/FeaturedHero.tsx` - outcomes panel.
- `apps/web/src/components/bet/SideSelector.tsx` - selection UI.
- `apps/web/src/app/match/[id]/page.tsx` - match detail.

**Cold-start handling**: when multiplier is 1.0x, swap the number for the
text "Be first - auto-refunded if alone" (the safety-net surfacing from
strategy-doc Rank 0). That's a feature, not an awkward edge case.

**Eng**: S (1-2 days, frontend only).
**Risk**: $0.
**Loop**: feeds Core Loop (lower the comprehension barrier).

---

## 2. Problem #2 - Scale XP With Stake Size

**Founder's idea**: bigger bets earn more XP. $1 → 1 XP, $10 → 12 XP,
$100 → 150 XP. Larger bettors level up faster.

**Audit finding**: today XP is **flat** at 100 per resolved bet
(`apps/api/src/services/rewards.ts:awardBetResolution`). Coins ARE
stake-scaled (0.10 UP per $1) but XP is not. The flat-XP rule was
introduced after the
[XP-farming bug](../MEMORY.md#xp-farming-placement) - moving XP from
deposit-time to resolution-time killed the dust-bet farm. Stake-scaling
opens a new attack surface unless we cap.

**The hedge-farm risk**: a user could bet $1000 UP + $1000 DOWN on the
same pool, accept the ~$100 in fees, and print ~3000 XP (vs the flat 200
they'd get today). Plus their loser-side bet still counts for participation
XP. Without a guardrail this is a clean farm.

**Recommendation**: ship stake-scaled XP **with a hard cap** so the curve
plateaus before farming becomes attractive. Two options:

**Option A - table-based (closer to founder's spec, simpler)**:
| Stake band (USDC) | XP per resolved bet |
|---|---|
| $0-$1 | 10 |
| $1-$10 | 30 |
| $10-$50 | 80 |
| $50-$200 | 150 |
| $200+ | 200 (cap) |

**Option B - square-root scaling (smooth, no cliffs)**:
```
xp = min(200, floor(100 * sqrt(stake / 10)))
// $1 → 32, $10 → 100, $100 → 200 (cap)
```

I'd ship **Option A** - easier to communicate ("the more you stake, the
more XP, up to 200"), and a flat tier table is easier to display in the
profile.

**Additional guardrails**:
- The daily-coin cap (50K base units = 500 UP) already protects coins.
  Add a parallel **daily XP soft-cap** (e.g. 1000 XP/day from bet
  resolutions) above which XP halves per remaining bet. Prevents whales
  hedging into infinity.
- Stake scaling only applies on **two-sided normal resolution** (same
  guard as today's bug fix).

**Where to ship**:
- `apps/api/src/services/rewards.ts` - replace flat `100` with table lookup.
- `apps/api/src/utils/coins.ts` - already does stake-scaled; mirror the
  function for XP.
- `docs/REWARDS-XP-LEVELS.md` - update spec.

**Eng**: S (API only).
**Risk**: $0 (virtual XP). Mitigated farm risk by cap + daily XP cap.
**Loop**: feeds Core Loop (larger stakes → faster progression).

---

## 3. Problem #3 - No Visible Status / Unlockables

**Founder's idea**: levels unlock visible perks, not just fee discounts:

| Level | Benefit |
|---|---|
| 5 | Profile Badge |
| 10 | Custom Avatar |
| 15 | Lower Fee |
| 20 | Access to Premium Markets |
| 30 | VIP Leaderboard |
| 40 | Founder Club |

**Audit finding**: today the only level perks are fee discount (5% → 3%)
and coin multiplier (1.0× → 2.0×). Both are economic, neither is visible.
There is no badge field on `User`, no avatar storage, no "premium" market
concept, no VIP leaderboard.

**Recommendation**: ship a layered unlock system that separates **status
(level)** from **possessions (UP Coins)**.

### Level-gated (free at threshold)
| Level | Unlock | Storage / scope |
|---|---|---|
| 2 | "Welcome" badge | `User.badges JSON` |
| 5 | Tier 1 profile badge ring (animated SVG) | CSS class on `UserLevelBadge` |
| 10 | Custom avatar upload (256×256, 200KB cap) | S3/Vercel Blob, `User.avatarUrl` |
| 15 | Fee discount tier 3 (existing) + flair | - |
| 20 | Premium pool entry (Lv20+ only) | `Pool.minLevel` field |
| 25 | Custom display name (vs wallet) | `User.displayName` (validated) |
| 30 | VIP leaderboard tab | New leaderboard filter |
| 40 | Founder's Club badge + special leaderboard pin | Permanent flag |

### Coin-purchased (UP Coins sink, from strategy-doc G3)
- Profile banner (cosmetic background): 100 UP
- Animated coin halo: 200 UP
- Tournament free entry: 50 UP
- $1 USDC redemption: 100 UP (treasury-funded, capped $50/day platform-wide)

These two systems should coexist. Levels give you the **right** to
upgrade; coins let you **buy** flair you didn't earn through level.

**Premium pools**: a `Pool.minLevel` field (default 0). Pools can be
admin-created with `minLevel: 20` for "high-stakes" pools. Could later
become user-tunable.

**Where to ship**:
- Schema: add `User.badges JSON`, `User.avatarUrl`, `User.displayName`,
  `Pool.minLevel`.
- `apps/api/src/services/rewards.ts` - grant level badges on `awardBetWin`
  level-up branch.
- `apps/api/src/routes/users.ts` - endpoints for avatar/display-name set.
- `apps/web/src/components/UserLevelBadge.tsx` - new tier-styled variants.
- `apps/web/src/components/profile/*` - badge gallery + avatar upload.
- `apps/web/src/components/MarketCard.tsx` - show "Lv20+ pool" chip if gated.

**Eng**: M (avatar upload is the heaviest piece). Badges + display name + 
pool gating are S each.
**Risk**: $0.
**Loop**: feeds Core Loop (status payoff) + Reputation Loop (visible
identity).

---

## 4. Problem #4 - Nobody Cares About Being Right (Reputation)

**Founder's idea**: per-category reputation. "BTC Expert", "Top 1%
Predictor", "ETH Master", "30-day Accuracy Champion", visible win rate.

**Audit finding**: today the user has `totalWins` / `totalBets` on
`User` but **no per-category breakdown**, no expert tags, no historical
accuracy windowing. Reputation as a concept doesn't exist in code.

This is the **biggest missing piece from my original strategy doc** - the
audit found social/squads were broken, but didn't propose reputation.
Founder's framing is sharper.

**Recommendation**: ship a per-category reputation system in three layers.

### Layer 1 - raw stats (foundation)
A denormalised `UserCategoryStat` table:
```prisma
model UserCategoryStat {
  walletAddress String
  category      String   // "CRYPTO:BTC", "CRYPTO:ETH", "SPORTS:CL", "PM:US-ELECTIONS", etc.
  totalBets     Int      @default(0)
  totalWins     Int      @default(0)
  totalWagered  BigInt   @default(0)
  netPnl        BigInt   @default(0)
  accuracy30d   Float?   // rolling 30d win rate
  lastUpdatedAt DateTime @updatedAt

  @@id([walletAddress, category])
  @@index([category, accuracy30d])  // for leaderboards per category
}
```
Updated on every bet resolution. Async job recomputes `accuracy30d` daily.

### Layer 2 - badges (issued automatically)
A `Badge` table + `UserBadge` join. Auto-issued by an evaluator job:

| Badge | Criterion | Tier |
|---|---|---|
| `category:BTC:expert` | ≥20 BTC bets, ≥60% accuracy, lifetime | Gold |
| `category:BTC:hot` | ≥10 BTC bets in last 30d, ≥70% accuracy | Silver |
| `top:1pct` | wallet in top 1% of `User.totalXp` | Platinum |
| `top:10pct` | top 10% of XP | Gold |
| `streak:30d` | 30-day participation streak | Silver |
| `pioneer:50` | First bettor on 50+ pools (lifetime) | Gold |
| `volume:10K` | $10K lifetime wagered | Gold |
| `accuracy:champion` | #1 in 30-day accuracy in any category | rotating, monthly |

Evaluator runs nightly + on every level-up event.

### Layer 3 - display
- Profile shows top 3 badges + per-category accuracy table.
- Market card / hero shows the bettor's badge tier next to recent bet
  events ("Alice the BTC Expert just bet $50 UP").
- Leaderboard gains category filters + accuracy sort.
- Squad leaderboard adopts the same display.

**Cold-start of the reputation system itself**: a user with 2 bets at
100% isn't an expert. Every badge has a **minimum sample size** before it
can be awarded (typically 10-20 bets). This is the most important detail
- it kills inflated reputation from luck.

**Where to ship**:
- Prisma schema: 3 new tables.
- `apps/api/src/services/reputation.ts` - NEW: stats updater + badge
  evaluator.
- `apps/api/src/scheduler/` - nightly evaluator job.
- `apps/api/src/routes/users.ts` - expose stats + badges in profile API.
- `apps/web/src/components/profile/` - badge gallery, accuracy chart.
- `apps/web/src/components/LeaderboardTable.tsx` - category filter +
  accuracy sort.

**Eng**: M-L (this is the biggest single feature in the plan). 1-1.5
weeks for layer 1+2, another 3-5 days for layer 3.
**Risk**: $0 (virtual badges).
**Loop**: drives the entire **Reputation Loop**. Without this layer the
loop doesn't exist. Highest strategic ROI in the plan.

---

## 5. Problem #5 - Small Pools / Community Liquidity

**Founder's idea**: pool boosts. When a pool hits a size milestone, all
participants retroactively earn bonus XP:
| Pool Size | Reward |
|---|---|
| $100 | +50 XP |
| $500 | +200 XP |
| $1,000 | +500 XP |

The community then actively grows pools (FOMO + retroactive bonus).

**Audit finding**: there's nothing like this today. My strategy doc had
B1 (house seed at pool creation) and E1 (early-bird at bet placement),
but neither rewards community-wide pool growth.

**Recommendation**: ship pool-boost milestones as a clean addition.
Compounds with house seeding (B1) and early-bird (E1) - three different
levers all pulling the same way.

### Mechanics
- Track `Pool.boostMilestoneReached` (0, 100, 500, 1000) - biggest
  threshold the pool ever passed (real volume, **excluding house seed**).
- On resolution, for every participant of a pool that hit milestone M,
  award the milestone XP bonus.
- Bonus applies to **both winners and losers** (this is community-wide,
  not winner-only). Encourages the loser to recommend the pool too.

### Numbers (suggested, tunable)
| Milestone (USDC, real bets only) | XP per participant |
|---|---|
| $100 | +50 XP |
| $500 | +200 XP |
| $1,000 | +500 XP |
| $5,000 | +1,500 XP |
| $10,000 | +5,000 XP |

The higher tiers exist for crypto rounds that occasionally explode in
volume - they make those pools legendary.

### Anti-farm
- Real-bet total excludes the house seed wallet (B1 tag).
- Each pool can only award each tier **once**. A pool that grew from
  $10 → $1000 awards $100 + $500 + $1000 tiers; a pool that stayed at
  $1100 awards same.

### Cold-start fit
Milestone hits are surfaced as in-app notifications **per category**:
"BTC round just crossed $1K - all bettors earn +500 XP". Real users see
the celebration and pile into the next round.

**Where to ship**:
- Prisma: `Pool.boostMilestoneReached BigInt @default(0)`.
- `apps/api/src/services/pool-resolver.ts` - on resolution, compute final
  real-bet total, award per-tier XP to each participant.
- `apps/api/src/services/notifications.ts` - broadcast milestone events
  to category subscribers.
- `apps/web/src/components/MarketCard.tsx` - milestone progress bar.

**Eng**: S-M.
**Risk**: $0.
**Loop**: Core Loop + Reputation Loop (community FOMO drives social
behavior).

---

## 6. Problem #6 - Daily Streaks

**Founder's idea**: login streaks. 3 days → 50 XP, 7 → 200 XP, 30 →
exclusive badge, 100 → legendary status.

**Audit finding**: today only **win streak** exists. Day streak doesn't.
The existing `User.currentStreak` field is win-based and resets on a
single loss - exactly the anti-pattern this proposal fixes.

This aligns with my strategy doc proposal G1 (participation streak).

**Recommendation**: split into two distinct counters:

### `User.winStreak` (existing, keep as-is)
- Increments on win.
- Resets on loss.
- Awards existing `winStreakBonus` XP.
- Used for "🔥 5 in a row" celebrations.

### `User.activeDayStreak` (NEW)
- Increments by 1 when user places a bet that resolves on a UTC day they
  weren't already counted for.
- Resets to 0 when user misses a UTC day.
- Awards milestone XP + UP coins + badges:

| Days | Reward |
|---|---|
| 3 | +50 XP |
| 7 | +200 XP, +50 UP coins |
| 14 | +500 XP, "Committed" badge |
| 30 | +1500 XP, "Loyal" badge |
| 60 | +5000 XP, +200 UP coins |
| 100 | "Legendary" badge (rare, permanent) |
| 365 | "Year of Predictions" badge (extremely rare) |

The active-day counter doesn't care about wins. The win counter doesn't
care about consecutive days. Losing a bet doesn't kill day streak.

**Surface**:
- Profile shows both streaks with separate visual treatment.
- Daily login (or any in-app action) shows "🔥 Day 7 - bet today to keep
  it alive" banner if streak is alive but no bet placed today.
- Streak break sends a notification + offer "comeback bonus" (strategy
  doc H2).

**Where to ship**:
- Prisma: `User.activeDayStreak Int @default(0)`,
  `User.lastActiveStreakDate DateTime?`.
- `apps/api/src/services/rewards.ts:awardBetResolution` - update streak
  before XP grant.
- `apps/api/src/services/notifications.ts` - milestone celebration +
  streak-at-risk reminder.
- `apps/web/src/components/profile/` - display.

**Eng**: S.
**Risk**: $0.
**Loop**: Core Loop (habit formation).

---

## 7. Problem #7 - Early Bird Bonuses

**Founder's idea**: first 10 participants get +25% XP, +50 coins, "Early
Predictor" badge.

**Audit finding**: my strategy doc had E1 (first 25% of deposit window).
Founder's version is sharper: **first N participants by count**, not by
time. More meaningful on small pools and easier to communicate.

**Recommendation**: combine both - the OR-trigger is more generous and
covers both fast-growing and slow-growing pools.

### Trigger
A bet is "early" if **either**:
- It is among the first 10 distinct wallets to deposit on the pool, OR
- It was placed in the first 25% of the deposit window.

### Rewards
- +25% XP on the bet's resolution.
- +50 UP coins immediately on deposit confirm (capped by daily UP cap).
- "Early Predictor" badge on the user's profile (one-time, repeating -
  one badge issued per pool you were early on, tracked as a count).

### Cold-start framing (the whole point)
This is the founder's framing of "**why be first**". Combined with the
strategy-doc Rank 0 (surface the refund safety net), the first-bettor
pitch becomes:
- **You** get +25% XP + 50 UP + a badge.
- **You** pay 0 fee at claim (founder's discount, see strategy doc A2).
- **You** can't lose: if no one matches, you're auto-refunded.

Three reinforcing wins versus the current single neutral "1.0x".

**Where to ship**:
- Prisma: persist `Bet.earlyOrder Int?` (1-10) and `Bet.earlyByTime Bool`.
- `apps/api/src/routes/deposits.ts:confirmDeposit` - set fields atomically.
- `apps/api/src/services/rewards.ts` - apply 25% multiplier on resolution.
- `apps/api/src/services/coins.ts` - grant 50 UP at deposit confirm.
- `apps/web/src/components/bet/PayoutPreview.tsx` - "First 10 only - claim
  your bonus" chip.

**Eng**: S-M.
**Risk**: $0 (virtual rewards, UP cap protects).
**Loop**: Core Loop + solves cold-start head-on.

---

## 8. Problem #8 - Losing Feels Terrible

**Founder's idea**: losers still get XP, coins, streak progression, and
reputation updates. Lost-but-rewarded experience.

**Audit finding**: today losers DO get 100 XP for participation, but they
get **zero UP coins** and the win streak resets on loss. Streak is
asymmetric - wins bank value, losses erase value-in-progress.

**Recommendation**: smooth the loss curve with three changes.

### 1. Losers earn a fraction of base coins
Today: only winners earn coins. Tomorrow: losers earn 25% of base coins
(same daily cap applies). Wins still earn full base + win bonus +
streak bonus - winners remain ahead by a wide margin.

Why 25%, not 50%: we want winning to feel meaningfully better.

### 2. Day-streak is participation-based (already covered in §6)
Losing doesn't break the day-streak. Only "not betting today" does.
This is the single most important psychological tweak.

### 3. Loss notification narrative
Today the loss toast is "Better Luck Next Time". Tomorrow:
> Lost $10 on BTC ↑
> +100 XP earned
> +12 UP coins earned
> 🔥 Day streak: 7 alive

Frames the same outcome as forward motion. Borrowed from mobile-game
loss-prevention design.

### 4. Reputation accuracy isn't punished excessively
Per-category accuracy tracks the last 30 days. A single loss in BTC
moves your win rate from 70% to ~68% - visible but not destructive.

**Where to ship**:
- `apps/api/src/services/rewards.ts:awardBetResolution` - branch for
  loser path that awards 25%-base coins.
- `apps/api/src/services/notifications.ts` - loss-toast copy + payload.
- `apps/web/src/components/NotificationToasts.tsx` - loss notification
  layout includes XP/coin/streak block.

**Eng**: S.
**Risk**: $0. Note: gives losers a small coin trickle, which could be
farmed - protected by the daily UP cap (already enforced).
**Loop**: Core Loop (habit retention through emotional smoothing).

---

## 9. Features from the strategy doc that stay in the plan

These aren't in the founder's 8 problems but the audit identified them as
critical. Keeping them in the merged plan.

| Code | Feature | Why it stays |
|---|---|---|
| Rank 0 | Surface refund safety net | Free win, reframes Problem #7. |
| B1 | House seeding bot ($0.50/side) | Visually solves "dead pool" feeling. Compounds with Problem #7 early-bird. |
| A2 | Founder's fee discount (0% fee for first bettor) | Combines with Problem #7 bonuses for triple incentive. |
| G3 | UP Coins redemption catalog | Mandatory spend sink (paired with Problem #3 cosmetic catalog). |
| D3 | Challenge link (viral cold-start fix) | Unique value: cold-start + acquisition in one click. |
| Squad notifications | Ping squadmates when one bets | Single biggest social fix; squad → squad-mate FOMO loop. |

---

## 10. The final shippable plan - 4 waves

Ordered by dependency and risk. Each wave is shippable on its own and
generates user-visible improvement.

### Wave 1 - surface + fix (1 week, zero risk)
*Goal: make the existing safety net + economy visible. Free wins.*

| Feature | Source | Eng |
|---|---|---|
| Display payouts as multipliers everywhere (Problem #1) | Founder | S |
| Surface auto-refund safety net (Rank 0) | Strategy | S |
| Strip MarketCard's 2.0x fallback (use 1.0x + safety-net copy) | Audit | XS |
| Fix referral copy "20% of fees" → "1% of every bet" | Audit | XS |
| Surface streak milestones in toasts (3/5/10) | Audit | S |
| Squad-mate bet notifications via existing WS | Strategy | S |
| Show "$100 daily bonus available" banner pre-bet | Audit | S |

**Total ~1 week**. Zero database / contract changes. Pure UX leverage.

### Wave 2 - economy foundation (3-4 weeks)
*Goal: scale XP with stake, stand up the spend sink, seed liquidity.*

| Feature | Source | Eng |
|---|---|---|
| Stake-scaled XP table + daily XP soft-cap (Problem #2) | Founder | S |
| House seeding bot ($0.50/side, capped) - B1 | Strategy | M |
| Founder's fee discount (first bettor pays 0) - A2 | Strategy | S |
| UP Coins redemption catalog v1 (USDC + tournament + cosmetic) - G3 | Strategy | M |
| Early-bird bonuses (first 10 OR first 25%) (Problem #7) | Merged | S-M |
| Loser coin trickle (25% of base) + participation day-streak (Problems #6, #8) | Founder | S |
| Persist faucet cooldown + claim log to DB | Audit | S |

**Total ~3-4 weeks**. The four economic levers (house seed, fee discount,
early bird, milestones) start compounding. Cold-start mostly solved.

### Wave 3 - reputation + status (4-6 weeks)
*Goal: stand up the Reputation Loop. The biggest single feature in this
plan.*

| Feature | Source | Eng |
|---|---|---|
| Per-category stats table (`UserCategoryStat`) | Founder Problem #4 | M |
| Auto-issued badges (BTC Expert, Top 1%, streak, pioneer) | Founder Problem #4 | M |
| Profile badge gallery + per-category accuracy chart | Founder Problem #4 | M |
| Leaderboard category filter + accuracy sort | Founder Problem #4 | S-M |
| Level-gated unlocks: badge → avatar → display name → VIP leaderboard (Problem #3) | Founder | M |
| Premium pool flag (`Pool.minLevel`) - for Lv20+ markets | Founder Problem #3 | S |
| Pool boost milestones ($100/$500/$1K/$5K/$10K → retro XP) (Problem #5) | Founder | S-M |
| Pool boost in-app notifications by category | Founder Problem #5 | S |

**Total ~4-6 weeks**. After this wave the platform feels like a community
with identity, not a casino with skins.

### Wave 4 - virality + retention (ongoing, parallel to Wave 3)
*Goal: drive acquisition via existing users and pull dormant users back.*

| Feature | Source | Eng |
|---|---|---|
| Challenge link - D3 (viral cold-start fix) | Strategy | M |
| Comeback bonus after 3+ days inactive - H2 | Strategy | S |
| Service worker + Web Push for category alerts - H1 | Strategy | M |
| Weekly quests / side missions - G2 | Strategy | M |
| Real squad shared pools (members co-deposit, shared payout) - D1 variant | Strategy + Founder | L |

**Total ~ongoing**. Wave 4 features can ship in parallel with Wave 3 as
capacity allows.

---

## 11. What we explicitly defer

These are good ideas that either (a) need a contract change, (b) depend
on real users, or (c) have unclear ROI today.

- **E2 pool extension** (extend `lock_time` if undersubscribed) - needs
  Anchor instruction change. Defer until metric "pools refunded due to
  undersubscription" justifies it.
- **Refund mechanism without fee** - needs Anchor change to `claim_winnings`
  to accept a "zero-fee refund" path. Reconsider when we have real users
  for whom 5% on refund is actual money lost.
- **Token-powered network** (the long-term vision) - regulatory and
  engineering surface is too large for this phase. Note as North Star.
- **Premium markets** as a paid feature - Lv20+ access is free initially.
  Paid access (e.g., subscription) is a later business decision.
- **Predictit-style position caps** - solves a different problem (whale
  forecasting bias). Worth revisiting only after volume justifies.

---

## 12. Open product decisions (we need answers before shipping)

1. **Devnet or mainnet target?** Wave 1-2 work fine on devnet. Wave 3+
   (reputation, status) acquires real meaning only with real-money stakes.
   Decision affects timing of mainnet migration.
2. **Stake-XP curve - table (Option A) or sqrt (Option B)?** Defaults to
   Option A in this plan. Confirm.
3. **Pool boost milestone amounts** - values in §5 are reasonable but not
   sacred. Want to tune?
4. **Avatar storage - S3, Vercel Blob, or IPFS?** Affects ops cost +
   migration story.
5. **Display name validation** - open text vs ENS-resolved vs whitelist?
   Profanity / impersonation risk if open text.
6. **Founder's Club at Lv40** - what does it actually grant beyond the
   badge? Optional invite to private Discord? Direct line to ops? This
   should be a product call.
7. **Reputation minimum sample size** - proposed 20 bets for category
   "Expert". Too high? Too low?

---

## 13. Eng cost summary

| Wave | Calendar weeks | Eng days (rough) | Risk |
|---|---:|---:|---|
| 1 - Surface + fix | 1 | ~5 | $0 |
| 2 - Economy foundation | 3-4 | ~15 | ~$3K/mo (B1 cap) + ~$1.5K/mo (G3 cap) |
| 3 - Reputation + status | 4-6 | ~25 | $0 (virtual) |
| 4 - Virality + retention | parallel | ~15 (can be split) | $0 (virtual) |
| **Total to "feature complete"** | **8-10 weeks** | **~60 days** | **~$5K/mo subsidy cap** |

For a sense of scale: Kalshi spends ~$5M/month on MM rebates alone. This
plan ships a full gamification + reputation system + cold-start fix for
**$5K/month max exposure**.

---

## 14. The North Star

Quoting the founder's brief verbatim because it should govern every
decision below:

> Money attracts users.
> Progression keeps users.
> Reputation creates loyalty.
> Community creates growth.

Every feature in this plan maps to one of those four sentences. If a
proposal can't be tagged with one of them, cut it.

Long-term shape of the platform:
```
Prediction Market → XP Economy → Reputation System
                                 → Community
                                 → Competitive Ecosystem
                                 → Token-Powered Network
```

We're shipping the first three rings of that diagram in the next ~10
weeks. The outer rings (community, token network) become viable once the
inner rings exist and have real users.

---

## 15. File reference (consolidated)

For whoever picks up implementation, the touch points across the
codebase:

**Schema (one Prisma migration covers all of Wave 2 + 3)**:
- `apps/api/prisma/schema.prisma`:
  - `User.activeDayStreak`, `User.lastActiveStreakDate`
  - `User.badges JSON`, `User.avatarUrl`, `User.displayName`
  - `Pool.minLevel`, `Pool.boostMilestoneReached`
  - `Bet.earlyOrder`, `Bet.earlyByTime`
  - New tables: `UserCategoryStat`, `Badge`, `UserBadge`, `FaucetClaim`,
    `RedemptionCatalog`, `Redemption`

**Backend**:
- `apps/api/src/services/rewards.ts` - stake-scaled XP, loser coins,
  participation streak, early-bird multiplier.
- `apps/api/src/services/reputation.ts` (NEW) - stats updater + badge
  evaluator.
- `apps/api/src/services/pool-resolver.ts` - boost milestones at resolution.
- `apps/api/src/services/notifications.ts` - squad-mate alerts, streak
  reminders, pool-boost celebrations, comeback notifications.
- `apps/api/src/scheduler/` - house-seeding job, nightly reputation
  evaluator, daily faucet log cleanup.
- `apps/api/src/routes/users.ts` - avatar / display-name endpoints,
  stats + badges endpoints.
- `apps/api/src/routes/deposits.ts:confirmDeposit` - early-bird flag,
  squad-mate notify, first-bettor flag for fee discount.
- `apps/api/src/routes/claims.ts` - apply 0-fee for first-bettor.
- `apps/api/src/routes/faucet.ts` - persist cooldown + log.
- `apps/api/src/routes/redemption.ts` (NEW) - UP coin catalog & redemption
  flow.

**Frontend**:
- `apps/web/src/components/MarketCard.tsx` - multiplier display, min-level
  chip, boost milestone bar, surface safety net for empty pools.
- `apps/web/src/components/FeaturedHero.tsx` - multiplier display.
- `apps/web/src/components/bet/SideSelector.tsx` - multiplier + early-bird
  chip.
- `apps/web/src/components/bet/PayoutPreview.tsx` - early-bird CTA + first-
  bettor zero-fee badge.
- `apps/web/src/components/NotificationToasts.tsx` - loss-notification
  rework.
- `apps/web/src/components/UserLevelBadge.tsx` - tier-styled variants.
- `apps/web/src/components/profile/*` - badge gallery, avatar upload,
  per-category accuracy chart, redemption shop, streak display.
- `apps/web/src/components/LeaderboardTable.tsx` - category filter +
  accuracy sort + VIP tab.
- `apps/web/src/components/referral/ReferralShareLink.tsx` - copy fix.

**Docs**:
- `docs/REWARDS-XP-LEVELS.md` - update spec after each wave.
- `docs/STRATEGY-COLD-START-AND-XP.md` - strategic context (do not modify
  in this plan; it's the immutable input).
- this doc - the executable plan.

---

## Sources & inputs

1. `docs/STRATEGY-COLD-START-AND-XP.md` (10-agent audit + competitor
   research + initial proposals).
2. Founder's 8-problem gamification brief (2026-05-30).
3. Codebase as of commit `08e6800` (audit basis).

Plan reviewed and approved by: _pending founder approval_.
