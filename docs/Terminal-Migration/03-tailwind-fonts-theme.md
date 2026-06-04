# Tailwind Config, Fonts & Theme

Part of the Trading Terminal Migration set — see [README](./README.md).

This doc covers the Tailwind 3 configuration, the design-token color palette baked into `theme.extend`, the font-loading setup (next/font + a Google Fonts `@import`), animations/keyframes, shadows, and the dark-mode model. Everything here lives in these files:

| File | Role |
| --- | --- |
| `apps/web/tailwind.config.ts` | Tailwind theme extension (colors, fonts, shadows, animations) |
| `apps/web/postcss.config.mjs` | PostCSS pipeline (tailwindcss + autoprefixer) |
| `apps/web/src/app/layout.tsx` | next/font loading + body class wiring |
| `apps/web/src/app/globals.css` | Google Fonts `@import`, CSS variables, base body font-family |

Toolchain versions (from `apps/web/package.json`):

| Package | Version |
| --- | --- |
| `next` | `^14.2.20` (app router) |
| `tailwindcss` | `^3.4.17` |
| `postcss` | `^8.4.49` |
| `autoprefixer` | `^10.4.20` |
| `sonner` | `^2.0.7` (toast lib, styled in `layout.tsx`) |

> **None of the terminal theme is fight/duel-specific.** The only entanglement in these files is in `layout.tsx`, which imports and renders `<GlobalFightVideo />` — strip that (see [Fight entanglements](#fight-entanglements) at the bottom). The Tailwind config itself has zero game-layer concepts. Color keys named `win` / `loss` / `live` are generic trading P&L colors, **not** duel-outcome colors, and are used throughout the terminal (positions, order entry, price flashes).

---

## 1. PostCSS config (`apps/web/postcss.config.mjs`) — verbatim

```js
/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};

export default config;
```

Standard Tailwind 3 + autoprefixer pipeline. No extra PostCSS plugins. Copy as-is.

---

## 2. Tailwind config (`apps/web/tailwind.config.ts`) — verbatim

```ts
import type { Config } from 'tailwindcss';

export default {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Professional Trading Platform Palette
        // Neutral, clean colors inspired by Bloomberg/TradingView

        // Primary - Muted blue accent (softer, less saturated)
        primary: {
          50: '#eef6fc',
          100: '#d5e8f7',
          200: '#a8cfed',
          300: '#7ab4de',
          400: '#5196c9',
          500: '#3a7db0',
          600: '#2e6593',
          700: '#254f75',
          800: '#1c3d5a',
          900: '#132c42',
        },

        // Accent - Warm neutral for highlights
        accent: {
          50: '#fafaf9',
          100: '#f5f5f4',
          200: '#e7e5e4',
          300: '#d6d3d1',
          400: '#a8a29e',
          500: '#78716c',
          600: '#57534e',
          700: '#44403c',
          800: '#292524',
          900: '#1c1917',
        },

        // Surface colors - True neutral grays
        surface: {
          950: '#09090b', // Deepest
          900: '#0c0c0e', // Main background
          850: '#111113', // Card background
          800: '#18181b', // Elevated surface
          700: '#27272a', // Borders
          600: '#3f3f46', // Hover states
          500: '#52525b', // Muted elements
          400: '#71717a', // Secondary text
          300: '#a1a1aa', // Tertiary text
          200: '#d4d4d8', // Light text
          100: '#f4f4f5', // Near white
        },

        // Semantic colors - Warm, professional trading palette
        positive: {
          DEFAULT: '#26A69A', // Warm teal-green
          muted: '#00796B',
          subtle: 'rgba(38, 166, 154, 0.1)',
        },
        negative: {
          DEFAULT: '#EF5350', // Warm coral-red
          muted: '#C62828',
          subtle: 'rgba(239, 83, 80, 0.1)',
        },
        warning: {
          DEFAULT: '#FFA726', // Warm orange
          muted: '#EF6C00',
          subtle: 'rgba(255, 167, 38, 0.1)',
        },
        info: {
          DEFAULT: '#42A5F5', // Warm blue
          muted: '#1565C0',
          subtle: 'rgba(66, 165, 245, 0.1)',
        },

        // Trading colors - Warm palette (used throughout the app)
        win: {
          400: '#4DB6AC', // Light teal
          500: '#26A69A', // Main teal-green (TradingView style)
          600: '#00897B', // Dark teal
        },
        loss: {
          400: '#E57373', // Light coral
          500: '#EF5350', // Main coral-red (warm, not magenta)
          600: '#E53935', // Dark coral
        },
        live: {
          400: '#E57373',
          500: '#EF5350',
          600: '#E53935',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
        mono: [
          'Roboto Mono',
          'monospace',
        ],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
      },
      boxShadow: {
        'subtle': '0 1px 2px 0 rgba(0, 0, 0, 0.3)',
        'card': '0 1px 3px 0 rgba(0, 0, 0, 0.4), 0 1px 2px -1px rgba(0, 0, 0, 0.4)',
        'elevated': '0 4px 6px -1px rgba(0, 0, 0, 0.4), 0 2px 4px -2px rgba(0, 0, 0, 0.4)',
        'glow-sm': '0 0 10px rgba(58, 125, 176, 0.3)',
        'glow-primary': '0 0 20px rgba(58, 125, 176, 0.3)',
        'glow-accent': '0 0 20px rgba(139, 92, 246, 0.3)',
        'glow-success': '0 0 20px rgba(38, 166, 154, 0.3)', // Teal glow
        'glow-orange': '0 0 20px rgba(249, 115, 22, 0.4)',
        'glow-lg': '0 0 40px rgba(58, 125, 176, 0.2)',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
        'hero-gradient': 'linear-gradient(135deg, rgba(58,125,176,0.1) 0%, rgba(139,92,246,0.1) 100%)',
        'card-gradient': 'linear-gradient(180deg, rgba(255,255,255,0.05) 0%, transparent 100%)',
      },
      animation: {
        'fade-in': 'fadeIn 0.15s ease-out',
        'slide-up': 'slideUp 0.2s ease-out',
        'sheet-up': 'sheetUp 0.45s cubic-bezier(0.32, 0.72, 0, 1)',
        'sheet-down': 'sheetDown 1s cubic-bezier(0.32, 0.72, 0, 1) forwards',
        'fade-out': 'fadeOut 1s ease-in forwards',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
        'float': 'float 6s ease-in-out infinite',
        'shimmer': 'shimmer 2s linear infinite',
        'ticker': 'ticker 30s linear infinite',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: {
          '0%': { transform: 'translateY(4px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        sheetUp: {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        sheetSlide: {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        sheetDown: {
          '0%': { transform: 'translateY(0)' },
          '100%': { transform: 'translateY(100%)' },
        },
        fadeOut: { '0%': { opacity: '1' }, '100%': { opacity: '0' } },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 20px rgba(58,125,176,0.3)' },
          '50%': { boxShadow: '0 0 40px rgba(58,125,176,0.5)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        ticker: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
```

---

## 3. Content globs

```ts
content: [
  './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
  './src/components/**/*.{js,ts,jsx,tsx,mdx}',
  './src/app/**/*.{js,ts,jsx,tsx,mdx}',
]
```

All sources live under `apps/web/src/`. There is a `pages` glob even though this is an app-router project — harmless leftover; keep or drop. **When migrating into a different repo layout, update these globs to match your `src` root** or Tailwind will purge every class and you will ship an empty stylesheet.

---

## 4. Dark mode

**There is NO `darkMode` key in the config.** The app is hard-wired dark; it is not toggled via Tailwind's `dark:` variant or `class`/`media` strategy. Dark is achieved purely by:

1. The `surface.*` palette (very dark grays, `#09090b`–`#f4f4f5`).
2. CSS variables on `:root` in `globals.css` (`--background: #0c0c0e`, `--foreground: #f4f4f5`).
3. The `body` rule setting `background: var(--background); color: var(--foreground)`.

There are **no light-mode tokens and no theme switcher.** If you migrate into a project that needs `dark:` variants, introduce `darkMode: 'class'` and re-map these colors yourself — none of that exists today.

---

## 5. Color system (design tokens)

The palette is warm professional trading (TradingView/Bloomberg-inspired). Six families:

### `primary` (muted blue accent) — buttons, links, focus
| Shade | Hex |
| --- | --- |
| 500 | `#3a7db0` (canonical brand blue) |
| 600 | `#2e6593` |
| 700 | `#254f75` |

(Full ramp 50–900 is in the verbatim config above.)

### `surface` (neutral grays — the backbone of the terminal)
| Token | Hex | Intended use (per inline comments) |
| --- | --- | --- |
| `surface-950` | `#09090b` | Deepest |
| `surface-900` | `#0c0c0e` | Main background |
| `surface-850` | `#111113` | Card background |
| `surface-800` | `#18181b` | Elevated surface |
| `surface-700` | `#27272a` | Borders |
| `surface-600` | `#3f3f46` | Hover states |
| `surface-500` | `#52525b` | Muted elements |
| `surface-400` | `#71717a` | Secondary text |
| `surface-300` | `#a1a1aa` | Tertiary text |
| `surface-200` | `#d4d4d8` | Light text |
| `surface-100` | `#f4f4f5` | Near white |

> Note: there is **no `surface-50`** and the scale is inverted from Tailwind convention — low numbers are darkest, high numbers lightest. Match these exact stops or the whole UI shifts.

### Trading P&L colors (used everywhere in the terminal)
Load-bearing semantic colors for positions, order entry, price flashes:

| Family | 400 | 500 (primary) | 600 |
| --- | --- | --- | --- |
| `win` (green / up / buy) | `#4DB6AC` | `#26A69A` | `#00897B` |
| `loss` (red / down / sell) | `#E57373` | `#EF5350` | `#E53935` |
| `live` (alias of loss; live/pulsing indicators) | `#E57373` | `#EF5350` | `#E53935` |

`win`/`loss` are generic trading-direction colors, **not** duel outcome colors — keep them. Real usages from `layout.tsx` Sonner config: `border-win-500/50` (success), `border-loss-500/50` (error).

### Semantic objects (`DEFAULT` + `muted` + `subtle`)
Each has a `DEFAULT`, a darker `muted`, and a low-alpha `subtle` (rgba 0.1) for backgrounds:

| Family | DEFAULT | muted | subtle |
| --- | --- | --- | --- |
| `positive` | `#26A69A` | `#00796B` | `rgba(38,166,154,0.1)` |
| `negative` | `#EF5350` | `#C62828` | `rgba(239,83,80,0.1)` |
| `warning` | `#FFA726` | `#EF6C00` | `rgba(255,167,38,0.1)` |
| `info` | `#42A5F5` | `#1565C0` | `rgba(66,165,245,0.1)` |

Usage: `bg-positive-subtle text-positive`, `text-negative`, etc. (`DEFAULT` lets you write `text-positive` with no shade suffix.)

### `accent` (warm neutral, stone-like) — secondary chrome
Standard 50–900 ramp from `#fafaf9` to `#1c1917`. Less used than `surface`.

---

## 6. Typography

### 6a. Tailwind `fontFamily`

```ts
fontFamily: {
  sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
  mono: ['Roboto Mono', 'monospace'],
}
```

- `font-sans` => **Inter** (default body font for the terminal).
- `font-mono` => **Roboto Mono** (numbers: prices, sizes, order book — anything tabular).

### 6b. `fontSize` extension

Only one custom size is added (everything else is Tailwind default):

```ts
fontSize: { '2xs': ['0.625rem', { lineHeight: '0.875rem' }] }  // text-2xs => 10px / 14px lh
```

`text-2xs` (10px) is used for dense labels (order-book / ticker micro-text). Reproduce it.

### 6c. WARNING: font loading is INCONSISTENT — read before migrating

There are **two completely separate font mechanisms**, and the next/font one is effectively **dead code**:

**Mechanism A — Google Fonts `@import` (the one that actually renders).** Top of `apps/web/src/app/globals.css` (line 1):

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,400;14..32,500;14..32,600;14..32,700&family=Roboto+Mono:wght@400;500&display=swap');
```

Base `body` rule (globals.css ~line 30):

```css
body {
  color: var(--foreground);
  background: var(--background);
  font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  font-size: 14px;
  line-height: 1.5;
}
```

Mono stack at globals.css ~line 497:
```css
font-family: 'SF Mono', Monaco, 'Inconsolata', 'Roboto Mono', monospace;
```

This `@import` loads **Inter** (weights 400/500/600/700, optical sizing 14–32) and **Roboto Mono** (400/500). The Tailwind `fontFamily` names (`Inter`, `Roboto Mono`) resolve against these.

**Mechanism B — next/font/google in `layout.tsx` (loaded but NOT wired to anything):**

```tsx
import { Inter, JetBrains_Mono } from 'next/font/google';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
});

