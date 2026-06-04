# Reusable UI Primitives

Part of the Trading Terminal Migration set — see [README](./README.md)

These are the dependency-light building blocks used throughout the trading terminal. They have **no business logic** and **no fight/duel coupling** — copy them first. Each is a `'use client'` component (Next.js app-router). They depend only on:

- React 18 hooks (`useState`, `useRef`, `useEffect`) and `react-dom`'s `createPortal`.
- The Tailwind **design tokens** (`surface-*`, `primary-*`, `win-*`, `loss-*`, `orange-*`, `cyan-*`) and the `animate-shimmer` keyframe — see [Design tokens & CSS](./02-design-tokens-css.md). If those tokens are not migrated, every primitive below will render with broken colors.

All files live in `apps/web/src/components/`.

> **Note on barrel export:** `apps/web/src/components/index.ts` does **NOT** re-export these primitives. It only exports `FightCard`, `TradingViewChart`, `OrderBook`, `Positions`, `CancelFightModal`, `GlobalFightVideo`. Each primitive is imported by its own path, e.g. `import { Spinner } from '@/components/Spinner'` or `import { Slider } from './Slider'`. The migrator may add them to a barrel or keep per-file imports.

---

## Quick reference

| Primitive | File | Default export? | Key props | Terminal usage |
|-----------|------|-----------------|-----------|----------------|
| `Slider` | `Slider.tsx` | named | `min, max, value, onChange, step?, color?, disabled?` | Leverage slider, close-percent sliders in modals |
| `Toggle` | `Toggle.tsx` | named | `checked, onChange, disabled?, size?, variant?, label?` | Reduce-only / TP-SL switches in order entry |
| `Dropdown<T>` | `Dropdown.tsx` | named (generic) | `options, value, onChange, align?, className?` | Orderbook grouping selector |
| `Portal` | `Portal.tsx` | named | `children` | Every modal (mounts to `document.body`) |
| `Spinner` | `Spinner.tsx` | named | `size?, variant?, className?` | Loading states everywhere |
| `Skeleton*` | `Skeletons.tsx` | many named | varies | Page/panel loading placeholders |

---

## 1. `Slider`

**File:** `apps/web/src/components/Slider.tsx`

Custom pointer-driven slider matching the leverage slider on the Trade page. Renders a thin track, a filled portion, five tick dots (at 0/25/50/75/100 %), and a ring-style thumb. **Does not use a native `<input type=range>`** — it tracks pointer events on a `<div>` with pointer capture, so styling is fully controlled.

### Prop signature

```ts
interface SliderProps {
  min: number;
  max: number;
  value: number;
  onChange: (value: number) => void;
  step?: number;        // default 1
  color?: string;       // 'primary' | 'orange' | 'cyan' (default 'primary')
  disabled?: boolean;   // default false
}

export function Slider(props: SliderProps): JSX.Element
```

### Behavior

- `percent = ((value - min) / (max - min)) * 100`.
- On `pointerdown` it calls `setPointerCapture` then computes the value; on `pointermove` it only updates while the pointer is captured. This gives drag-to-set behavior without a native input.
- **Important geometry:** there is a `pad = 9` (px) inset on each side. The clickable range maps `clientX` from `rect.left + 9` to `rect.right - 9`. The raw value is rounded to the nearest `step`, then clamped to `[min, max]`.
- When `disabled`, the root gets `opacity-50 pointer-events-none` and pointer handlers early-return.

### Styling (the `color` prop selects a palette)

The `colorMap` (only `primary`, `orange`, `cyan` are defined; unknown values fall back to `primary`):

| color | fill | tick | thumb | glow | inner |
|-------|------|------|-------|------|-------|
| `primary` | `bg-surface-400` | `bg-surface-400` | `bg-surface-400` | `shadow-surface-400/30` | `bg-surface-300` |
| `orange` | `bg-orange-500` | `bg-orange-400` | `bg-orange-500` | `shadow-orange-500/30` | `bg-orange-400` |
| `cyan` | `bg-cyan-500` | `bg-cyan-400` | `bg-cyan-500` | `shadow-cyan-500/30` | `bg-cyan-400` |

Static structure classes worth preserving verbatim:

- Root: `relative w-full h-8 flex items-center select-none touch-none`
- Track bg: `absolute left-[9px] right-[9px] h-[3px] bg-surface-700 rounded-full`
- Filled portion width uses inline style: `width: calc(${percent/100} * (100% - 18px))`
- Tick dots: `absolute w-2 h-2 rounded-full -translate-x-1/2`; active tick uses the palette `tick` color, inactive uses `bg-surface-600`. Positioned with `left: calc(9px + ${t/100} * (100% - 18px))`.
- Thumb: `absolute w-[18px] h-[18px] rounded-full -translate-x-1/2 ${thumb} shadow-lg ${glow}` with two nested rings:
  - `absolute inset-[3px] rounded-full bg-surface-900`
  - `absolute inset-[5px] rounded-full ${inner}`

