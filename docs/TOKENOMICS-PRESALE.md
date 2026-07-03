# UP Token — Tokenomics & Presale Plan

> Draft plan (2026-07-04). Numbers are a starting point, NOT financial or legal
> advice. Prices/rounds/vesting MUST be reviewed with a crypto lawyer before any
> sale (a presale can be a security depending on jurisdiction). This doc mirrors
> the public tokenomics on the app `/docs` page (`apps/web/src/app/docs/page.tsx`).

## Token
- **Name:** UP Token — native token of UpDown.
- **Chain:** Solana (SPL). (Trading side is on Arbitrum, but the token lives on Solana.)
- **Total supply:** 10,000,000,000 (10B), fixed. Mint authority revoked after mint (or governance-held).
- **In-app UP Coins** convert to UP Tokens at launch (TGE).

## Distribution (10B total)

| Bucket | % | Tokens | Vesting |
|---|---|---|---|
| Play-to-Earn | 32% | 3,200,000,000 | ongoing via gameplay |
| **Presale** | **15%** | **1,500,000,000** | per round (below) |
| Liquidity | 15% | 1,500,000,000 | 100% at TGE (Raydium/Orca) |
| Team | 15% | 1,500,000,000 | 6mo cliff + 24mo linear |
| Community | 7% | 700,000,000 | airdrop waves (24mo) |
| Treasury | 6% | 600,000,000 | 12mo linear |
| Marketing | 5% | 500,000,000 | per milestone (24mo) |
| Advisors | 5% | 500,000,000 | 3mo cliff + 18mo linear |
| **Total** | **100%** | **10,000,000,000** | |

Presale (15%) was carved from a mix: Play-to-Earn 40→32 (−8), Treasury 10→6 (−4),
Community 10→7 (−3). Team / Liquidity / Marketing / Advisors unchanged.

## Presale — rounds (1.5B tokens, target raise ≈ $5M)
Base (Public) price **$0.004/UP** → **FDV = $40M** ($0.004 × 10B). FDV is a
consequence of raising $5M by selling 15% at these discounts; a lower FDV would
require selling more tokens or raising less.

| Round | % supply | Tokens | Price | Discount | Raises | Vesting |
|---|---|---|---|---|---|---|
| Seed | 3% | 300,000,000 | $0.0024 | −40% | $720,000 | TGE 5% · 3mo cliff · 12mo linear |
| Private | 5% | 500,000,000 | $0.0030 | −25% | $1,500,000 | TGE 8% · 2mo cliff · 9mo linear |
| Public | 7% | 700,000,000 | $0.0040 | base | $2,800,000 | TGE 15% · 1mo cliff · 6mo linear |
| **Total** | **15%** | **1,500,000,000** | | | **$5,020,000** | |

- **Initial market cap** at TGE (liquidity + presale TGE unlocks) ≈ $6–7M.
- Earlier rounds = cheaper but longer lock (aligns strategic buyers); public =
  softest lock but still no day-1 dump (avoids the ~25% unlock-day drop).

### Per-wallet caps (anti-whale / sybil)
| Round | Min | Max/wallet | Access |
|---|---|---|---|
| Seed | $50,000 | negotiated | strategic / direct whitelist |
| Private | $2,500 | $50,000 | whitelist + KYC |
| Public | $100 | $5,000 | public (KYC per jurisdiction) |

## Execution — technical
- **Token:** standard SPL mint (Token / Token-2022). Not custom-coded.
- **Locks + vesting:** Streamflow (Solana-native, audited) — on-chain, immutable
  schedules for Team / Advisors / Treasury / Presale rounds. No custom vesting
  contract.
- **Presale:** audited launchpad or an audited sale contract (contribution logic,
  per-wallet caps, allocation tracking, post-TGE claim). NEVER an unaudited custom
  contract holding funds.
- **Custody:** multisig — **Squads** (Solana) for raised funds, mint authority,
  and treasury. Revoke mint authority after minting the fixed supply.
- **Liquidity:** pair a portion of the Liquidity bucket with raised stablecoins on
  Raydium/Orca at TGE; lock the LP.

## Execution — legal / security (do NOT skip)
- **Crypto lawyer BEFORE selling:** security classification, jurisdiction/entity
  (Foundation — CH/BVI/Cayman/Panama), terms, geo-restrictions (US/sanctioned),
  KYC/AML.
- **Audit:** any funds-holding contract (presale, custom vesting) audited by a
  reputable firm (Trail of Bits / OpenZeppelin / Spearbit) before mainnet.
- Public verifiable locks for team + liquidity = the most credible "marketing".

## Suggested sequence
1. Finalize tokenomics + UP utility (fee discount, staking, governance, XP boost).
2. Lawyer → structure + jurisdiction.
3. Create SPL token (fixed 10B).
4. Configure vesting/locks in Streamflow.
5. Presale contract/launchpad + audit.
6. Multisig (Squads) + revoke mint authority.
7. Run presale rounds (Seed → Private → Public).
8. TGE → DEX liquidity + claim portal.
9. Staking / utility live.

## Open decisions
- FDV/price confirmation with lawyer + market.
- Which launchpad (see separate discussion) vs custom audited sale.
- UP utility spec (integrate with existing rewards/XP infra in `apps/api`).
- Whether to bridge UP to Arbitrum later (start single-chain).

Related: `apps/web/src/app/docs/page.tsx` (public tokenomics), memory
`project_privy_onramps_funding` (funding/USDC), `docs/REWARDS-XP-LEVELS.md`.