// ...
<body className={`${inter.variable} ${jetbrainsMono.variable} antialiased`}>
```

Attaches two CSS variables to `<body>`:
- `--font-inter` => next/font Inter
- `--font-mono` => next/font **JetBrains Mono** (a DIFFERENT mono font than the Tailwind/CSS `Roboto Mono`!)

**But `--font-inter` and `--font-mono` are referenced NOWHERE.** Confirmed by grep: zero `var(--font-inter)` / `var(--font-mono)` usages across `apps/web`. Tailwind's `fontFamily.sans`/`.mono` hardcode the `'Inter'` and `'Roboto Mono'` literals instead of the CSS vars. So next/font downloads JetBrains Mono and a self-hosted Inter that the app never uses — the visible fonts all come from the Google `@import`.

> **Migration recommendation:** Pick ONE mechanism. Clean approach for a fresh repo:
> 1. Keep next/font (self-hosted, no FOUT, no external request, GDPR-safe).
> 2. Delete the `@import url(...)` line from globals.css.
> 3. Wire CSS vars into Tailwind: `fontFamily.sans` => `['var(--font-inter)', ...fallbacks]`, `fontFamily.mono` => `['var(--font-mono)', 'monospace']`.
> 4. Decide between Roboto Mono and JetBrains Mono and use it consistently (the current app visually uses **Roboto Mono** via the `@import`; the `--font-mono` next/font is JetBrains Mono and unused).
> 5. Update the base `body { font-family }` rule to `var(--font-inter), ...` too.
>
> If you'd rather not touch it, copying both files verbatim WILL reproduce the current look (Inter + Roboto Mono via Google CDN), at the cost of an external font request and dead next/font downloads.

### 6d. Font feature settings

`globals.css` `html` rule enables Inter stylistic sets:
```css
html { font-feature-settings: 'cv02', 'cv03', 'cv04', 'cv11'; overflow-x: hidden; }
```
These tweak Inter glyph shapes (single-story a, etc.). Keep to reproduce the exact look.

---

## 7. Shadows (`boxShadow`)

Subtle dark-mode elevations and colored glow shadows.

| Class | Value | Purpose |
| --- | --- | --- |
| `shadow-subtle` | `0 1px 2px 0 rgba(0,0,0,0.3)` | hairline lift |
| `shadow-card` | `0 1px 3px 0 rgba(0,0,0,0.4), 0 1px 2px -1px rgba(0,0,0,0.4)` | cards |
| `shadow-elevated` | `0 4px 6px -1px rgba(0,0,0,0.4), 0 2px 4px -2px rgba(0,0,0,0.4)` | modals/popovers |
| `shadow-glow-sm` | `0 0 10px rgba(58,125,176,0.3)` | small blue glow |
| `shadow-glow-primary` | `0 0 20px rgba(58,125,176,0.3)` | blue glow |
| `shadow-glow-accent` | `0 0 20px rgba(139,92,246,0.3)` | purple glow (`#8b5cf6`, not in palette) |
| `shadow-glow-success` | `0 0 20px rgba(38,166,154,0.3)` | teal glow (matches `win-500`) |
| `shadow-glow-orange` | `0 0 20px rgba(249,115,22,0.4)` | orange glow |
| `shadow-glow-lg` | `0 0 40px rgba(58,125,176,0.2)` | large blue glow |

