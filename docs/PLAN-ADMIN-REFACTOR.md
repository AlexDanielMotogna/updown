# Plan — Admin overhaul

**Status:** drafted 2026-06-01, **not implemented**. Synthesis of 15 parallel agent audits covering every admin tab + cross-cutting concerns. Work happens on branch `refactor/admin-overhaul`.

## TL;DR

The admin panel was built piecemeal. Each tab is functional but every author re-implemented confirmations, loading states, error states, status chips, action buttons, and tables. The audit found:

- **5 correctness bugs** that silently break production flows when an operator edits a category or tournament.
- **3 orphan endpoints**, **~20 unused interface fields**, and **~60 LOC per component** spent re-implementing the same 4 primitives.
- **6 different patterns** each for confirmation dialogs, loading spinners, error alerts, empty states, and refresh cadence.
- **Security gaps**: non-constant-time admin-key compare, no rate-limit on `/verify`, no failed-auth logging, raw Prisma errors echoed to the client.
- **A clear "good" reference** (`MatchExplorer.tsx`): two-pane explorer, server-enriched `inUse` lists, 1-click pre-filled forms, busy-locked dialogs. **PM admin should mirror this.**

- **Looks like a different product than the public app**. MUI defaults + dark tokens, no shared design language with the Kalshi/Polymarket-style market cards, MatchHeader, TransactionModal, or DeterminingCard we built recently. The admin should read as the same product.

Implementation is sequenced as 6 phases (with a 2b visual-alignment sub-phase). Each phase ships as one or more PRs.

---

## Phase 1 — Correctness + security bugs (DO FIRST)

Highest-impact fixes. Most are 1-line typos or small targeted patches with sweeping effect.

### Correctness

