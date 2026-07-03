# UP Token — Launch Checklist (to TGE)

> Operational guide from today to TGE. Companion to `docs/TOKENOMICS-PRESALE.md`
> (numbers) and the public `/docs` page. NOT legal/financial advice — the legal
> and audit steps are hard gates, not optional. Order matters: later phases assume
> earlier ones are done.

**Owners legend:** 🧑‍⚖️ Legal · 🧑‍💼 Founders/Ops · 👨‍💻 Dev · 🔒 Security/Audit · 📣 Marketing

**Status legend:** `[ ]` todo · `[~]` in progress · `[x]` done

---

## Phase 0 — Foundation (do first; legal is a hard gate)
- [ ] 🧑‍⚖️ Engage a **crypto lawyer**. Decide token = utility vs security per target markets.
- [ ] 🧑‍⚖️ **Legal entity / Foundation** + jurisdiction (e.g. CH / BVI / Cayman / Panama).
- [ ] 🧑‍⚖️ **Legal opinion** (token classification) — required by curated launchpads and serious investors.
- [ ] 🧑‍⚖️ **Geo-restrictions** policy (block US / sanctioned) + **Terms of sale** + risk disclaimers.
- [ ] 🧑‍💼 Confirm **tokenomics** final (10B, 15% presale, buckets) — see `TOKENOMICS-PRESALE.md`.
- [ ] 👨‍💻 **UP utility spec** — see `docs/UP-UTILITY-SPEC.md`: emission (earn-by-using) + sinks (fee discount, staking, entries, boosts, governance) + buyback&burn, wired to the existing rewards/XP infra in `apps/api`. (Utility = credibility; do before pitching investors.)
- [ ] 🧑‍💼 **Litepaper / whitepaper** (tokenomics + utility + roadmap) from existing pitch content (`docs/pitch-deck-content.md`).
- [ ] 🧑‍💼 **Fundraise materials**: pitch deck, data room, cap table.

## Phase 1 — Token + custody
- [ ] 🧑‍💼 Set up **Squads multisig** (Solana) for treasury, mint authority, and sale proceeds. Define signers + threshold.
- [ ] 👨‍💻 **Deploy SPL token** (Token / Token-2022), fixed supply **10,000,000,000**.
- [ ] 👨‍💻 **Metaplex metadata**: name `UP Token`, symbol (e.g. `UP`), logo, description, links.
- [ ] 👨‍💻 **Mint** full supply to the multisig, then **revoke mint authority** (or hand to governance). Freeze authority off.
- [ ] 🔒 Verify on explorers (Solscan): supply fixed, authorities revoked, metadata correct.

## Phase 2 — Vesting & locks (Streamflow)
- [ ] 👨‍💻 Create **Streamflow** account; connect the multisig.
- [ ] 👨‍💻 Configure locks/vesting per bucket (immutable, on-chain):
  - [ ] Team — 6mo cliff + 24mo linear (1.5B)
  - [ ] Advisors — 3mo cliff + 18mo linear (500M)
  - [ ] Treasury — 12mo linear (600M)
  - [ ] Community — airdrop waves over 24mo (700M)
  - [ ] Presale Seed / Private / Public — per-round schedules (see tokenomics doc)
  - [ ] Liquidity — 100% at TGE (1.5B), LP locked separately
- [ ] 🔒 Public, verifiable lock links (team + liquidity) — the most credible "marketing".

## Phase 3 — Presale prep
- [ ] 🔒 **Audit** any funds-holding contract (custom sale and/or vesting) — Trail of Bits / OpenZeppelin / Spearbit. Publish the report.
- [ ] 🧑‍💼 **Choose launchpad path** for the PUBLIC round:
  - Curated IDO (Solanium / Solstarter) → reach + KYC + vetting (fees + maybe allocation), OR
  - Self-serve (PinkSale) → full control + auto LP lock (you drive traffic), OR
  - LBP (Fjord) → fair price discovery.