---

## 8. Background image gradients

| Class | Value |
| --- | --- |
| `bg-gradient-radial` | `radial-gradient(var(--tw-gradient-stops))` |
| `bg-gradient-conic` | `conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))` |
| `bg-hero-gradient` | `linear-gradient(135deg, rgba(58,125,176,0.1) 0%, rgba(139,92,246,0.1) 100%)` |
| `bg-card-gradient` | `linear-gradient(180deg, rgba(255,255,255,0.05) 0%, transparent 100%)` |

`bg-hero-gradient` is marketing/landing chrome; the terminal mostly uses flat `surface-*` fills and `bg-card-gradient`.

---

## 9. Animations & keyframes

| `animation` class | Shorthand | Keyframe |
| --- | --- | --- |
| `animate-fade-in` | `fadeIn 0.15s ease-out` | opacity 0->1 |
| `animate-slide-up` | `slideUp 0.2s ease-out` | translateY(4px)+fade in |
| `animate-sheet-up` | `sheetUp 0.45s cubic-bezier(0.32,0.72,0,1)` | mobile bottom-sheet open (translateY 100%->0) |
| `animate-sheet-down` | `sheetDown 1s cubic-bezier(0.32,0.72,0,1) forwards` | bottom-sheet close (0->100%) |
| `animate-fade-out` | `fadeOut 1s ease-in forwards` | opacity 1->0 |
| `animate-pulse-glow` | `pulseGlow 2s ease-in-out infinite` | boxShadow glow pulse (blue) |
| `animate-float` | `float 6s ease-in-out infinite` | translateY +/-10px hover |
| `animate-shimmer` | `shimmer 2s linear infinite` | skeleton-loader bg sweep (-200%->200%) |
| `animate-ticker` | `ticker 30s linear infinite` | marquee / price ticker (translateX 0->-50%) |

