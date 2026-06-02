# UpDown Admin — Style Guide

One page. Read it before opening a PR that touches the admin UI.
Phase 3 reviewers apply this as a checklist; if a change can't be expressed
with the primitives below, raise it as a discussion, don't fork a new
pattern in a single tab.

The primitives live in `apps/web/src/app/admin/ui/`. Import via the barrel:

```ts
import { SectionCard, ConfirmDialog, StatusChip, useToast } from '@/app/admin/ui';
```

If you find yourself reaching past the barrel into an individual file, the
primitive is missing a prop — add the prop, don't bypass.

---

## 1. Typography

Locked six-step scale (`ui/typography.tsx`). Never inline `sx={{ fontSize }}`
once these are imported.

| Component | Size / weight | Use |
|---|---|---|
| `<H1>` | 1.25rem / 600 | Page title (one per page) |
| `<H2>` | 0.9rem / 600 / UPPERCASE 0.05em | Section heading inside a `SectionCard` |
| `<H3>` | 0.95rem / 600 | Dialog title, sub-section |
| `<Body>` | 0.85rem / 400 | Default body copy |
| `<Meta>` | 0.7rem / 500, `text.tertiary` | Secondary inline info ("Updated 3m ago") |
| `<Label>` | 0.62rem / 700 / UPPERCASE 0.05em | Chip-like row labels, stat-card caption |

Monospace (IDs, addresses, hex prices) uses `'ui-monospace, SFMono-Regular,
Menlo, monospace'` at 0.75rem.

## 2. Spacing scale

MUI spacing units (`1` = 8px). Locked via `LAYOUT_TOKENS` in `ui/tokens.ts`.

| Token | Value | Use |
|---|---|---|
| `inlineIconGap` | 0.5 (4px) | Icon next to label inside one element |
| `inlineButtonGap` | 1 (8px) | Adjacent buttons in a row |
| `fieldStackGap` | 1.5 (12px) | Vertical stack of form fields inside a card |
| `cardSectionGap` | 2 (16px) | Sub-section separation inside a card |
| `cardToCardGap` | 2 (16px) | Sibling `SectionCard`s |
| `pageSectionGap` | 3 (24px) | Top-level page sections |
| `cardPaddingDefault` | 2.5 (20px) | Multi-section card |
| `cardPaddingDense` | 2 (16px) | Single-purpose card (`<SectionCard dense>`) |

## 3. Radius scale

| Token | MUI | Pixels | Use |
|---|---|---|---|
| `radiusChip` | 1 | 8px | Chips, status pills |
| `radiusInput` | 1.5 | 12px | Text fields, search inputs |
| `radiusCard` | 2 | 16px | `SectionCard`, `StatCard`, `AdminDialog` paper |
| `'50%'` |  |  | Avatars, empty-state icon disc |

No ad-hoc `borderRadius: 8` / `12` / `999`. If you need something
different, add it to `LAYOUT_TOKENS`.

## 4. Color tokens

Always from `darkTokens` (`@/lib/theme`). Never inline `#hex` or
`rgba(...)`. Use `withAlpha(token, opacity)` to tint.