- [ ] 🧑‍⚖️ **KYC/AML provider** for buyers (launchpad-provided, or Synaps / Blockpass).
- [ ] 🧑‍💼 **Team KYC** with the chosen curated launchpad (if applicable).
- [ ] 🧑‍💼 Finalize **prices, caps, dates** per round (Seed $0.0024 / Private $0.0030 / Public $0.0040; caps in tokenomics doc). Confirm FDV $40M / ~$5M target with lawyer + market.
- [ ] 📣 **Marketing plan** + KOLs (Marketing bucket) timed to public round.
- [ ] 👨‍💻 **Claim portal** (Streamflow or launchpad) tested on devnet.

## Phase 4 — Seed & Private rounds (direct, no public launchpad)
- [ ] 🧑‍⚖️ **SAFT** (Simple Agreement for Future Tokens) per investor.
- [ ] 🧑‍💼 Collect funds to the **multisig** (USDC/SOL). Track allocations.
- [ ] 👨‍💻 Set up each investor's **Streamflow vesting** (Seed: 5% TGE, 3mo cliff, 12mo; Private: 8% TGE, 2mo cliff, 9mo).
- [ ] 🧑‍💼 Target: Seed ≈ $720k + Private ≈ $1.5M.

## Phase 5 — Public round
- [ ] 👨‍💻 Configure the sale on the chosen launchpad (tokens 700M, price $0.004, caps, whitelist/KYC gate).
- [ ] 📣 Announce + drive traffic (community + KOLs).
- [ ] 🧑‍💼 Run the sale; funds to multisig. Target ≈ $2.8M.
- [ ] 👨‍💻 Public buyers' vesting: 15% TGE, 1mo cliff, 6mo linear (via launchpad/Streamflow).

## Phase 6 — TGE (Token Generation Event)
- [ ] 👨‍💻 **Convert in-app UP Coins → UP Tokens** for users (snapshot + distribution logic).
- [ ] 👨‍💻 **DEX liquidity**: create Raydium/Orca pool (UP + raised USDC/SOL), seed at launch price, **lock the LP**.
- [ ] 👨‍💻 **Enable claims** (all rounds) per each vesting schedule.
- [ ] 👨‍💻 Release TGE unlocks only (rest stays locked in Streamflow).
- [ ] 📣 TGE announcement; submit for **CEX/aggregator listings** (CoinGecko / CMC).
- [ ] 🔒 Post-TGE monitoring: circulating supply, unlock calendar published (Tokenomist-style).

## Phase 7 — Post-TGE (utility live)
- [ ] 👨‍💻 **Staking** (Streamflow permissionless pool) — reduce circulating, reward holders.
- [ ] 👨‍💻 Ship **UP utility** in-app: fee discounts (trading + predictions), XP/rewards boost, governance.
- [ ] 🧑‍💼 Treasury / buyback&burn policy from platform fees.
- [ ] 🧑‍💼 Manage the **unlock calendar** (avoid big cliffs; linear releases as designed).

---

## Hard gates (do NOT skip / do NOT reorder)
1. **Legal (Phase 0)** before selling anything — a presale can be a security.
2. **Audit (Phase 3)** before any funds-holding contract goes live on mainnet.
3. **Revoke mint authority (Phase 1)** before public trust matters.
4. **Multisig custody** for all proceeds and authorities — never a personal wallet.

## What UpDown already has ✅
- Tokenomics + vesting defined (`/docs` page + `TOKENOMICS-PRESALE.md`).
- Website + docs (updown.my, `/docs`), socials (Twitter/Discord/Telegram).
- Pitch content (`docs/pitch-deck-content.md`), a live product (predictions + trading).
- Rewards/XP infra in `apps/api` to hang UP utility on.

## Still missing (the work) ❌
Legal entity + opinion, deployed SPL token, Streamflow config, Squads multisig,
audit, KYC provider, launchpad selection, DEX liquidity plan, marketing/KOL plan,
UP utility implementation.

Related: `docs/TOKENOMICS-PRESALE.md`, `apps/web/src/app/docs/page.tsx`,
`docs/REWARDS-XP-LEVELS.md`, `docs/TRADING-FEES-AND-XP.md`.
