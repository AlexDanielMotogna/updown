# Code Audit & Refactoring Plan

> Hackathon judging criteria: **Technical Execution** — Code quality, API integration, and overall development rigor.

## Project Stats

| Area | Files | LOC | Largest File |
|------|-------|-----|-------------|
| Web Components | 32 | ~9,400 | PoolTable.tsx (783) |
| Web Pages | 7 | ~2,600 | profile/page.tsx (1,042) |
| Web Hooks | 15 | ~1,400 | useTransactions.ts (290) |
| Web Lib | 8 | ~1,200 | technical-analysis.ts (399) |
| API Routes | 5 | ~1,800 | transactions.ts (989) |
| API Scheduler | 3 | ~1,050 | pool-scheduler.ts (955) |
| API Services | 1 | 339 | rewards.ts |
| Shared Package | 10 | 412 | (unused in practice) |

---

## PRIORITY 1 — Duplicated Constants (5 min per file)

The same constants are copy-pasted across 5+ files. This is the easiest win.

### What's duplicated

| Constant | Duplicated In | Should Live In |
|----------|--------------|----------------|
| `INTERVAL_LABELS` | page.tsx, PoolCard, PoolTable, LiveResultsSidebar, pool/[id]/page | `lib/constants.ts` |
| `INTERVAL_TAG_IMAGES` | PoolCard, PoolTable, LiveResultsSidebar, pool/[id]/page | `lib/constants.ts` |
| `ASSET_INTERVAL_BOX_IMAGE` | PoolTable, profile/page | `lib/constants.ts` |
| `ASSET_BOX_IMAGE` | PoolTable, profile/page | `lib/constants.ts` |
| `getBoxImage()` | PoolTable, profile/page | `lib/constants.ts` |

### Action

Add to `apps/web/src/lib/constants.ts`:

```ts
// Interval display
export const INTERVAL_LABELS: Record<string, string> = {
  '3m': 'Turbo 3m',
  '5m': 'Rapid 5m',
  '15m': 'Short 15m',
  '1h': 'Hourly',
};

export const INTERVAL_TAG_IMAGES: Record<string, string> = {
  '3m': '/assets/turbo-tag.png',
  '5m': '/assets/rapid-tag.png',
  '15m': '/assets/short-tag.png',
  '1h': '/assets/hourly-tag.png',
};

// Box art
export const ASSET_INTERVAL_BOX_IMAGE: Record<string, string> = { ... };
export const ASSET_BOX_IMAGE: Record<string, string> = { ... };
export function getBoxImage(asset: string, interval: string): string | undefined { ... }
```

Then replace all local definitions with imports. **~10 files to update.**

---

## PRIORITY 2 — Oversized Files (split into components)

### Target: No file over 300 lines.

### 2.1 `profile/page.tsx` — 1,042 lines (CRITICAL)

Split into:

| New File | Extracts | Est. Lines |
|----------|----------|-----------|
| `components/BetHistoryTable.tsx` | BetRow + table + pagination | ~300 |
| `components/ProfileHeader.tsx` | Avatar, level, stats cards | ~150 |
| `components/ClaimableSection.tsx` | Claimable bets list + claim all | ~150 |
| `app/profile/page.tsx` | Page shell, tabs, state | ~200 |

### 2.2 `transactions.ts` (API) — 989 lines (CRITICAL)

Split into:

| New File | Extracts | Est. Lines |
|----------|----------|-----------|
| `routes/deposits.ts` | /prepare-deposit, /confirm-deposit | ~250 |
| `routes/claims.ts` | /prepare-claim, /confirm-claim, /execute-claim | ~300 |
| `services/solana.ts` | getConnection, getUsdcMint, getAuthorityKeypair | ~80 |
| `utils/payout.ts` | Payout calculation (duplicated 3x currently) | ~30 |

### 2.3 `pool-scheduler.ts` — 955 lines (CRITICAL)

Split into:

| New File | Extracts | Est. Lines |
|----------|----------|-----------|
| `services/pool-lifecycle.ts` | activatePool, resolvePool, processResolutions | ~300 |
| `services/pool-refunds.ts` | refundBet, cleanupEmptyPools | ~150 |
| `scheduler/pool-scheduler.ts` | Cron scheduling, ensureJoiningPool | ~300 |