- Surfaces: `t.bg.app`, `t.bg.surface`, `t.bg.surfaceAlt`, `t.bg.input`
- Text: `t.text.primary`, `t.text.secondary`, `t.text.tertiary`, `t.text.dimmed`
- Borders: `t.surfaceBorder` (preferred — matches the public app's market cards), `t.border.subtle`, `t.border.medium`, `t.border.strong`
- Hover layers: `t.hover.subtle`, `t.hover.default`, `t.hover.medium`, `t.hover.strong`
- Status semantics: `t.success` / `t.successDark`, `t.warning`, `t.error`, `t.info`, `t.gain`, `t.text.tertiary` (neutral)

For status chips, pick a `StatusKind` (`ok | pending | warning | error |
neutral | info`) and let `<StatusChip>` resolve the swatch through
`STATUS_PALETTE`. Per-tab `statusChip()` helpers are forbidden.

Sport accents come from `SPORT_COLORS` / `sportColor(sport)` in
`ui/tokens.ts`.

## 5. Button hierarchy

Use `<ActionButton>`, never raw `<Button>`. One `kind` per intent:

| Kind | Visual | Use |
|---|---|---|
| `primary` | `t.success` bg, white text, `t.successDark` hover | Create, Save, Confirm, "Done" — at most **one** per surface |
| `secondary` | `t.hover.medium` bg, `t.border.medium` border | Cancel, Refresh, Back, neutral actions |
| `destructive` | Transparent + `t.error` border/text | Delete, Force Close, Reset — **always** behind a `<ConfirmDialog severity="destructive">` |
| `tertiary` | Bare `t.text.tertiary` | Inline text actions ("Show details", "Copy") |

Loading: pass `loading={true}` — don't toggle `disabled`. The button shows
a 14px spinner and an "…" suffix.

The only contained-error button in the whole admin is inside
`ConfirmDialog` when `severity="destructive"`. A red filled button in a
table row is wrong.

## 6. Dialog pattern

Use `<AdminDialog>` for any modal. `<ConfirmDialog>` for any confirmation.
Never raw MUI `<Dialog>`.

- Paper: 1px `t.border.medium`, radius 2, `t.bg.surface`, no gradient.
- Header: `px: 2.5, py: 1.75`, separated by `t.border.subtle`. Icon (rounded variant) + `<H3>` left, close X right. Close X disables when `loading`.
- Body: `px: 3, pt: 3, pb: 2`. No `pt: '12px !important'` overrides — fix at the dialog level if you need different spacing.
- Footer: `px: 2.5, py: 2`, top-bordered `t.border.subtle`, tinted `t.bg.surfaceAlt`, actions right-aligned with gap=1. Pass via `footer` prop.
- Backdrop click + Escape are blocked while `loading={true}` — you don't need to write `onClose={busy ? undefined : onClose}` yourself.

Icons inside dialogs use the `*Rounded` variants from `@mui/icons-material`.

## 7. Cards

Use `<SectionCard>` for any content block with a title or actions row.

- `dense` for single-purpose cards (16px padding); default for multi-section (20px).
- `accentColor` for a 3px left rule (sport color, status color). Use sparingly — one or two per page.
- Max 2 levels of nesting. If you need a third, split into siblings.

Use `<StatCard>` for numeric tiles. Lay out in a CSS grid (auto-fit, minmax 160px) inside a `SectionCard`.

## 8. Tables

- Header row: 0.7rem 600 uppercase, `t.text.tertiary`.
- Cells: 0.8rem, `tabular-nums` for numbers.
- Timestamps: `<TimeCell value=… mode="absolute" />` (default). `mode="relative"` for activity logs only. Hover always shows the ISO via tooltip.
- IDs: `<IdCell value=… truncate={10} copyable />`.
- Wallets: `<WalletCell address=… />` — locks 4+4 abbreviation, full address on hover, click-to-copy.
- Status: `<StatusChip status="ok" />`.
- Empty body: `<EmptyState>` with `title` and `hint` that **names the next button** ("No upcoming matches. Try Refresh from SDB.").

Lists with >10 expected rows get a `<FilterBar>` above the table. Use
`debounceMs={300}` if the filter hits the backend; default 0 for local
filtering.

## 9. State templates

| State | Primitive | Pattern |
|---|---|---|
| Loading (page) | `<LoadingState variant="block" />` | Centered, py=6, 28px spinner |
| Loading (cell) | `<LoadingState variant="inline" />` | 14px spinner, inline |
| Loading (button) | `loading` prop on `<ActionButton>` | Spinner + "…" suffix |
| Empty | `<EmptyState title=… hint=… action=… />` | Muted icon disc, bold title, hint names the next button |
| Error (sticky) | `<ErrorAlert title=… message=… details=err />` | Tinted bg + ErrorOutlineRounded icon, collapsible raw |
| Error (fill) | `<ErrorState message=… onRetry=… />` | Wraps `ErrorAlert` + a retry `ActionButton` |
| Toast | `useToast().show({ kind, message })` | Bottom-right stack, auto-dismiss |
| Mutation feedback | `useMutationFeedback().run(mutation, vars, { success })` | Friendly mapping via `mapAdminError` |

## 10. Friendly errors

Every backend error code we recognise has a row in
`apps/web/src/app/admin/lib/adminErrors.ts`. Raw `err.message` should
never reach the UI — always wrap a mutation in `useMutationFeedback`, or
pass the error to `<ErrorAlert details=err />` so the raw text lands in
the collapsible "Show details" section.

When you add a new backend error code, add an entry to `KNOWN` in
`adminErrors.ts` in the same PR.

## 11. Polling cadence

Use the constants in `ui/tokens.ts`. Don't ship a bespoke
`refetchInterval` number.

| Constant | Value | Use |
|---|---|---|
| `POLL_FAST_MS` | 15s | Live system health, active pool flow |
| `POLL_MEDIUM_MS` | 30s | Dashboards, user / financial overview |
| `POLL_SLOW_MS` | 60s | Claim queues, log archives, anything mostly static |
| `POLL_NONE` | `false` | One-shot queries |

## 12. Forbidden patterns

These are rejected in review. The primitives exist precisely so you don't
need them.

- Raw `<Dialog>`, raw `<Card>` shells, raw `<Alert>` for errors.
- Inline `<CircularProgress size={…} />` outside `LoadingState`.
- `window.confirm()` — always use `<ConfirmDialog>`.
- Drop-shadows on cards, neon glow, shimmer, gradients beyond the subtle
  hover tint. (Phase 2b §1.)
- Inline hex/rgba color literals; per-tab `StatusChip` / `statusChip()` re-definitions.
- `pt: '12px !important'`, `borderRadius: 8`, `fontSize: '14px'` — use
  the scales.
- Raw `err.message` in red Typography — wrap in `useMutationFeedback` or
  `ErrorAlert`.

## 13. Tab refactor checklist

Use this when adopting Phase 2 primitives in a tab (Phase 3 PRs).

- [ ] Every `<Card>` → `<SectionCard>`
- [ ] Every status pill → `<StatusChip status=…>`
- [ ] Every button → `<ActionButton kind=…>`
- [ ] Every dialog → `<AdminDialog>` / `<ConfirmDialog>`
- [ ] Every `<CircularProgress>` → `<LoadingState variant=…>`
- [ ] Every empty `<TableBody>` / "No data" copy → `<EmptyState>` that names the next button
- [ ] Every `<Alert severity="error">` / raw error Typography → `<ErrorAlert>` / `<ErrorState>`
- [ ] Every ad-hoc toast `useState` → `useToast()` / `useMutationFeedback()`
- [ ] Every timestamp render → `<TimeCell>` (or `formatTime()` for raw strings)
- [ ] Every wallet abbreviation → `<WalletCell>`
- [ ] Every ID + copy button → `<IdCell>`
- [ ] Every `refetchInterval: <ms>` → `POLL_FAST_MS` / `POLL_MEDIUM_MS` / `POLL_SLOW_MS`
- [ ] Every list >10 rows → `<FilterBar>` above the table
- [ ] Empty-state copy names the next button
- [ ] No raw `#hex` or `rgba()` in `sx`; everything resolves to a `darkTokens` field
- [ ] No new error code reaches the UI without an entry in `adminErrors.ts`