> A stray `sheetSlide` keyframe is defined with **no matching `animation` entry** (identical to `sheetUp`). Harmless; safe to drop on migration.

The cubic-bezier `(0.32, 0.72, 0, 1)` is the standard iOS-sheet easing — used for the mobile order-entry bottom sheet. `animate-shimmer` needs a wide gradient background (e.g. `bg-[length:200%_100%]`) to be visible. `animate-ticker` needs the content duplicated (translateX -50% assumes two copies for a seamless loop).

---

## 10. Plugins

```ts
plugins: []
```

**No Tailwind plugins.** No `@tailwindcss/forms`, `typography`, `line-clamp`, etc. If the migration target relies on form-reset styles from `@tailwindcss/forms`, note it is NOT present here — form controls are styled manually in `globals.css` / component classes.

---

## 11. `globals.css` directive order (top of file)

Preserve this order at the very top of `globals.css`:

```css
@import url('https://fonts.googleapis.com/css2?...');  /* MUST be first: @import before @tailwind */
@tailwind base;
@tailwind components;
@tailwind utilities;
```

CSS spec requires `@import` to precede all other rules, so the Google Fonts import sits above the `@tailwind` directives. Component classes (`.card`, etc.) live in `@layer components { ... }` further down — documented in the design-tokens / globals doc, not here.

---

## Fight entanglements

Within the files in scope for THIS doc, the only fight/duel coupling is:

- `apps/web/src/app/layout.tsx` line 6: `import { GlobalFightVideo } from '@/components';`
- `apps/web/src/app/layout.tsx` line 40: `<GlobalFightVideo />` rendered as a sibling of `<Providers>` and `<Toaster>`.

This is a full-screen fight/duel video overlay component — **strip both the import and the `<GlobalFightVideo />` element** when porting `layout.tsx`. Nothing in `tailwind.config.ts` or `postcss.config.mjs` references the game layer. The `win` / `loss` / `live` color families are generic trading colors (P&L direction), **not** duel mechanics — keep them.

## Cross-links

- [Design tokens, globals.css & component classes](./02-design-tokens-css.md) — the `:root` CSS variables, `.card` / button component layers, scrollbar styles, and the rest of `globals.css`.
- [README](./README.md) — full migration set index.
