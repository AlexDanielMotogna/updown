# Plan: Full admin authority over Polymarket pools

Goal: give the admin panel complete control over Polymarket (PM) topics & pools,
remove hardcoded config, and base subcategory "source tags" on Polymarket's real
tag taxonomy instead of a hand-written list.

## Does this affect pool RESOLUTION? No.

PM pool resolution depends only on:
- `matchId` - the Polymarket market id (never modified by any phase here).
- `PolymarketAdapter.fetchMatchResult(matchId)` - queries Gamma `/markets?id=...`,
  checks `closed && umaResolutionStatus === 'resolved'`, decides the winner from
  `outcomePrices`.
- `getAdapterForLeague(pool.league)` - every PM category code starts with `PM_`,
  so it always returns the POLYMARKET adapter.

These phases only change **which events get imported** (caps/tags),
**categorization/filtering** (`league`/`subcategory`, both stay `PM_*`), and admin
config. The resolution key (`matchId`) and the resolver logic are untouched.
(The earlier Politics→Geo re-categorization likewise only changed
`league`/`subcategory`, not resolution.)

## Key property: NO schema migration

Everything rides on the existing `poolCategory.config` (JSON) column + new
read-only endpoints + admin UI. Phase 4 reuses `createSportsPool`. Zero DB risk.

## Important: tag labels are English

The Gamma API returns English labels (`Iran`, `Lebanon`, `Oil`); the Polymarket
website shows localized text (Spanish: Irán, Líbano, Aceite) via a translation
layer (`requiresTranslation` on the tag). We use the English labels because they
match the labels on the events' `tags`, which is what `pickSubcategory` matches
against. Verified: `GET /tags/100265/related-tags` for Geopolitics resolves to
exactly the website's 17 sub-tags, same rank order:
`Iran, Lebanon, Oil, Ukraine, Ukraine Map, Cuba, Venezuela, Middle East, Gaza,
Israel, Syria, Yemen, Turkey, Sudan, China, Thailand-Cambodia, India-Pakistan`.

---

## Admin UX & guardrails (error-prevention design)

**Principle #1: pick from PM's reality, never free-type a value that must match
PM.** A free-typed filter/tag that doesn't exactly match a Polymarket tag label
silently matches 0 pools (a dead filter). Every PM-matching value is a SELECT
from live PM data.

**Category mental model (2 levels):**
1. PM tag(s) (`tagIds`) = what gets imported (e.g. Geo = "Geopolitics" 100265).
2. Sidebar filters = a chosen subset of that tag's `related-tags` (e.g. Iran,
   Oil, Ukraine…). Filters DEPEND on the category's tag.

**Sidebar filters UI:** replace the free-text "Add filter" with a picker loaded
from `/tags/{tagId}/related-tags` - the real ranked list PM offers. Admin only
toggles/orders which to show; cannot add anything PM lacks. If no tag set yet,
show "pick a Polymarket tag first". Show counts when available so the admin picks
high-volume sub-tags.

| Field | UI | Why |
|---|---|---|
| PM tag(s) (`tagIds`) | PM search → pick (stores id+label) | never type ids; wrong id = imports nothing |
| Sidebar filters (`subcategories`) | multi-select of related-tags | only what PM has → no dead filters |
| minVolume / maxDays / maxMarkets / maxSubmarkets | number, range-validated | only tunes quantity, never "broken" |
| label, shortLabel, color, icon, sortOrder | free (validated) | cosmetic |
| `code`, `type` | editable on CREATE only, locked on edit | pools store `league = code`; changing it orphans pools |
| `matchPriority` | "Advanced", sane default | only resolves category overlap (Politics last) |

**Where NOT to allow free access (guardrails):**
- No typing tag names/ids - always pick from PM.
- `code`/`type` immutable after create.
- Deleting a category with active pools → warn/block (orphans pools in the UI;
  does NOT affect on-chain or resolution).
- Validate numbers (non-negative, sane caps).

Net: full authority over which topics exist and which filters show, but always
choosing from what PM offers - control without the ability to break it.

## Current state (audit)

- Admin **only edits** existing categories - no create/delete in the UI (the
  backend `POST`/`DELETE /api/admin/categories` exist but are unused).
- The edit dialog exposes only `tags`, `minVolume24h`, `maxDaysAhead`,
  `subcategories`. It does NOT expose `tagIds`, `matchPriority`, or per-category
  caps.