### 2.4 `PoolTable.tsx` — 783 lines

Split into:

| New File | Extracts | Est. Lines |
|----------|----------|-----------|
| `components/PoolRow.tsx` | PoolRow component (mobile + desktop) | ~400 |
| `components/PriceCell.tsx` | PriceCell with flash animation | ~60 |
| `components/PoolTable.tsx` | Table shell, header, AnimatePresence | ~100 |

### 2.5 `AiAnalyzerBot.tsx` — 755 lines

Split into:

| New File | Extracts | Est. Lines |
|----------|----------|-----------|
| `components/ai/SignalCard.tsx` | Signal card UI | ~100 |
| `components/ai/ChatMessage.tsx` | Message rendering | ~80 |
| `components/ai/AiAnalyzerBot.tsx` | Bot logic, state machine | ~300 |

### 2.6 `pool/[id]/page.tsx` — 656 lines

Split into:

| New File | Extracts | Est. Lines |
|----------|----------|-----------|
| `components/PoolArena.tsx` | UP/DOWN team selection, energy bar | ~250 |
| `components/PoolStatsStrip.tsx` | Stats strip (players, pool, odds) | ~50 |
| `app/pool/[id]/page.tsx` | Page shell, header, modals | ~200 |

### 2.7 `Header.tsx` — 496 lines

Split into:

| New File | Extracts | Est. Lines |
|----------|----------|-----------|
| `components/NotificationBell.tsx` | Bell icon + dropdown panel | ~200 |
| `components/Header.tsx` | Logo, nav, stats bar, wallet | ~200 |

### 2.8 Other files over 300 lines

| File | Lines | Action |
|------|-------|--------|
| `PriceChartDialog.tsx` | 546 | Extract chart rendering to `PriceChart.tsx` |
| `BetForm.tsx` | 539 | Extract amount presets, validation hook |
| `LeaderboardTable.tsx` | 437 | Extract `LeaderboardRow.tsx` |
| `TransactionModal.tsx` | 372 | OK after recent rewrite |
| `PoolCard.tsx` | 364 | Borderline — could extract countdown section |

---

## PRIORITY 3 — API Code Duplication

### 3.1 Payout calculation — duplicated 3 times

```
transactions.ts:580, transactions.ts:707, transactions.ts:844, bets.ts:225
```

Extract to `utils/payout.ts`:
```ts
export function calculatePayout(bet: Bet, pool: Pool, feeBps: number): { gross: bigint; fee: bigint; net: bigint }
```

### 3.2 Serialization functions — scattered across routes

| Function | Current Location | Move To |
|----------|-----------------|---------|
| `serializePool()` | routes/pools.ts:18 | `utils/serializers.ts` |
| `serializeBet()` | routes/bets.ts:18 | `utils/serializers.ts` |
| `serializeUserProfile()` | routes/users.ts:204 | `utils/serializers.ts` |

### 3.3 Solana config — duplicated in 2 files

`getConnection()`, `getAuthorityKeypair()`, USDC mint — duplicated in `transactions.ts` and `pool-scheduler.ts`.

Extract to `services/solana.ts`.

### 3.4 Pool/Bet validation — duplicated 4+ times

Pool existence check, bet existence check, status validation — repeated in every transaction route.

Extract to middleware or helper:
```ts
export async function getPoolOrThrow(poolId: string): Promise<Pool>
export async function getBetOrThrow(poolId: string, wallet: string): Promise<Bet>
```

---

## PRIORITY 4 — Unused Shared Package

`packages/shared` has types, schemas, and utils that are **declared as dependencies but not imported anywhere in app code**. The web app redefines everything locally.

### Action

Either:
- **Option A:** Start importing from `shared` (e.g., `import { INTERVAL_LABELS } from 'shared'`)
- **Option B:** Delete `packages/shared` and keep everything in `apps/web/src/lib`

**Recommendation:** Option A for types and constants. It shows proper monorepo architecture (good for hackathon judges).

---

