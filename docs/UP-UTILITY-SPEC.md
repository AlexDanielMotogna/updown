# UP Token — Utility Spec (emission + sinks)

> IMPORTANT. Draft (2026-07-04). Defines WHAT the UP token is used for, so it has
> real demand and doesn't become an earn-and-dump token that bleeds to zero. This
> is the piece that makes the presale (`docs/TOKENOMICS-PRESALE.md`) and launch
> (`docs/LAUNCH-CHECKLIST.md`) credible. Not legal/financial advice.

## Core principle: faucet vs drain
A token that is only EARNED and never SPENT dies (Axie / StepN pattern): everyone
sells the moment they earn → constant sell pressure → price → 0.

```
Emission (earn-by-using)  ≤  Sinks (spend/burn)  +  Buyback (funded by real fees)
```

UpDown's edge over a pure P2E token: it has **real revenue** (trading + prediction
fees), so buyback & burn is funded by actual cash flow, not speculation. Emission
must be calibrated so it does NOT exceed sinks + buyback, or UP is inflationary.

---

## 1. Emission — earn-by-using (the faucet)
Source bucket: **Play-to-Earn 32% (3.2B)**. Users earn UP for real activity.

- **What earns UP:** placing/resolving predictions, trading volume, milestones,
  streaks, referrals, community milestones (Stone→Diamond), 20-bet reward, etc.
  (infra already exists in `apps/api` — `utils/testing.ts`, rewards, XP-on-resolution).
- **UP Coins → UP Token:** in-app UP Coins earned pre-TGE convert to UP Token at
  TGE (snapshot + distribution). Post-TGE, earning continues from the P2E bucket.
- **Anti-farming (already partly built):**
  - XP/rewards awarded at **resolution**, not placement (anti-farm, `awardBetResolution`).
  - Referral **anti-cheat** already in place.
  - Add: per-wallet/day emission caps, sybil checks, min-activity thresholds.
- **Emission rate is a KNOB:** define UP/day budget from the P2E bucket with a
  decay schedule (higher early for growth, tapering) so 3.2B lasts years, not months.

## 2. Sinks — why you HOLD / BUY / SPEND UP (the drains)
All hang off systems UpDown already has (fees by level, XP, tournaments, rewards).

1. **Fee discount / pay fees in UP** — current fees are level-based (5.00%→3.00%
   across L1→L40, see `/docs`). Let users **hold/stake UP to drop a fee tier**, or
   **pay trading/prediction fees in UP** at a discount. Direct demand + sink.
2. **Staking (Streamflow, permissionless)** — lock UP to:
   - boost **XP multiplier** (current 1.0x→2.0x by level) and/or **earn rate**,
   - unlock higher fee tier,
   - earn a share of protocol fees.
   Reduces circulating supply, rewards holding.
3. **Access / entries** — premium tournaments, special pools, higher-stake rooms
   entered by **paying UP** (burned or to treasury).
4. **Consumable boosts** — XP/reward multipliers, streak-savers, cosmetics that
   **burn UP** on use (hard sink).
5. **Governance** — vote on categories, params, new markets, emission rate.
6. **Buyback & burn** — protocol routes **X% of platform fees** (trading +
   predictions) to buy UP on the DEX and burn it. Demand independent of hype;
   funded by real revenue. This is the anti-death-spiral lever.

## 3. Balance & calibration (critical)
- **Target:** monthly emission (UP paid to users) ≤ monthly sinks (UP burned/spent)
  + monthly buyback (fees → UP burn). Publish these as on-chain metrics.
- **Presale protection:** free-earned UP competes with presale buyers ($0.004).
  Keep the **emission rate low enough** that daily earned UP doesn't flood the
  market and dump on presale investors. Tune emission WITH the vesting/unlock
  calendar (`TOKENOMICS-PRESALE.md`), not in isolation.
- **Levers to pull if UP inflates:** lower emission rate, raise sink prices,
  increase buyback %, add burn to more actions.

## 4. Integration points (codebase)
- `apps/api` rewards/XP infra: `utils/testing.ts` (reward config), XP-on-resolution
  (`awardBetResolution`), referral anti-cheat, community milestones.
- Fee tiers + XP multipliers: see `docs/REWARDS-XP-LEVELS.md`,
  `docs/TRADING-FEES-AND-XP.md`, and the LEVELS table in `apps/web/src/app/docs/page.tsx`.
- New work: UP balance/ledger, staking (Streamflow), fee-in-UP path, buyback bot
  (fees → DEX buy → burn), boost store, governance.

## 5. Open parameters (to decide)
- Emission: UP/day budget from P2E, decay curve, per-wallet daily cap.
- Fee discount: how much UP held/staked drops which tier; discount % if paying in UP.
- Staking: lock durations, boost curve, % of fees to stakers.
- Buyback: % of platform fees routed to buyback&burn.
- Which sinks burn vs go to treasury.

---
Related: `docs/TOKENOMICS-PRESALE.md`, `docs/LAUNCH-CHECKLIST.md` (Phase 0 utility
spec + Phase 7 utility live), `docs/REWARDS-XP-LEVELS.md`, `docs/TRADING-FEES-AND-XP.md`.