- Hardcoded: `FALLBACK` in `category-config.ts`, `seed-categories.ts`, the
  hand-written subcategory whitelists, and the global caps
  (`POLYMARKET_MAX_MARKETS_PER_CATEGORY`, `POLYMARKET_MAX_SUBMARKETS_PER_EVENT`,
  `POLYMARKET_MAX_PAGES_PER_TAG`).
- Subcategories are guessed, not Polymarket's real taxonomy.
- No way to create a specific PM pool on demand (only crypto `create-pool`).

---

## Phase 1 - Full CRUD + all config fields in the editor

Backend:
- `bulkSync` reads `maxMarkets` and `maxSubmarketsPerEvent` from each category's
  `config` (fallback to env/default) instead of single globals.
- `category-config.ts`: add `maxMarkets`, `maxSubmarketsPerEvent` to
  `PolymarketCategoryConfig` (already has `tags`, `tagIds`, `minVolume24h`,
  `maxDaysAhead`, `matchPriority`, `subcategories`).

Frontend (`CategoryManagement.tsx`):
- "New Category" button → `EditDialog` in create mode (editable `code` + `type`)
  → `POST /api/admin/categories`.
- Per-card delete button (with confirm) → `DELETE /api/admin/categories/:id`.
- `EditDialog` exposes all PM config: `tagIds`, `matchPriority`, `minVolume24h`,
  `maxDaysAhead`, `maxMarkets`, `maxSubmarketsPerEvent`, `subcategories`.

Files: `apps/api/src/scheduler/polymarket-sync.ts`,
`apps/api/src/services/category-config.ts`,
`apps/web/src/app/admin/components/CategoryManagement.tsx`.

## Phase 2 - Real source tags from Polymarket

Backend (`routes/config.ts`), in-memory cache ~1h:
- `GET /api/config/pm-related-tags?tagId=100265` → fetch `/tags/{id}/related-tags`,
  resolve each `relatedTagID` to its label → `[{ id, label, slug, rank }]`.
- `GET /api/config/pm-tag?slug=geopolitics` → `{ id, label }` (resolve tag_id when
  adding a tag with one click).

Frontend (`PolymarketConfigFields`):
- `subcategories` becomes a multi-select of the category's real related-tags
  (ordered), instead of free text + pool-tag suggestions.
- Counts (e.g. Iran 104) are NOT in `related-tags` (needs 1 query per sub-tag) -
  optional/lazy; v1 shows label + rank.

Files: `apps/api/src/routes/config.ts`,
`apps/web/src/app/admin/components/CategoryManagement.tsx`.

## Phase 3 - De-hardcode

- Auto-seed on boot: if `poolCategory` is empty at startup, run the seed
  automatically (kills the "prod empty → fallback" footgun). Keep `FALLBACK` as a
  minimal safety net.
- Per-category caps (read side done in Phase 1) replace the global
  `POLYMARKET_MAX_*` env vars (env kept as defaults only).
- DB is the single source of truth (documented).

Files: `apps/api/src/index.ts` (or scheduler bootstrap),
`apps/api/src/services/category-config.ts`, `apps/api/prisma/seed-categories.ts`.

## Phase 4 - Manual PM pool creation

Backend (`routes/admin/actions.ts`):
- `GET /api/admin/pm-markets?tagId=&q=` → search Gamma markets →
  `[{ id, question, eventTitle, volume, endDate }]`.
- `POST /api/admin/actions/create-pm-pool` `{ marketId, categoryCode }` → fetch the
  market, build a `Match`, resolve subcategory, call `createSportsPool` (on-chain,
  dedup by `matchId`). Resolves normally afterwards (real Gamma `marketId`).

Frontend: a "Create PM pool" panel - search → pick → create.

Files: `apps/api/src/routes/admin/actions.ts`,
`apps/api/src/scheduler/sports-scheduler.ts` (reuse `createSportsPool`),
admin UI (new panel/component).

---

## Suggested build order

1. **Phase 1 + 2 together** (the source-tag picker lives in the editor).
2. **Phase 3** (small cleanup).
3. **Phase 4** (largest, standalone).

## Risks / notes

- `related-tags` = N label lookups per category → in-memory cache.
- Phase 4 creates on-chain pools with the authority wallet (shared across envs).
- Pool resolution is unaffected (see top).