## PRIORITY 5 — Hardcoded Config Values (API)

| Value | Location | Fix |
|-------|----------|-----|
| USDC mint address | transactions.ts, pool-scheduler.ts | Single env var |
| RPC URL defaults | transactions.ts (devnet), scheduler (localhost) | Consistent env var |
| CORS origins | index.ts, websocket/index.ts | Single env var |
| Compute budget | transactions.ts:883 | Named constants |
| Commitment level | 6 occurrences of `'confirmed'` | Named constant |
| Price decimals `1_000_000` | websocket/index.ts:123 | `USDC_DIVISOR` constant |

---

## PRIORITY 6 — Quick Wins

### 6.1 Remove dead code
- `packages/shared/src/utils/format.ts` has formatPrice that conflicts with `apps/web/src/lib/format.ts`
- 4 different `formatPrice` implementations exist across the codebase

### 6.2 Consistent error handling (API)
- 35+ `console.error()` with inconsistent prefixes
- Fire-and-forget `.catch(() => {})` on reward calls hides errors
- Replace with structured logger

### 6.3 TODOs in code
- `pool-scheduler.ts:364` — "TODO: Implement full Anchor program call"
- `pool-scheduler.ts:819` — Same TODO duplicated

---

## Execution Order

| Phase | Task | Impact | Effort |
|-------|------|--------|--------|
| 1 | Centralize duplicated constants | HIGH | 30 min |
| 2 | Split profile/page.tsx (1,042 lines) | HIGH | 1-2 hrs |
| 3 | Split transactions.ts + extract payout util | HIGH | 1-2 hrs |
| 4 | Split PoolTable.tsx | MEDIUM | 1 hr |
| 5 | Split pool-scheduler.ts | MEDIUM | 1-2 hrs |
| 6 | Extract serializers + Solana config | MEDIUM | 30 min |
| 7 | Split Header (extract NotificationBell) | LOW | 30 min |
| 8 | Split AiAnalyzerBot | LOW | 1 hr |
| 9 | Split pool/[id]/page.tsx | LOW | 1 hr |
| 10 | Hardcoded values to env/config | LOW | 30 min |

**Total estimated effort: ~8-12 hours**

---

## Architecture After Refactoring

```
apps/web/src/
  app/
    page.tsx                  (~200 lines)  -- was 396
    pool/[id]/page.tsx        (~200 lines)  -- was 656
    profile/page.tsx          (~200 lines)  -- was 1,042
  components/
    pool/
      PoolTable.tsx           (~100 lines)  -- was 783
      PoolRow.tsx             (~400 lines)
      PriceCell.tsx           (~60 lines)
      PoolArena.tsx           (~250 lines)
      PoolStatsStrip.tsx      (~50 lines)
    profile/
      BetHistoryTable.tsx     (~300 lines)
      ProfileHeader.tsx       (~150 lines)
      ClaimableSection.tsx    (~150 lines)
    ai/
      AiAnalyzerBot.tsx       (~300 lines)  -- was 755
      SignalCard.tsx           (~100 lines)
      ChatMessage.tsx          (~80 lines)
    NotificationBell.tsx      (~200 lines)
    Header.tsx                (~200 lines)  -- was 496
    ...rest (already fine)
  lib/
    constants.ts              (centralized constants)
    format.ts
    api.ts
    ...rest

apps/api/src/
  routes/
    deposits.ts               (~250 lines)  -- split from transactions.ts (989)
    claims.ts                 (~300 lines)
    pools.ts                  (~200 lines)
    bets.ts                   (~180 lines)
    users.ts                  (~200 lines)
  services/
    solana.ts                 (~80 lines)   -- new, extracted
    pool-lifecycle.ts         (~300 lines)  -- split from scheduler
    pool-refunds.ts           (~150 lines)
    rewards.ts                (~339 lines)
  scheduler/
    pool-scheduler.ts         (~300 lines)  -- was 955
    config.ts
  utils/
    payout.ts                 (~30 lines)   -- new, was duplicated 3x
    serializers.ts            (~150 lines)  -- new, was scattered
    coins.ts
    levels.ts
    fees.ts
```