| # | File:line | Bug | Why it matters | Fix |
|---|---|---|---|---|
| 1 | `apps/web/src/app/admin/components/CategoryManagement.tsx:448,471` | Admin reads `cfg.theSportsDbLeagueId`, writes `config.theSportsDbLeagueId`, but every other consumer uses `externalLeagueId` | **Editing ANY football league silently breaks fixture sync** for it (getFootballConfigs filter at category-config.ts:149 drops it) | Read `cfg.externalLeagueId ?? cfg.theSportsDbLeagueId`; write `externalLeagueId`. One-shot migration consolidates legacy rows. Drop the dual-key tolerance in `sports-explorer.ts:78-80, 331-332` after the migration |
| 2 | `apps/web/src/app/admin/components/CategoryManagement.tsx:457-483` | `handleSave` rebuilds `config` from scratch, dropping every key the dialog doesn't know about (e.g. `matchDurationHours`) | Data loss bug; any field added later (or anything outside the dialog's awareness) is silently nuked on save | Spread `cat.config` first, then overlay typed fields: `const config = { ...(cat?.config ?? {}), ...typeSpecificPatch }` |
| 3 | `apps/web/src/app/admin/components/TournamentManagement.tsx:173` | Update payload sends `tournamentType: 'PREDICT_MATCHDAY'` (no consumer recognizes this value); should be `'SPORTS'` | After ANY edit-save, sports tournaments lose all sports treatment: scheduler skips them, list stops returning sideLabels, admin chips stop rendering | Change literal to `'SPORTS'` |
| 4 | `apps/web/src/app/admin/components/ManualActions.tsx:227-235` + `apps/api/src/routes/admin/actions.ts:241-247` | Create-Pool UI sends only `{asset, intervalKey}` (label); backend schema defaults `intervalSeconds` to 300. Selecting "3m" / "15m" / "1h" creates a 5-minute pool with mismatched label | Misleading on-chain state | Either map intervalKey → intervalSeconds in the schema (3m→180, 5m→300, 15m→900, 1h→3600), OR drop the dropdown entirely (admin shouldn't hand-roll crypto rounds) |
| 5 | `apps/api/src/routes/admin/sports-explorer.ts:261` | Dead ternary `cat.type === 'FOOTBALL_LEAGUE' ? cat.code : cat.code` — both branches identical, but the football branch was probably meant to return `'FOOTBALL'` | Logic bug masquerading as a no-op | Replace with `const sport = cat.type === 'FOOTBALL_LEAGUE' ? 'FOOTBALL' : cat.code` |
| 6 | `apps/api/src/routes/admin/tournaments.ts:145, 166, 310` | 4 multi-step mutations (delete, reset-round, resolve-matchday, assign-matchday) run as separate `await`s with no `prisma.$transaction` | Partial failure leaves orphan data — exactly the class that produced the orphan-pools incident (12,300+ orphans noted in memory) | Wrap each multi-step mutation in `prisma.$transaction([...])` or interactive `$transaction(async tx => ...)` |
| 7 | `apps/api/src/routes/admin/users.ts:49-72` | Search runs 6 DB queries per call; outer `bet.count(...)` results are thrown away (`.then(async () => …)` ignores the count), duplicate `findMany` for wins+losses, dead `side: { not: undefined }` filter | Per-search cost is 6× what it should be; `walletAddress` has no index so each is a full scan | One `$queryRaw` returning `{ totalWagered, totalPayout, wins, losses }` in one round-trip. Add `@@index([walletAddress])` and `@@index([walletAddress, createdAt])` on `Bet` |
| 8 | `apps/api/src/routes/admin/health.ts:48` | Dead ternary on `scheduler.getStatus().authority` (always truthy); calls `getStatus()` a second time (already aliased as `status`); twice-inline `await import('@solana/web3.js')` | Wasteful + smells | Top-level static import; just `connection.getBalance(new PublicKey(status.authority))` |
| 9 | `apps/api/src/routes/admin/health.ts:70` | `healthy` definition flags never-run jobs as unhealthy → cold-start fires "X jobs failing" banner spuriously | Misleading red alert every restart | Return `status: 'ok' \| 'error' \| 'pending'` from backend; UI excludes pending from `failingJobs` |
| 10 | `apps/api/src/routes/admin/categories.ts:18-39, 81-89` | POST/PUT accept arbitrary `req.body` (no allowlist, no zod); DELETE doesn't check for live pools (despite confirm dialog hint) | Security + data integrity | Zod-validate body; block DELETE when `Pool.league = code` returns count > 0 |

### Security

11. **Constant-time admin-key compare** — `apps/api/src/middleware/admin-auth.ts:10`. Replace `provided !== adminKey` with `crypto.timingSafeEqual` after length check.

12. **Rate-limit `/api/admin/verify`** — `express-rate-limit` at 5 attempts / 15 min per IP. Plus a global admin rate-limit of ~60 req/min.

13. **Log failed admin auth** — `{ ip, ua, path }` on every 401 (never the provided key).

14. **Header type guard** — `if (typeof req.headers['x-admin-key'] !== 'string') return 401`.

15. **401 auto-logout in `adminApi.ts`** — Centralize: any 401 clears sessionStorage, fires a "storage" event, force-redirects to login. Both `adminFetch` and `adminPostSSE`. Closes the "key rotated, every tab spins forever" failure mode.

16. **Re-verify cached key on `/admin` mount** — `page.tsx:25-29`. Replace presence check with `verifyKey(key)`; clear storage on failure.

17. **Categories error sanitization** — `apps/api/src/routes/admin/categories.ts:23,37,56,75,87` currently leak raw Prisma `err.message` to the client. Wrap behind a known error code; log raw server-side.

**Phase 1 deliverable:** a single PR per bug class. Estimated ~150-200 LOC across files. Each ships with a 1-line audit note + test.

---

## Phase 2 — Shared UI primitives module (FOUNDATION)

The UI-consistency agent counted **18 patterns** each tab re-implements differently. Extract them to `apps/web/src/app/admin/ui/` and adopt incrementally.

### Components (new files in `apps/web/src/app/admin/ui/`)

| Primitive | Replaces today | Props |
|---|---|---|
| `<ConfirmDialog>` | 4 different confirm patterns (red dialog, orange dialog, `window.confirm`, no confirmation) | `{ open, onClose, onConfirm, title?, actionLabel, consequences?, severity: 'warning'\|'destructive', confirmText?, loading? }` |
| `<AdminDialog>` | 3 dialog shells (different widths, headers, close affordances) | `{ open, onClose, title, icon?, maxWidth?: 'sm'\|'md'\|'lg', loading?, showClose?: boolean }`. Auto-blocks backdrop click + escape when `loading`. |
| `<LoadingState variant="block"\|"inline"\|"button" />` | Bare `<CircularProgress />` (4 variants) | Standardizes size + centering + py |
| `<EmptyState>` | 5 verbal templates ("No X — all caught up." / silent tbody / plain Typography / centered text / instructional card) | `{ icon?, title, hint?, action?, variant: 'success'\|'neutral' }` |
| `<ErrorState onRetry?>` + `<ErrorAlert>` | 6 patterns (silent, raw Typography, ephemeral Alert, sticky Alert, in-dialog Alert, raw-JSON Alert) | Standardized error display; JSON behind "Show details" expander |
| `useToast()` + `<ToastProvider>` | ~10 ad-hoc `result`/`feedback` `useState` Alerts | Global toast queue, 4s success / 8s error, auto-dismiss, stackable |
| `useMutationFeedback()` | `useMutation` wrappers with manual onSuccess/onError each time | Funnels every mutation into `useToast()` automatically |
| `<StatusChip status="ok"\|"pending"\|"warning"\|"error"\|"neutral"\|"info" />` | 2 separately-defined `StatusChip` components + a `statusChip()` function | Single source from `STATUS_PALETTE` theme token |
| `<ActionButton kind label icon? loading? />` | Inconsistent destructive colors (warning vs error), variants (text/outlined/contained), loading conventions | Standardized severity → color, variant rules, ellipsis loading suffix |
| `<RefreshButton onRefresh isFetching tooltipLabel? />` | 4 different refresh-button styles | Icon-only with Tooltip, consistent |
| `<TimeCell value mode="absolute"\|"relative"\|"datetime" />` + `formatTime()` util | 6 different timestamp renderers | Default to compact absolute for tables |
| `<IdCell value copyable? href? truncate? />` | Click-to-copy code duplicated in 3 components | Single primitive with consistent hover/copy UX |
| `<WalletCell address length=4 />` | 3 different abbreviations (8+4, 4+4, 6+4) | Lock to 4+4 monospace + copy |
| `<StatCard label value unit? color? trend? hint? />` | 3 incompatible versions (Finance, Payouts, Health) | Single component |
| `<SectionCard title subtitle? actions? accentColor? />` | Header + body re-implemented 10+ times | One shared shell |
| `<FilterBar value onChange placeholder debounceMs? activeChips? />` | 3 search patterns (instant local, instant remote, on-submit) | 300ms debounce when remote, instant local; removable chips for active filters |
| Typography atoms `<H1>`/`<H2>`/`<H3>`/`<Body>`/`<Meta>`/`<Label>` | 6 inconsistent uses of `subtitle1`/`subtitle2`/raw `<Typography sx={{ fontSize }}>` | Lock to 6-step scale via MUI theme override |
| Polling constants `POLL_FAST_MS = 15000`, `POLL_MEDIUM_MS = 60000`, `POLL_NONE` | 4 different intervals scattered across `refetchInterval` props | Tiered per-page-class |

### Shared constants

- `SPORT_COLORS` (already exists in `MatchExplorer.tsx`) → move to `ui/constants.ts`. Add `CATEGORY_TYPE_COLORS`, `STATUS_PALETTE`.
- `LAYOUT_TOKENS`: page `gap=3`, section `gap=2`, card `p=2.5` (multi-section) / `p=2` (single-purpose). Hard rule: max 2 levels of `<Card>` nesting.

### Patterns extracted from MatchExplorer (the good reference)

The Matches agent identified 10 patterns worth replicating across every list-style tab:
1. **Two-column sticky sidebar** (`320px sidebar + flex content`)
2. **Server-enriched `inUse` chip** (hides Add action when already wired)
3. **1-click pre-filled forms** (`suggestCode` + collision auto-bump + live validation)
4. **Inline "done" links** (when an action succeeds the cell becomes a deep-link with check icon)
5. **"Will be created with…" info Alert** explaining consequences before submit
6. **Color-coded chips driven by a single Record map**
7. **Empty-state copy names the next button** ("No matches. Try Refresh from SDB.")
8. **Modal dismissal locked during in-flight work** (`onClose={busy ? undefined : onClose}`)
9. **Tooltip on every non-obvious button**
10. **Cache-then-enrich endpoint pattern** (10-min in-memory cache, live `inUse` annotation)

**Phase 2 deliverable:** new `apps/web/src/app/admin/ui/` module. No tab adopts it yet; that's Phase 3. Estimated ~600 LOC new (most replacing ~1000 LOC across tabs).

---

## Phase 2b — Visual + UX adoption from the main app

Phase 2 standardises the *primitives* (one ConfirmDialog, one StatusChip, etc.). Phase 2b is about *how those primitives look and feel*. Today the admin reads as "MUI default with dark tokens"; the public app has a deliberate design language we already validated (TransactionModal redesign, MatchHeader, PlaceBetCard, Kalshi/Polymarket-style market cards, DeterminingCard, OutcomeCard). The admin should look like it belongs to the same product.

### Design reference checklist (extracted from main-app surfaces)

| Surface in public app | What to copy into admin |
|---|---|
| `TransactionModal` (`apps/web/src/components/TransactionModal.tsx`) | Header pattern: small title + close X + thin separator. No neon glow / shimmer. Status text under stepper. Footer with bg-tinted background separated by hairline. Single-purpose icons (MUI rounded). |
| `MatchHeader` + breadcrumbs | Color-coded section tile + breadcrumb crumbs at the top of every detail view (e.g. inside Pool detail dialog: `SPORTS · BSA · Vasco vs Atlético`). |
| `PlaceBetCard` + `MatchScoreRow` | Clean card with subtle 1px border, small radius (2 = 16px), `bg.surface` + `border.medium`. NO drop-shadows, no gradients beyond the subtle highlight on hover. |
| `DeterminingCard` / `OutcomeCard` (`ResolutionCards.tsx`) | Empty/awaiting/done states for admin tables — central icon + bold title + muted body. Reuse `EndedShell` pattern. |
| `MarketCard` (kalshi-style) | Compact information cards: header row (category chip + meta), title row, outcome rows, footer row. Status pills, not buttons. |
| `MarketFilter` sticky topbar | Sticky filter chips at top of long admin lists (Events, Pools, Users). |
| `txErrors.ts` friendly mapping | Map every backend error code to a human headline (already proven pattern). |
| `useThemeTokens()` + `darkTokens` palette | Replace remaining `dt.gain`/`dt.warning`/`dt.error` direct usage with semantic `t.success`/`t.warning`/`t.error`; never inline `#hex` or `rgba(...)` in components. |

### Concrete visual rules to apply

1. **No more neon / glow / shimmer / drop-shadow effects.** Some old admin cards still use them (e.g. red-tinted Danger Zone borders). The public app dropped them; admin matches.

2. **Subtle borders + transparent backgrounds** instead of heavy filled cards. `border: t.surfaceBorder` (rgba 0.28 alpha), `bgcolor: t.bg.surface`, `borderRadius: 2`.

3. **One radius scale**: 1 (chips, small pills), 1.5 (input fields), 2 (cards, dialog paper), full (avatars). No ad-hoc `borderRadius: 8`.

4. **One spacing scale** (MUI `theme.spacing(n)` = `n*8px`):
   - Inline icon gap: `0.5` (4px)
   - Inline button group: `1` (8px)
   - Field stack inside a card: `1.5` (12px)
   - Card internal sections: `2` (16px)
   - Card to card: `2` (16px)
   - Page sections: `3` (24px)

5. **Typography matches the main app** (already defined in `lib/theme.ts`):
   - Page title: `1.25rem` / 600
   - Section title (H2): `0.9rem` / 600 / uppercase letter-spaced (Kalshi-style)
   - Body: `0.85rem` / 400
   - Meta: `0.7rem` / 500 / `text.tertiary`
   - Label (chip-style): `0.62rem` / 700 / uppercase / `0.05em` letter-spacing

6. **Status semantics inherit from app `t.up`/`t.down`/`t.draw`/`t.gain`/`t.error`/`t.warning`/`t.info`** — same tokens used on PlaceBetCard so an "Active" status in admin matches "Joining" in public.

7. **Buttons use the app's defined hierarchy**, not MUI defaults:
   - **Primary action** (Create, Save): `t.gain` background, white text, no shadow.
   - **Secondary** (Cancel, Refresh): `t.hover.medium` background, `t.border.medium` border, `t.text.primary` text.
   - **Destructive** (Delete, Force Close): `t.error` background ONLY in the confirm dialog, never as a default-state row button. In the row, destructive is a `t.hover.medium` outlined button with the action behind a `<ConfirmDialog severity="destructive">`.
   - **Text/Tertiary**: bare `t.text.tertiary`, no chrome.

8. **Modal pattern follows the new TransactionModal** (committed `27be579`):
   - 1px border-medium, radius 2, `t.bg.surface` background
   - Header: `px: 2.5, py: 1.75`, title 0.95rem 600, close X right-aligned (disabled when loading)
   - Body: `px: 3, pt: 3, pb: 2`
   - Footer: `borderTop: t.border.subtle`, `bgcolor: t.bg.surfaceAlt`, action right-aligned
   - **No** `pt: '12px !important'` hacks (5 components currently have this — solve at the AdminDialog level)

9. **Friendly error mapping for admin too**. Port the `txErrors.ts` pattern to `adminErrors.ts`: map backend codes (`POOL_EXISTS`, `MATCH_NOT_CACHED`, `INVALID_SIDE`, Prisma `P2002`, RPC `429`) to human headlines + actionable hints + collapsible raw payload. The current pattern of raw `err.message` in red Typography reads amateurish.

10. **Empty states reuse `DeterminingCard`'s visual language**: muted central icon, bold title, body text, optional action button. Compare today's silent empty `<TableBody>` (EventLog, UserOverview top tables) to the public app's "Awaiting result" state — they should feel like the same product.

### UX patterns to apply tab-wide

Phase 3 tab refactors should each adopt these:

1. **Wizards for complex add flows.** Adding a new PM category today is "click + 14 fields visible at once". Replace with 3-step wizard: identity (code + label + sport) → config (tags / league ID with one-shot Verify button) → review (live `<CategoryCard>` preview + "Will be created with…" Alert). Same pattern for tournaments, knockouts, sports leagues. The `AddCategoryDialog` in MatchExplorer is already half this — promote to full pattern.

2. **Live preview wherever the operator edits visible-to-user data.** Editing a category? Render a `<CategoryCard>` preview reflecting current form state. Editing a tournament? Render a small bracket diagram. Editing a category color? Show the chip live. The TransactionModal preview pattern works because the user sees what they're getting.

3. **Search/filter on every list with >10 rows.** EventLog, UserOverview, PoolManagement, TournamentManagement, CategoryManagement — all currently miss this. Use `<FilterBar>` (Phase 2) with the main app's `MarketFilter` sticky-topbar UX pattern.

4. **Inline "next-action" hints in empty states.** Pattern from MatchExplorer: `No upcoming matches cached for this league. Try "Refresh from SDB".` The empty state names the button. Apply to every table.

5. **Drilldowns instead of dialogs for "view detail" actions.** Today a Pool detail dialog overlays the page. Replace with a side-panel push (320px slide-in from the right) so the operator keeps the list context. Tournament participants, user bets, event payloads — same treatment.

6. **Keyboard shortcuts (low-cost, high-leverage).**
   - `Esc` closes every dialog (already works for most).
   - `Enter` submits forms when valid (not all do).
   - `/` focuses the search field on the current tab.
   - `Cmd/Ctrl + K` opens a global "go to pool by id / wallet" command palette (Phase 6 nice-to-have).

7. **Action-button affordances.**
   - Destructive: type-to-confirm gate on Delete (type the code/UUID first 4 chars).
   - Primary: only one bold "what-you-came-here-to-do" button per dialog.
   - Loading: `<Label>…` (single character ellipsis) as committed in MatchExplorer; no inline spinners except for full-page submit.

8. **Information hierarchy.** Each tab should answer 3 questions in this order: **What's wrong right now?** (alerts/banners at top), **What do I usually do here?** (top-level CTAs), **What's the data?** (table/list below). Most current tabs invert this — the table appears first and you scroll to find the alert.

9. **Reduce visible options per screen.** The Categories edit dialog shows 15+ fields all at once; the Tournaments row shows 4 facts crammed into one caption line. Group by purpose, hide advanced behind `<Accordion>` or "Advanced" toggle, default to the 80%-case fields visible.

10. **Reasonable defaults everywhere.** AddCategoryDialog in MatchExplorer auto-suggests the code, picks the type, suggests the adapter — operator types nothing. Same energy to the rest: PM category "Crypto" should auto-suggest `minVolume24h=5000`, `maxMarkets=50`, `maxSubmarketsPerEvent=1`; new tournament should default to "predict-the-matchday" sports with the next BSA matchday pre-selected.

### "User-friendly" deliverables per tab

These are explicit Phase 3 acceptance criteria, layered on top of the per-tab work already listed:

- **Health**: positive "All systems nominal" banner when everything is green; cryptic metric labels get tooltips with one-line plain-English explanations.
- **Pools**: side-panel detail view; bulk operations on stuck pools (select rows + bulk resolve/refund); confirmation dialogs name the consequences ("This refunds 7 bets totalling $312 on-chain").
- **Payouts**: per-row error reason as primary column (today buried in tooltip); bulk retry with checkboxes; "view tx on Solscan" link on every successful claim.
- **Finance**: date-range picker is the top control (not buried); "vs last period" delta on every headline number; CSV export button on closures.
- **Users**: search-as-you-type with debounce; recent activity timeline next to the profile card; ban / flag / note actions with one-click confirm; copy-wallet button everywhere wallets appear.
- **Events**: live-tail with pause toggle; deep-linkable filters (URL state); payload expandable inline with syntax highlighting; "events for pool X in the last 24h" preset chip.
- **Actions**: 3-section split (Stuck markets / Recovery & sync / Crypto emergency); destructive actions behind type-to-confirm; success toast (not persistent JSON Alert).
- **Tournaments**: status filter chips at the top; bracket viewer for COMPLETED; participant drilldown; one-click distribute prize when bracket resolves.
- **Categories**: 3 dedicated "+ Add" entry points (PM / Sport / Football league), each opens a wizard; live preview card; per-category "Sync this" + "View on site" actions; drag-to-reorder.
- **Matches**: already the reference. Phase 3 work is extracting reusable parts.
- **Predictions** (new tab, Phase 4): mirror Matches UX exactly.

### Style guide

To make Phase 3 PRs reviewable, ship a `docs/ADMIN-STYLE-GUIDE.md` alongside the Phase 2/2b modules. One page: typography scale, spacing scale, color tokens, button hierarchy, dialog pattern, table column conventions, empty/loading/error state templates. Then "is this PR consistent with the style guide?" becomes a checklist reviewer can apply.

**Phase 2b deliverable:** updated `ui/` primitives styled per the rules above + `docs/ADMIN-STYLE-GUIDE.md`. No new tabs adopt yet (that's Phase 3). Estimated ~150 LOC additions to Phase 2's primitives + the style guide doc.

---

## Phase 3 — Per-tab refactor (parallelizable)

Each tab adopts the Phase 2 primitives + addresses its medium-priority issues. Ordered by inconsistency footprint (worst first per the UI-consistency agent):

### 3.1 — Tournaments (892 LOC, biggest single source of divergence)

- Adopt `AdminDialog`, `ConfirmDialog`, `useToast`, `StatusChip`, `TimeCell`, `WalletCell`.
- Delete 3 orphan endpoints: `GET /sports`, `POST /update-schedule`, `POST /assign-match`.
- Drop unused `getAdapter`, `getSideLabels` imports.
- Add `prisma.$transaction` to delete/reset-round/resolve-matchday/assign-matchday (also part of Phase 1 #6).
- Validate `size ∈ {2,4,8,16,32,64}` on create + update.
- Reject blank inputs in resolve-matchday (currently silently becomes 0-0 DRAW).
- Move bracket / needsResolution / round-progress derivation server-side (new `GET /admin/tournaments/:id/bracket`).
- Replace raw `fetch` at `TournamentManagement.tsx:209` with `adminFetch`.
- Add status filter chips + participant drill-down + bracket viewer + payout/retry button for COMPLETED tournaments.

### 3.2 — Categories (728 LOC, user explicitly flagged this dialog as not user-friendly)

- Adopt `ConfirmDialog` (replace `window.confirm` at line 708 with themed dialog showing pool count).
- **Split `EditDialog` into per-type editors**: `PmCategoryEditor`, `SportsDbCategoryEditor`, `FootballLeagueCategoryEditor`, sharing a `CommonFields` sub-form.
- Replace the type dropdown with 3 dedicated "+ Add" buttons → wizard per type.
- Add zod schemas per type for both UI validation and `POST/PUT /categories` backend validation.
- Add live preview using `<CategoryCard>` inside the dialog (reflects color/badge/icon/label).
- Add "Verify" buttons next to SDB league ID and PM tag inputs (one-shot upstream lookup).
- Remove hardcoded SDB sport fallback at line 362 (duplicates `config.ts:236`).
- Add search bar + type filter + drag-to-reorder + per-card "Sync this" / "View on site" actions.
- Surface `enabled`/`comingSoon` semantics inline ("Coming Soon = visible-but-disabled in public feed").

### 3.3 — Pools (210 LOC, highest-risk missing confirmations)

- Adopt `ConfirmDialog` for Resolve/Refund (currently no confirmation on irreversible on-chain actions).
- Adopt `useToast` for success/error feedback.
- Add pagination UI (`page`/`limit` controls) + show `meta.total`.
- Add free-text search bound to `asset`/`poolId` with debounce.
- Add `take` limits to `/pools/stuck` and `priceSnapshots`.
- Verify `(status, endTime)` compound index exists.
- Show sports-specific columns (homeTeam vs awayTeam, matchId) instead of generic interval for non-CRYPTO pools.
- Add sortable column headers + `closePool` row action.
- Invalidate `admin-pool-detail` on mutation success.

### 3.4 — Payouts (356 LOC)

- Surface `lastError` on the Failed table (denormalize on Bet, or join latest EventLog payload). Triage is blind without this.
- Implement bulk retry (checkboxes + "Retry selected" / "Retry all").
- Per-row pending state (replace global `retryMut.isPending` lock).
- Add transaction-signature visibility for recent successful payouts.
- Handle `req.on('close')` in migration SSE.
- Cache `/wallet/balance` for ~10s.
- Cap admin-triggered retry attempts.
- Wrap retry flag-reset + EventLog write in `$transaction`.

### 3.5 — Finance (219 LOC)

- Add **date-range filter** (`?range=today|7d|30d|all`) — explicit user pain point.
- Add prior-period comparison ("+12% vs last 7d").
- Add CSV export on closures.
- Move fee aggregation into SQL (or persist `feeAmount` on Bet at claim time). Eliminate the unbounded `findMany` at line 25.
- Cache `/overview` for 30-60s. Cache RPC `getTokenAccountBalance` (shared-authority pressure).
- Exclude CANCELLED-pool bets from `totalVolume`.
- Split "Net Revenue" into "Realized" vs "Outstanding liability".
- Drop unused imports (`calculatePayout`, `getFeeBps`).
- Drop unused interface fields (`authorityUsdcBalance`, `totalRentReclaimedLamports`).
- Fix hardcoded `?cluster=devnet` (line 189) to read from env.

### 3.6 — Users (316 LOC)

- Add `@@index([walletAddress])` + `@@index([walletAddress, createdAt])` on Bet (also Phase 1 #7).
- Rewrite the search aggregates as one `$queryRaw` (also Phase 1 #7).
- Add moderation columns: `banned`, `flagged`, `adminNotes` + audit table `AdminAction`. Surface ban/unban/flag/note buttons in the profile card.
- Adopt `WalletCell` (replaces 3 inconsistent abbreviations).
- Add paginated "All Users" browse + filters (banned, flagged, active-in-7d, search).
- Drop unread profile fields (`coinsLifetime`, `feeBps`).
- Cache `/users/overview` and `/users/top` for 60s.

### 3.7 — Events (audit trail must be reliable)

- **Remove `eventLog.deleteMany` calls** in `pool-resolver.ts:148`, `pool-creator.ts:99`, `admin-actions.ts:116`, `squad-pools.ts:413` — they destroy audit history for pools that get recreated. Append-only is non-negotiable for an audit log.
- Add retention/archival (90-day delete OR partition + cold storage).
- Add indexes: `(createdAt)`, `(eventType, createdAt)`, `(entityType, entityId, createdAt)`. Optional `GIN` on `payload`.
- Switch to keyset pagination `(createdAt, id)` cursor.
- Add multi-select event types (driven by shared TS enum), createdAt range picker (default last 24h), entityId filter, payload free-text search.
- Standardize `entityType` taxonomy (merge `system`/`admin`; move `closure` under `pool`).
- Expandable row / "View payload" dialog. Clickable entityId → deep-link to Pool/User tab.
- Color coding by severity.
- CSV/NDJSON export.

### 3.8 — Actions

- Split into 3 sticky sections: "Stuck markets" (PM + knockouts), "Recovery & sync" (orphan + restart + sync-pools), "Crypto pool emergency" (resolve/refund/close).
- Move sync-pools from Categories tab to here.
- Drop red borders on non-destructive cards.
- Replace `JSON.stringify(data)` result Alert with typed banner reading `data.message`.
- Add success toasts to StuckPmPools / StuckKnockoutPools.
- Wire the `force` flag of close-pool into the UI (currently only reachable via curl).
- Replace ad-hoc `syncPoolsRunning` + `recoveryAbort` with a named-action lock pattern (`actionLocks: Map<string, AbortController>`). Return 409 on duplicate.

### 3.9 — Health

- Adopt `LoadingState` skeletons (replace bare `<CircularProgress />` that blocks the whole tab).
- Add manual `<RefreshButton>` + "last updated Xs ago" badge + retry button on error.
- Use `placeholderData: keepPreviousData` to stop the LivescoreHealth null-flash.
- Remove dead `creditsPct` and hardcoded `/ 1000`, `< 200` magic numbers.
- Send `status: 'ok'\|'error'\|'pending'` from backend (also Phase 1 #9).
- Render `rpcEndpoints` from the backend response or drop it.
- Add Tooltip + copy button to the long authority pubkey.
- Stop using array-index as React key in the incident list.

### 3.10 — Matches (already the reference; small cleanup)

- Drop dead `SPORT_TO_QUERY` map (every value equals its key).
- Fix dead `cat.code : cat.code` ternary (also Phase 1 #5).
- Replace silent `catch {}` in `refresh-league` (line 212) with `console.warn`.
- Guard `updateMany` on `pool.matchId` (line 522).
- Extract `BrowseSdbModal` + `AddCategoryDialog` + `SPORT_COLORS` + `statusChip` + `relTime` into `ui/` module so Phase 4 (PM Explorer) can import them.
- Server-compute the `AddCategory` defaults (`adapterKey`, `numSides`, `sideLabels`, `type`) and ship them as `defaults` in the `/sdb-leagues` payload.

**Phase 3 deliverable:** 10 small PRs (one per tab). Each adopts Phase 2 primitives and fixes its medium-priority issues. Tabs are independent; parallelizable.

---

## Phase 4 — PM Explorer (new feature mirroring Matches)

The PM-parity agent confirmed: every feature MatchExplorer has, PM admin lacks. New "Predictions" tab mirroring the proven UX.

### Backend — new file `apps/api/src/routes/admin/polymarket-explorer.ts`

| Endpoint | Purpose |
|---|---|
| `GET /admin/polymarket/categories` | List PM categories with `tagIds`, `poolCount`, `cachedMarketCount`, `lastBulkSyncAt`. Single round-trip. |
| `GET /admin/polymarket/tags` | Gamma `/tags` catalog (cached 10 min in-memory). Annotated with `inUse + categoryCode`. |
| `GET /admin/polymarket/events?tag=X&days=N` | Browse events for a tag. Each market annotated with `poolExists`. |
| `POST /admin/polymarket/refresh-category` | Force `syncCategory(code)` for one category. Bypasses 6h cron. |
| `POST /admin/polymarket/create-pool` | 1-click create from a market id. Refuses duplicates. Audit log. |
| `POST /admin/polymarket/resolve-market` | Admin-supplied UMA-stuck resolution (mirror of `resolve-knockout`). |
| `GET /admin/polymarket/markets?category=X` | Cached PM markets per category. |

### Backend prep

- Extract `syncCategory(code)` helper from `bulkSync` in `polymarket-sync.ts` — currently the per-tag loop is buried inside `bulkSync`. Refactor so it can run for one category.
- New `polymarket-tags.ts` helper (Gamma `/tags` fetch + 10-min cache).
- Add `lastBulkSyncAt` tracking (per-category, either on `PoolCategory.config` or a small log table).
- Add `ADMIN_CREATE_PM_POOL`, `ADMIN_RESOLVE_PM_POOL` event types.

### Frontend — new `apps/web/src/app/admin/components/PmExplorer.tsx`

- Mirrors MatchExplorer two-pane layout.
- Left rail: PM categories with chip color, tagIds count, pool/cache counts.
- Right pane: category header + Refresh button + Upcoming/Past toggle + table of cached markets.
- "Browse Gamma" button → `BrowseGammaTagsModal` (port of `BrowseSdbModal`).
- Per-tag drill-down → events browser → per-market `Create pool` button.
- `AddPmCategoryDialog` (port of `AddCategoryDialog`) with smart suggestion `PM_<TAG>`.

### Tab placement

- New "Predictions" tab between Matches and Categories.
- Move `StuckPmPools` to be a section inside the new tab (keeps "PM ops" colocated).
- Or keep StuckPmPools as separate tab — TBD per operator preference.

**Phase 4 deliverable:** new admin tab + ~6 backend endpoints + 3 frontend components. Estimated ~800-1000 LOC.

---

## Phase 5 — Dead code + endpoint normalization

Cleanup pass. Low risk, mostly diff-positive.

### Delete

- 3 orphan tournament endpoints: `GET /sports`, `POST /update-schedule`, `POST /assign-match` (already covered in 3.1).
- Unused imports: `finance.ts:6,7`, `tournaments.ts:9` (`getAdapter`, `getSideLabels`), `StuckKnockoutPools.tsx:6` (`Tooltip`).
- Unused interface fields (~15 across `FinancialOverview`, `PayoutManagement`, `SystemHealth`, `StuckKnockoutPools`, `MatchExplorer`, `UserOverview` — full list in dead-code agent report).
- Dead state: `creditsPct` in `SystemHealth.tsx:212`, empty `sx={{ }}` in `UserOverview.tsx:129`.
- API fields not consumed: `rpcEndpoints` in health overview, `priceSnapshots` + `claimTx` in `/pools/:id`, `cachedAt` in `/sdb-leagues`.

### Normalize

- **Error code vocabulary**: pick one — `INTERNAL_ERROR` (used by payouts/wallet) or `INTERNAL` (used by sports-explorer). Currently 7 vs 6 usages tree-wide. Same for `FETCH_ERROR` vs `INTERNAL_ERROR`.
- **Response envelope for action endpoints**: actions that mutate a pool should always return `data: serializePool(...)`. `close-pool`, `stop-recovery`, `sync-pools` currently omit `data`.
- **HTTP status codes**: `tournaments.ts` returns 400 even for clear 500 cases. Distinguish validation (400) from internal/storage failures (500).
- **Stop leaking Prisma `err.message`** to clients in `categories.ts:23,37,56,75,87`. Wrap in a known error code + log raw server-side (also Phase 1 #17).

**Phase 5 deliverable:** one cleanup PR per concern. Largely line-level. Estimated removal: ~700 LOC of duplicated UI primitives once Phase 2/3 are merged.

---

## Phase 6 — Polish (lowest priority)

Items the agents flagged that don't fit other phases:

- Add tooltips on cryptic metrics (Source Split context, fee tier explanation, etc.).
- Add date-range filters where missing (Finance, Events, Payouts stats).
- Apply mobile fallbacks: `<TableContainer overflowX>`, `fullScreen` dialogs on `xs`, responsive Livescore status row (`SystemHealth.tsx:220`).
- Environment badge in the admin header (LOCAL / DEV / PROD).
- Distinct "Server unreachable" vs "Invalid key" errors in `AdminLogin`.
- "Show key" toggle on login.
- Cross-tab session sync via `storage` event.
- (Bigger) Migrate auth from sessionStorage to httpOnly cookie session.

---

## Risks + open decisions

1. **Auth migration to cookie session** (Phase 1 #15-16 vs Phase 6 last bullet): the right long-term fix is httpOnly cookies + CSRF tokens, but it's a bigger change. Recommended interim: ship Phase 1 #15-16 (401 auto-logout + re-verify on mount) immediately. Cookie migration deferred to Phase 6.
2. **EventLog deletion (Phase 3.7)**: removing `eventLog.deleteMany` calls in 4 schedulers means the schedulers can no longer "wipe and recreate" a pool. Need to verify those callers actually need to delete logs (vs leaving them as historical record). Probable answer: don't delete, just create new logs.
3. **Tournament transactions (Phase 1 #6)**: interactive `prisma.$transaction` has a 5s default timeout. Some tournament resolve-matchday operations might need it bumped (`transactionOptions: { maxWait, timeout }`).
4. **PM categories vs Predictions tab placement**: keep StuckPmPools as standalone tab in Actions, or move into Predictions explorer? Defer to operator preference once Phase 4 prototype exists.
5. **Phase 2 primitives module location**: `apps/web/src/app/admin/ui/` is the natural home, but if the wider web app would benefit from `ConfirmDialog` / `StatusChip` / `useToast`, hoist to `apps/web/src/components/admin/` or even `apps/web/src/components/`. Decide before extracting.

## Suggested PR sequence

1. PR 1: Phase 1 correctness bugs #1, #2, #3, #4 (the 4 silent-data-corruption bugs)
2. PR 2: Phase 1 security #11-17
3. PR 3: Phase 1 remaining bugs (#5-10) + DB index migrations
4. PR 4: Phase 2 primitives module (`ui/`) — bare primitives
5. PR 5: Phase 2b visual styling on the primitives + `docs/ADMIN-STYLE-GUIDE.md`
6. PRs 6-15: Phase 3 per-tab refactors (10 PRs, one per tab, parallelizable after PR 5)
7. PR 16: Phase 4 PM Explorer backend
8. PR 17: Phase 4 PM Explorer frontend
9. PR 18: Phase 5 cleanup + endpoint normalization
10. PR 19: Phase 6 polish (or split further)

## Files affected (high level)

**Backend** (`apps/api/src/`):
- `routes/admin/*.ts` (all 10 files)
- `routes/admin/polymarket-explorer.ts` (NEW)
- `middleware/admin-auth.ts`
- `scheduler/polymarket-sync.ts` (extract `syncCategory`)
- `scheduler/pool-resolver.ts`, `scheduler/pool-creator.ts`, `scheduler/admin-actions.ts`, `services/squad-pools.ts` (remove eventLog.deleteMany)
- `prisma/schema.prisma` (Bet indexes, optional User moderation columns, EventLog indexes)

**Frontend** (`apps/web/src/app/admin/`):
- `ui/` (NEW — primitives module)
- All 13 components in `components/`
- `lib/adminApi.ts` (401 handling)
- `page.tsx` (re-verify on mount)
- `components/AdminLogin.tsx`
- `components/PmExplorer.tsx`, `BrowseGammaTagsModal.tsx`, `AddPmCategoryDialog.tsx` (NEW)

## Out of scope

- Mainnet launch concerns (rotating ADMIN_API_KEY, full security hardening) — addressed when prod goes live.
- Mobile parity (admin is desktop-first; only add minimum responsive protections).
- Cron job UI (admin shouldn't be hand-rolling crypto rounds via Create Pool — recommend dropping that card entirely).
- Tournament payout/distribute UI — depends on `feature/auto-payout` branch landing on main first.