### Usage in the terminal

Imported by close/TP-SL modals: `MarketCloseModal.tsx`, `LimitCloseModal.tsx`, `TpSlModal.tsx`, `QuickPositionModal.tsx`. Typically used as a 0–100 % "close amount" slider and as the leverage selector. Pass `color="orange"` or `color="cyan"` for sell/alt styling.

---

## 2. `Toggle`

**File:** `apps/web/src/components/Toggle.tsx`

Accessible switch (`role="switch"`, `aria-checked`) wrapped in a `<label>` so an optional text label is clickable.

### Prop signature

```ts
interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;                       // default false
  size?: 'sm' | 'md';                       // default 'sm'
  variant?: 'default' | 'win' | 'loss';     // default 'default'
  label?: string;
}

export function Toggle(props: ToggleProps): JSX.Element
```

### Behavior

- Clicking the button (or its label) calls `onChange(!checked)` unless `disabled`.
- No internal state — fully controlled.

### Styling

- Checked track color by variant: `win` → `bg-win-500`, `loss` → `bg-loss-500`, `default` → `bg-primary-500`. Unchecked track is always `bg-surface-700`.
- Size `sm`: track `w-7 h-3.5`, knob `w-2.5 h-2.5`, checked translate `translate-x-[14px]`.
- Size `md`: track `w-9 h-[18px]`, knob `w-3.5 h-3.5`, checked translate `translate-x-[18px]`.
- Unchecked knob offset is `translate-x-[3px]`; checked knob is `bg-white`, unchecked is `bg-surface-400`.
- Transitions: `transition-colors duration-200` on track, `transition-all duration-200` on knob.
- Optional label text: `text-xs font-medium`, colored `text-surface-200` when checked else `text-surface-500`.

### Usage in the terminal

`apps/web/src/app/trade/page.tsx` imports it (`@/components/Toggle`) for order-entry switches (e.g. reduce-only / TP-SL). Also used in the landing demo `components/landing/FullTerminalDemo.tsx`.

---

## 3. `Dropdown<T>`

**File:** `apps/web/src/components/Dropdown.tsx`

A small generic select-menu. Closes on outside click via a `mousedown` listener on `document`.

### Prop signature

```ts
export interface DropdownOption<T extends string | number = string> {
  value: T;
  label: string;
}

interface DropdownProps<T extends string | number = string> {
  options: DropdownOption<T>[];
  value: T;
  onChange: (value: T) => void;
  align?: 'left' | 'right';   // menu alignment, default 'left'
  className?: string;          // extra classes on the trigger button
}

export function Dropdown<T extends string | number = string>(props: DropdownProps<T>): JSX.Element
```

### Behavior

- Open/close state is internal (`useState`). A ref on the wrapper plus a `document` `mousedown` listener closes the menu when clicking outside (listener attached only while open).
- Selecting an option calls `onChange(opt.value)` and closes.
- Trigger label is the matched option's `label`, falling back to `String(value)`.

### Styling

- Trigger button: `flex items-center gap-1 px-2 py-0.5 rounded text-xs text-surface-300 hover:text-white hover:bg-surface-800 transition-colors` + caret SVG that gets `rotate-180` when open.
- Menu: `absolute ${align==='right'?'right-0':'left-0'} top-full mt-1 min-w-[72px] bg-surface-850 rounded-lg shadow-xl overflow-hidden z-50 py-1`.
- Each option row: `w-full flex items-center justify-between px-3 py-1.5 text-xs whitespace-nowrap transition-colors`; selected row is `text-white bg-surface-700/50` with a checkmark SVG, others `text-surface-400 hover:text-white hover:bg-surface-800`.

### Usage in the terminal

`apps/web/src/components/OrderBook.tsx` imports it (`@/components/Dropdown`) for the price-grouping selector. Also used by `lobby/page.tsx` (game layer — out of scope, but the same component).

---

## 4. `Portal`

**File:** `apps/web/src/components/Portal.tsx`

Renders children into `document.body` via `createPortal`, so modals escape any ancestor `overflow`/CSS-containment and center against the viewport. SSR-safe: it returns `null` until mounted.

### Prop signature

```ts
interface PortalProps { children: ReactNode; }
export function Portal({ children }: PortalProps): React.ReactPortal | null
```

### Behavior

- A `mounted` flag flips to `true` in `useEffect` (so the first server render and client hydration return `null`, avoiding hydration mismatch). After mount it `createPortal(children, document.body)`.

### Usage in the terminal

The standard wrapper for **all** terminal modals: `CloseOppositeModal.tsx`, `MarketCloseModal.tsx`, `FlipPositionModal.tsx`, `WithdrawModal.tsx`, `LimitCloseModal.tsx`, `EditOrderModal.tsx`, `TpSlModal.tsx`. The migrator should keep this; the modals do their own backdrop/centering inside the portal.

---

## 5. `Spinner`

**File:** `apps/web/src/components/Spinner.tsx`

CSS-only spinning ring (`animate-spin`).

