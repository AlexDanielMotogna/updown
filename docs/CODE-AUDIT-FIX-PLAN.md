# Code Audit Fix Plan

Fixes prioritized by impact for hackathon demo day. Estimated total: ~2-3 hours.

---

## Phase 1: Violations (must fix) — ~1 hour

### V1. Empty catch blocks (38 occurrences, 22 files)

**Problem:** `.catch(() => {})` swallows errors silently. In production you never know why something failed.

**Fix:** Replace with minimal logging. Not every catch needs full error handling — some are intentionally best-effort (rewards, referrals). But they should at least log a warning.

**Pattern:**
```typescript
// Before
awardBetWin(wallet, amount).catch(() => {});

// After
awardBetWin(wallet, amount).catch(e => console.warn('[Rewards] awardBetWin failed:', e instanceof Error ? e.message : e));
```

**Files to touch (highest priority first):**
| File | Count | Why it matters |
|------|-------|---------------|
| `routes/claims.ts` | 2 | Failed rewards = users miss XP/coins |
| `routes/deposits.ts` | 1 | Failed bet placement reward |
| `scheduler/resolve-logic.ts` | 2 | Failed referral commissions = lost revenue |
| `scheduler/sports-scheduler.ts` | 4 | Failed pool creation cleanup |
| `scheduler/pool-creator.ts` | 3 | Failed pool deletion = orphaned data |
| `services/sports/livescore.ts` | 2 | Failed poll = no live scores |
| `services/sports/index.ts` | 3 | Failed adapter init |
| Other files (11) | 21 | Lower priority |

**Risk:** LOW — adding a console.warn never breaks anything.

### V2. Duplicated PM_CATEGORIES (polymarket-adapter.ts)

**Problem:** `PM_CATEGORIES` hardcoded in polymarket-adapter.ts duplicates what's in category-config.ts. Both define the same 4 categories with the same tags/volumes.

**Fix:** Remove the hardcoded `PM_CATEGORIES` array from polymarket-adapter.ts. The fallback already exists in category-config.ts.

**Files to touch:**
- `apps/api/src/services/sports/polymarket-adapter.ts` — remove `PM_CATEGORIES` export, use `getPolymarketCategories()`

**Risk:** LOW — category-config.ts has hardcoded fallback if DB fails.

### V3. Dead `packages/shared` package

**Problem:** Declared as workspace dependency, contains types and utils, but nothing imports from it. Judges will see a dead package.

**Fix:** Delete the directory and remove from `pnpm-workspace.yaml`.

**Files to touch:**
- Delete `packages/shared/`
- Edit `pnpm-workspace.yaml` — remove shared entry
- Edit root `package.json` if referenced

**Risk:** LOW — nothing imports it, removing is safe.

---

## Phase 2: Issues (should fix) — ~1 hour

### I1. Magic numbers without names

**Problem:** Time constants, fee divisors, and poll intervals hardcoded as raw numbers.

**Fix:** Create a constants file for backend and use existing `constants.ts` for frontend.

**New file: `apps/api/src/utils/constants.ts`**
```typescript
// Time
export const CRYPTO_POLL_INTERVAL_MS = 10_000;
export const SPORTS_POLL_INTERVAL_MS = 60_000;
export const PM_BUFFER_MS = 48 * 60 * 60 * 1000;
export const MATCH_DURATION_MS = 6 * 60 * 60 * 1000;
export const LIVESCORE_POLL_MS = 30_000;
export const CATEGORY_CACHE_TTL_MS = 60_000;

// Fees
export const FEE_BASIS_DIVISOR = 10_000n;

// Pools
export const POOL_OPEN_HOURS_BEFORE = 720;
export const MAX_PER_CATEGORY = 10;
```

**Files to touch:**
- `apps/api/src/utils/constants.ts` — NEW
- `apps/api/src/scheduler/sports-scheduler.ts` — use PM_BUFFER_MS, MATCH_DURATION_MS
- `apps/api/src/utils/payout.ts` — use FEE_BASIS_DIVISOR
- `apps/api/src/services/referrals.ts` — use FEE_BASIS_DIVISOR
- `apps/api/src/services/category-config.ts` — use CATEGORY_CACHE_TTL_MS
- `apps/api/src/services/sports/livescore.ts` — use LIVESCORE_POLL_MS
- `apps/web/src/app/page.tsx` — use named constants for refetchInterval

**Risk:** LOW — renaming numbers to constants.

### I2. Inconsistent logging prefixes

**Problem:** `faucet.ts` has no `[Faucet]` prefix. Some modules use different formats.

**Fix:** Add prefix to faucet.ts (3 lines). Quick.

**Files to touch:**
- `apps/api/src/routes/faucet.ts` — add `[Faucet]` prefix to 3 console statements

**Risk:** ZERO.

### I3. Remove basketball-adapter.ts skeleton

**Problem:** Empty skeleton with TODO. NBA already works via SportsDbAdapter.

**Fix:** Delete file, remove export/import from `services/sports/index.ts`.

**Files to touch:**
- Delete `apps/api/src/services/sports/basketball-adapter.ts`
- `apps/api/src/services/sports/index.ts` — remove BasketballAdapter import and registration

**Risk:** LOW — nothing uses it, NBA uses SportsDbAdapter.

---

## Phase 3: Quick wins (nice to have) — ~30 min

### Q1. Remove unused imports across codebase

Run `npx tsc --noEmit` and check for warnings. Clean up any unused imports the linter catches.

### Q2. Add `backgroundImage: 'none'` to remaining MUI Paper/Drawer components

The gradient overlay from MUI dark theme shows on some dropdowns/drawers. Already fixed in MarketFilter and MobileBottomNav. Check other Drawer/Dialog components.

### Q3. WebSocket subscription in match detail page

Currently `match/[id]/page.tsx` polls every 5s for bets+totals. Could subscribe to `pool:updated` WebSocket like MatchBetModal now does.

---

## Execution Order

| Step | Task | Time | Risk |
|------|------|------|------|
| 1 | Delete `packages/shared` (V3) | 5 min | LOW |
| 2 | Delete `basketball-adapter.ts` (I3) | 5 min | LOW |
| 3 | Remove `PM_CATEGORIES` from polymarket-adapter.ts (V2) | 10 min | LOW |
| 4 | Create `utils/constants.ts` + replace magic numbers (I1) | 20 min | LOW |
| 5 | Fix empty catch blocks — top 6 files (V1) | 30 min | LOW |
| 6 | Fix faucet logging prefix (I2) | 5 min | ZERO |
| 7 | Quick wins Q1-Q3 (optional) | 30 min | LOW |

**Total: ~1.5-2 hours**

All changes are LOW risk — no business logic changes, no UI changes, no DB changes. Pure code quality improvements.