### Prop signature

```ts
interface SpinnerProps {
  size?: 'xs' | 'sm' | 'md' | 'lg';   // default 'md'
  variant?: 'primary' | 'white';      // default 'primary'
  className?: string;                  // default ''
}
export function Spinner(props: SpinnerProps): JSX.Element
```

### Styling maps

```ts
const sizes = { xs: 'h-4 w-4', sm: 'h-6 w-6', md: 'h-8 w-8', lg: 'h-12 w-12' };
const variants = {
  primary: 'border-b-2 border-primary-500',
  white:   'border-2 border-white/30 border-t-white',
};
```

Final classes: `animate-spin rounded-full ${sizes[size]} ${variants[variant]} ${className}`.

### Usage in the terminal

Ubiquitous loading indicator. Terminal-relevant importers include `TradingViewChartAdvanced.tsx`, `PacificaChart.tsx`, `FightBanner.tsx`, and every close/withdraw modal, plus `Skeletons.tsx` itself.

---

## 6. Skeletons

**File:** `apps/web/src/components/Skeletons.tsx`

Shimmer loading placeholders. The base `Skeleton` (private, not exported) is the primitive; the rest are page-specific compositions.

### Base shimmer (copy this verbatim)

```tsx
function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse bg-gradient-to-r from-surface-800 via-surface-700 to-surface-800 bg-[length:200%_100%] animate-shimmer ${className}`}
    />
  );
}
```

`animate-shimmer` requires the keyframe defined in `tailwind.config.ts` (see [Design tokens & CSS](./02-design-tokens-css.md)). **Reproduce these in the new project's Tailwind config or the gradient will not move:**

```ts
// tailwind.config.ts → theme.extend
animation: { shimmer: 'shimmer 2s linear infinite' },
keyframes: {
  shimmer: {
    '0%':   { backgroundPosition: '-200% 0' },
    '100%': { backgroundPosition: '200% 0' },
  },
},
```

### Exported skeletons

| Export | Signature | Notes |
|--------|-----------|-------|
| `SkeletonText` | `({ width='w-24', height='h-4', className='' })` | Basic text bar |
| `SkeletonAvatar` | `({ size='w-10 h-10' })` | `rounded-full` |
| `SkeletonButton` | `({ width='w-24', height='h-10' })` | `rounded-lg` |
| `SkeletonCard` | `({ children?, className='' })` | `bg-surface-800 border border-surface-800 p-4` wrapper |
| `FightCardSkeleton` | `()` | **Fight/arena — out of terminal scope** |
| `LeaderboardRowSkeleton` | `()` | game/leaderboard (out of scope) |
| `LeaderboardSkeleton` | `()` | game/leaderboard (out of scope) |
| `ProfileSkeleton` | `()` | profile (out of scope) |
| `ArenaSkeleton` | `()` | **Fight/arena — out of scope** |
| `PositionRowSkeleton` | `()` | **Terminal** — positions table row |
| `TradePanelSkeleton` | `()` | **Terminal** — order-entry panel placeholder |
| `PageLoadingSkeleton` | `({ title? })` | Generic centered spinner page |

### Terminal-relevant skeletons to keep

- **`PositionRowSkeleton`** — a `<tr>` matching the positions table (6 columns: market w/ avatar, side, size, entry, pnl, close button). Designed to slot into the positions table body.
- **`TradePanelSkeleton`** — mirrors the order-entry panel layout: market selector bar, price display, two order-type tab placeholders, size input, leverage slider bar (`w-full h-2 rounded-full`), and a 2-col submit-button grid.
- **`PageLoadingSkeleton`** — generic full-page fallback using `Spinner size="lg"`.

### Skeletons to DROP during migration (game layer)

`FightCardSkeleton`, `ArenaSkeleton`, `LeaderboardSkeleton`, `LeaderboardRowSkeleton`, `ProfileSkeleton` are all fight/arena/leaderboard/profile placeholders. They reference "VS", "Fighter", "Fights", "Record", "Win Rate", fight stake/opponent columns, etc. **Strip these** — they are not part of the terminal. Keep only the base helpers + `PositionRowSkeleton` + `TradePanelSkeleton` + `PageLoadingSkeleton`.

---

## Migration order (recommended)

1. Migrate **design tokens + the `shimmer` keyframe** first ([02-design-tokens-css.md](./02-design-tokens-css.md)) — everything below assumes `surface-*`, `primary-*`, `win-*`, `loss-*`, `orange-*`, `cyan-*` and `animate-shimmer`/`animate-pulse`/`animate-spin` exist.
2. Copy `Portal.tsx`, `Spinner.tsx` (zero token-shape coupling beyond colors).
3. Copy `Slider.tsx`, `Toggle.tsx`, `Dropdown.tsx`.
4. Copy `Skeletons.tsx`, **deleting the fight/arena/leaderboard/profile exports** listed above.
5. Decide whether to add these to a barrel `index.ts` (current barrel does not include them).
