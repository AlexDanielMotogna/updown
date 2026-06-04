# Design Tokens & Global CSS

Part of the Trading Terminal Migration set — see [README](./README.md).

This document is the complete reference for the visual design system of the TradeFightClub trading terminal: every CSS custom property, the full Tailwind color palette (hex values), all @keyframes / animation utilities, custom component & utility classes, scrollbar styling, base resets, and TradingView chart theming.

Source files:

| File | Purpose | Lines |
|------|---------|-------|
| apps/web/src/app/globals.css | Global styles, design tokens, component classes, keyframes, wallet-adapter overrides | 998 |
| apps/web/tailwind.config.ts | Tailwind theme extension — color palette, fonts, shadows, animations | 189 |
| apps/web/public/tradingview-custom.css | TradingView Advanced Chart widget DOM overrides (background/border theming) | 67 |

> Migration note: The terminal uses Tailwind CSS with a heavily extended theme. Nearly all color/spacing tokens live in tailwind.config.ts, NOT in CSS variables. The six CSS custom properties in :root are only used by the base body/html reset and a couple of raw-CSS components. To reproduce the look you MUST port both tailwind.config.ts and globals.css.

---

## 1. Font stack

Imported at the very top of globals.css (Google Fonts):

```css
@import url("https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,400;14..32,500;14..32,600;14..32,700&family=Roboto+Mono:wght@400;500&display=swap");
```

- Inter — UI sans-serif (weights 400/500/600/700, optical sizing 14-32).
- Roboto Mono — monospace for numbers/prices (weights 400/500).

Tailwind fontFamily (from tailwind.config.ts):

```ts
fontFamily: {
  sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
  mono: ["Roboto Mono", "monospace"],
},
fontSize: {
  "2xs": ["0.625rem", { lineHeight: "0.875rem" }],  // extra-small label size (10px)
},
```

body declares its own fallback stack independent of Tailwind (see section 3). The .text-mono utility (section 9) uses a different, OS-native mono stack: "SF Mono", Monaco, "Inconsolata", "Roboto Mono", monospace.

---

## 2. CSS custom properties (:root)

Only six variables. These drive the base html/body reset and a handful of raw-CSS rules (spinner border, wallet button text color).

```css
:root {
  --background: #0c0c0e;        /* main app background */
  --foreground: #f4f4f5;        /* primary text */
  --surface: #111113;           /* card surface (declared, rarely referenced directly) */
  --surface-elevated: #18181b;  /* elevated surface (declared) */
  --border: #27272a;            /* default border */
  --muted: #71717a;             /* muted/secondary text */
}
```

> Note: --surface and --surface-elevated are declared but mostly superseded in practice by the Tailwind surface-* scale (section 4). They map 1:1 to surface-850 and surface-800 respectively.

---

## 3. Base resets

```css
* { box-sizing: border-box; }

html {
  font-feature-settings: "cv02", "cv03", "cv04", "cv11"; /* Inter stylistic alternates */
  overflow-x: hidden;
}

body {
  color: var(--foreground);
  background: var(--background);
  font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  min-height: 100vh;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  font-size: 14px;     /* terminal base font size */
  line-height: 1.5;
}
```

Tailwind layer order is set immediately after the font import:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

---

## 4. Full color palette (Tailwind theme.extend.colors)

Reproduce verbatim in the new repo tailwind.config.ts. This is the heart of the design system — utility classes like bg-surface-850, text-win-500, bg-loss-500, text-surface-400 are used everywhere in the terminal.

```ts
colors: {
  // Primary - Muted blue accent (softer, less saturated)
  primary: {
    50:"#eef6fc", 100:"#d5e8f7", 200:"#a8cfed", 300:"#7ab4de", 400:"#5196c9",
    500:"#3a7db0", 600:"#2e6593", 700:"#254f75", 800:"#1c3d5a", 900:"#132c42",
  },
  // Accent - Warm neutral for highlights
  accent: {
    50:"#fafaf9", 100:"#f5f5f4", 200:"#e7e5e4", 300:"#d6d3d1", 400:"#a8a29e",
    500:"#78716c", 600:"#57534e", 700:"#44403c", 800:"#292524", 900:"#1c1917",
  },
  // Surface colors - True neutral grays
  surface: {
    950:"#09090b", // Deepest
    900:"#0c0c0e", // Main background
    850:"#111113", // Card background
    800:"#18181b", // Elevated surface
    700:"#27272a", // Borders
    600:"#3f3f46", // Hover states
    500:"#52525b", // Muted elements
    400:"#71717a", // Secondary text
    300:"#a1a1aa", // Tertiary text
    200:"#d4d4d8", // Light text
    100:"#f4f4f5", // Near white
  },
  // Semantic
  positive: { DEFAULT:"#26A69A", muted:"#00796B", subtle:"rgba(38, 166, 154, 0.1)" },
  negative: { DEFAULT:"#EF5350", muted:"#C62828", subtle:"rgba(239, 83, 80, 0.1)" },
  warning:  { DEFAULT:"#FFA726", muted:"#EF6C00", subtle:"rgba(255, 167, 38, 0.1)" },
  info:     { DEFAULT:"#42A5F5", muted:"#1565C0", subtle:"rgba(66, 165, 245, 0.1)" },
  // Trading colors - Warm palette (used throughout the app)
  win:  { 400:"#4DB6AC", 500:"#26A69A", 600:"#00897B" },
  loss: { 400:"#E57373", 500:"#EF5350", 600:"#E53935" },
  live: { 400:"#E57373", 500:"#EF5350", 600:"#E53935" },
},
```

### Key palette semantics (TERMINAL-relevant)

| Token | Hex | Role in the terminal |
|-------|-----|----------------------|
| surface-900 | #0c0c0e | App background (same as --background) |
| surface-850 | #111113 | Card / panel background (chart, orderbook, order entry) |
| surface-800 | #18181b | Elevated surfaces, table headers, hover fills |
| surface-700 | #27272a | Borders, divider lines |
| surface-600 | #3f3f46 | Hover border state |
| surface-500 | #52525b | Muted elements / focus border |
| surface-400 | #71717a | Secondary text (--muted) |
| surface-300 | #a1a1aa | Tertiary text |
| surface-200 | #d4d4d8 | Light text |
| surface-100 | #f4f4f5 | Near-white text |
| win-500 | #26A69A | Buy / long / positive PnL / bids (warm teal-green) |
| loss-500 | #EF5350 | Sell / short / negative PnL / asks (warm coral-red) |
| warning | #FFA726 | Waiting states, warm orange |
| info | #42A5F5 | Informational blue |
| primary-500 | #3a7db0 | Muted blue accent (range slider thumb, gradient text) |

> Color philosophy: Greens are warm teal (#26A69A), reds are warm coral (#EF5350) — TradingView/Bloomberg style, deliberately NOT neon green/magenta. The raw rgba(38,166,154,...) = green, rgba(239,83,80,...) = red appear inline throughout globals.css.

### Fight/duel-specific colors

- live scale (#E57373/#EF5350/#E53935) is identical to loss and is used for the LIVE fight badge (.badge-live). Not needed for a pure terminal — but harmless to keep.
- The orange/amber gradient family (orange-500 #f97316, amber-500 #f59e0b) used by .btn-glow-*, .hero-bg, .glow-border, .gradient-border comes from Tailwind defaults (not custom) and is associated with the landing/arena/branding layer, not the trading terminal proper. See section 11.

---

## 5. Box shadows (theme.extend.boxShadow)

```ts
boxShadow: {
  "subtle":        "0 1px 2px 0 rgba(0, 0, 0, 0.3)",
  "card":          "0 1px 3px 0 rgba(0, 0, 0, 0.4), 0 1px 2px -1px rgba(0, 0, 0, 0.4)",
  "elevated":      "0 4px 6px -1px rgba(0, 0, 0, 0.4), 0 2px 4px -2px rgba(0, 0, 0, 0.4)",
  "glow-sm":       "0 0 10px rgba(58, 125, 176, 0.3)",
  "glow-primary":  "0 0 20px rgba(58, 125, 176, 0.3)",
  "glow-accent":   "0 0 20px rgba(139, 92, 246, 0.3)",
  "glow-success":  "0 0 20px rgba(38, 166, 154, 0.3)",   // Teal glow
  "glow-orange":   "0 0 20px rgba(249, 115, 22, 0.4)",
  "glow-lg":       "0 0 40px rgba(58, 125, 176, 0.2)",
},
```

Terminal usage: shadow-card (cards), shadow-elevated (modals, dropdowns). The glow-* shadows are mostly landing/arena flourish.

---

## 6. Background images / gradients (theme.extend.backgroundImage)

```ts
backgroundImage: {
  "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
  "gradient-conic":  "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
  "hero-gradient":   "linear-gradient(135deg, rgba(58,125,176,0.1) 0%, rgba(139,92,246,0.1) 100%)",
  "card-gradient":   "linear-gradient(180deg, rgba(255,255,255,0.05) 0%, transparent 100%)",
},
```

hero-gradient is landing-only. gradient-radial/card-gradient are generic.

---

## 7. Animations and keyframes

### 7a. Tailwind-registered animations (theme.extend.animation + keyframes)

These become utility classes (animate-fade-in, animate-sheet-up, etc.).

```ts
animation: {
  "fade-in":    "fadeIn 0.15s ease-out",
  "slide-up":   "slideUp 0.2s ease-out",
  "sheet-up":   "sheetUp 0.45s cubic-bezier(0.32, 0.72, 0, 1)",
  "sheet-down": "sheetDown 1s cubic-bezier(0.32, 0.72, 0, 1) forwards",
  "fade-out":   "fadeOut 1s ease-in forwards",
  "pulse-glow": "pulseGlow 2s ease-in-out infinite",
  "float":      "float 6s ease-in-out infinite",
  "shimmer":    "shimmer 2s linear infinite",
  "ticker":     "ticker 30s linear infinite",
},
keyframes: {
  fadeIn:    { "0%": { opacity:"0" }, "100%": { opacity:"1" } },
  slideUp:   { "0%": { transform:"translateY(4px)", opacity:"0" }, "100%": { transform:"translateY(0)", opacity:"1" } },
  sheetUp:   { "0%": { transform:"translateY(100%)" }, "100%": { transform:"translateY(0)" } },
  sheetSlide:{ "0%": { transform:"translateY(100%)" }, "100%": { transform:"translateY(0)" } }, // declared, no matching animation
  sheetDown: { "0%": { transform:"translateY(0)" }, "100%": { transform:"translateY(100%)" } },
  fadeOut:   { "0%": { opacity:"1" }, "100%": { opacity:"0" } },
  pulseGlow: { "0%, 100%": { boxShadow:"0 0 20px rgba(58,125,176,0.3)" }, "50%": { boxShadow:"0 0 40px rgba(58,125,176,0.5)" } },
  float:     { "0%, 100%": { transform:"translateY(0px)" }, "50%": { transform:"translateY(-10px)" } },
  shimmer:   { "0%": { backgroundPosition:"-200% 0" }, "100%": { backgroundPosition:"200% 0" } },
  ticker:    { "0%": { transform:"translateX(0)" }, "100%": { transform:"translateX(-50%)" } },
},
```

Terminal-relevant animations: fade-in, slide-up, sheet-up/sheet-down (mobile bottom-sheets for order entry / position panels on mobile), shimmer (skeleton loaders), ticker (market-data marquee). pulse-glow/float are decorative/landing.

### 7b. Raw @keyframes in globals.css

Minimal/terminal animations (globals.css lines 504-526):

```css
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slideUp {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}

.animate-fadeIn  { animation: fadeIn 150ms ease-out; }   /* note: camelCase, distinct from Tailwind animate-fade-in */
.animate-slideUp { animation: slideUp 200ms ease-out; }
```

> WARNING: There are two fade animations: Tailwind animate-fade-in (kebab) and the raw animate-fadeIn (camel). Same for slide. Keep both names to avoid breaking callers.

VS-Arena animations (globals.css lines 794-975) — FIGHT/DUEL-SPECIFIC, exclude from a pure terminal (the VS intro screen, spark/beam effects for fight start). Listed here so the migrator knows they are safe to drop:

| @keyframes | Utility class | Purpose |
|------------|---------------|---------|
| slide-in-left | .animate-slide-in-left | fighter card entry |
| slide-in-right | .animate-slide-in-right (delay 0.2s) | fighter card entry |
| pulse-glow (orange drop-shadow) | .animate-pulse-glow | VS badge glow |
| spin-slow | .animate-spin-slow (8s) | rotating ring |
| gradient-x | .animate-gradient-x | animated gradient text |
| spark-1/2/3 | .animate-spark-1/2/3 | clash sparks |
| beam-left / beam-right | .animate-beam-left/right | energy beams |
| float-up | .animate-float-up | floating particles |

These reference rgba(249, 115, 22, ...) (orange) and are tied to the arena visual identity.

Animated gradient border (globals.css lines 614-635, uses Tailwind shimmer):

```css
.gradient-border::before {
  content: "";
  position: absolute; inset: 0; padding: 1px; border-radius: inherit;
  background: linear-gradient(90deg, #f97316, #f59e0b, #f97316);
  background-size: 200% 100%;
  animation: shimmer 3s linear infinite;
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
}
```

---

## 8. Component classes (@layer components)

These are the reusable UI primitives. Defined inside @layer components so they can be overridden by utilities.

### 8a. Cards

```css
.card             { @apply bg-surface-850 border-surface-800 rounded-none; }
.card-elevated    { @apply bg-surface-800 border border-surface-800 rounded-none shadow-card; }
.card-interactive { @apply card transition-colors duration-150 cursor-pointer; }
.card-interactive:hover { @apply bg-surface-800 border-surface-600; }
```

> Cards are intentionally square (rounded-none) — the terminal aesthetic.

### 8b. Buttons

```css
.btn {
  @apply inline-flex items-center justify-center px-4 py-2 font-medium text-sm rounded transition-colors duration-150;
  @apply disabled:opacity-50 disabled:cursor-not-allowed;
}
.btn-primary   { @apply btn bg-orange-500 text-white; @apply hover:bg-orange-600; }
.btn-secondary { @apply btn bg-surface-700 text-zinc-200 border-surface-600; @apply hover:bg-surface-600; }
.btn-ghost     { @apply btn bg-transparent text-surface-400; @apply hover:text-zinc-200 hover:bg-surface-800; }
.btn-danger    { @apply btn bg-red-500 text-white; @apply hover:bg-red-600; }
.btn-success   { @apply btn bg-green-500 text-white; @apply hover:bg-green-600; }
.btn-lg        { @apply px-6 py-3 text-base; }
.btn-sm        { @apply px-3 py-1.5 text-xs; }
```

> .btn-primary uses Tailwind default orange-500 (#f97316) — this is the brand accent, also the arena color. For a neutral terminal you may re-point this to primary-500. .btn-danger/.btn-success use Tailwind default red/green, NOT the warm loss/win scale.

### 8c. Badges

```css
.badge          { @apply inline-flex items-center px-2 py-0.5 text-xs font-medium rounded; }
.badge-live     { @apply badge text-loss-500;  background-color: rgba(239, 83, 80, 0.1); }   /* FIGHT: live fight */
.badge-waiting  { @apply badge text-warning;   background-color: rgba(255, 167, 38, 0.1); }   /* FIGHT: waiting */
.badge-finished { @apply badge bg-surface-700 text-surface-400; }                              /* FIGHT: finished */
.badge-win      { @apply badge text-win-500;   background-color: rgba(38, 166, 154, 0.1); }   /* FIGHT: win */
.badge-loss     { @apply badge text-loss-500;  background-color: rgba(239, 83, 80, 0.1); }   /* FIGHT: loss */
```

> All .badge-* variants except the base .badge are fight/duel-specific (live/waiting/finished/win/loss are fight states). The base .badge is generic and reusable.

### 8d. Inputs and selects

```css
.input {
  @apply w-full border-surface-800 rounded px-3 py-2 text-zinc-100;
  background-color: #1c1c23;     /* slightly purple-tinted dark input bg */
  @apply placeholder:text-surface-500 transition-colors duration-150;
  @apply focus:outline-none focus:border-surface-500;
}
/* Hide native number spinners */
.input[type="number"]::-webkit-outer-spin-button,
.input[type="number"]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.input[type="number"] { -moz-appearance: textfield; }

.select {
  @apply input appearance-none cursor-pointer;
  /* inline chevron SVG data-URI, stroke = %2371717a (surface-400), path M19 9l-7 7-7-7; see source line 178 */
  background-image: url("data:image/svg+xml,...chevron-down...");
  background-position: right 0.5rem center;
  background-repeat: no-repeat;
  background-size: 1rem;
  padding-right: 2rem;
}
```

> Order-entry amount/price fields rely on the number-spinner hiding above. Copy the .select chevron data-URI verbatim from globals.css line 178.

### 8e. Pro table (positions / orders / trades tables)

```css
.table-pro               { @apply w-full text-sm; }
.table-pro thead         { @apply bg-surface-800; }
.table-pro th            { @apply px-3 py-2 text-left text-xs font-medium text-surface-400 uppercase tracking-wide; }
.table-pro tbody tr      { @apply border-t border-surface-800; }
.table-pro tbody tr:hover{ @apply bg-surface-850; }
.table-pro td            { @apply px-3 py-2.5; }
```

---

## 9. PnL / directional color helpers (raw CSS, outside @layer)

```css
.text-positive  { @apply text-win-500; }
.text-negative  { @apply text-loss-500; }
.pnl-positive   { @apply text-win-500; }
.pnl-negative   { @apply text-loss-500; }
.bg-positive-subtle { background-color: rgba(38, 166, 154, 0.1); }
.bg-negative-subtle { background-color: rgba(239, 83, 80, 0.1); }
```

Other utilities:

```css
.tabular-nums { font-variant-numeric: tabular-nums; }   /* aligned digits for prices/sizes */
.text-mono    { font-family: "SF Mono", Monaco, "Inconsolata", "Roboto Mono", monospace; }
```

---

## 10. Misc terminal components (raw CSS)

### Avatar

```css
.avatar {
  @apply rounded-full bg-surface-700;
  @apply flex items-center justify-center font-medium text-zinc-300;
}
```

### Modal

```css
.modal-overlay { @apply fixed inset-0 bg-black/60; @apply flex items-center justify-center z-50; }
.modal-content { @apply bg-surface-850 border border-surface-800 rounded-lg; @apply shadow-elevated max-w-md w-full mx-4; }
```

### Spinner

```css
.spinner {
  @apply w-5 h-5 rounded-full animate-spin;
  border-width: 2px;
  border-color: #27272a;       /* surface-700 */
  border-top-color: #71717a;   /* surface-400 */
}
```

### Navigation

```css
.nav-link        { @apply text-surface-400 hover:text-zinc-100 transition-colors duration-150 text-sm font-medium; }
.nav-link.active { @apply text-zinc-100; }
```

### Range slider (used by leverage / order-size sliders)

```css
input[type="range"] {
  -webkit-appearance: none; appearance: none; cursor: pointer;
  @apply h-2 rounded-full bg-surface-700;
}
input[type="range"]::-webkit-slider-runnable-track { @apply h-2 rounded-full; background: transparent; }
input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none; appearance: none;
  @apply w-4 h-4 rounded-full bg-primary-500 border-2 border-surface-800;
  margin-top: -4px;
  transition: transform 150ms ease;
}
input[type="range"]::-webkit-slider-thumb:hover { transform: scale(1.1); }
input[type="range"]::-moz-range-track { @apply h-2 rounded-full; background: transparent; }
input[type="range"]::-moz-range-thumb { @apply w-4 h-4 rounded-full bg-primary-500 border-2 border-surface-800; border: none; }
```

---

## 11. Landing / arena-flavored utilities (NOT terminal)

These exist in globals.css (lines ~566-792) but belong to the marketing/landing/arena surface. The migrator can skip these unless porting the homepage. Listed so they are not mistaken for terminal styles. They predominantly use Tailwind-default orange/amber/violet and gradients.

| Class | Group |
|-------|-------|
| .text-gradient-primary, .text-gradient-gold, .text-gradient-orange | gradient text |
| .glass-card, .glass-card-dark | glassmorphism |
| .glow-border, .gradient-border | animated/glow borders |
| .btn-glow-primary, .btn-glow-orange, .btn-outline-glow | CTA buttons |
| .feature-card, .feature-card-glow, .stats-card, .ticker-card, .blog-card, .blog-card-image | landing cards |
| .dropdown-menu, .dropdown-trigger, .dropdown-item | hover dropdowns |
| .faq-item, .faq-trigger, .faq-content | FAQ accordion |
| .newsletter-input | newsletter form |
| .hero-bg, .chart-container (landing variant), .logo-grid, .logo-badge, .trust-badge, .section-badge, .section-title, .section-subtitle | section chrome |

> WARNING - Name collision: .chart-container is defined twice with different meaning:
> - in globals.css (line ~756) as a landing decorative gradient box, AND
> - in tradingview-custom.css as a TradingView widget DOM selector (background-color: #111113 !important).
> In the terminal, the TradingView-widget meaning is the relevant one (the widget injects its own .chart-container in its DOM). Be careful not to let the landing rule leak onto the chart.

---

## 12. Scrollbar styling

The terminal hides scrollbars globally while keeping scroll functional:

```css
/* globals.css lines 45-52 */
::-webkit-scrollbar { display: none; }   /* Chrome/Safari/Edge */
* { scrollbar-width: none; }             /* Firefox */
```

Plus an explicit opt-in utility (used on inner scroll panes like orderbook/positions lists):

```css
.scrollbar-hide {
  -ms-overflow-style: none;  /* IE and Edge */
  scrollbar-width: none;     /* Firefox */
}
.scrollbar-hide::-webkit-scrollbar { display: none; }
```

---

## 13. Sonner toast override

The app uses Sonner for toasts. One global override:

```css
[data-sonner-toast][data-styled=true] [data-description] {
  color: #c7c7c7 !important;
}
```

External dep: sonner (npm). The Toaster is mounted elsewhere (layout); only this color tweak lives in globals.css.

---

## 14. Solana Wallet-Adapter overrides (Pacifica connect flow)

globals.css lines ~244-440 restyle @solana/wallet-adapter-react-ui to match the Pacifica-style dark UI. Terminal-relevant because connecting a Solana wallet is required for Pacifica trading. Key rules (abbreviated — full block is verbatim in source):

```css
/* Header connect button */
.wallet-adapter-button {
  background-color: transparent !important;
  border: 1px solid #1f1f20 !important;
  border-radius: 4px !important;
  font-weight: 500 !important; font-size: 14px !important;
  padding: 8px 16px !important; color: #f4f4f5 !important;
  transition: all 150ms !important; height: auto !important; line-height: 1.5 !important;
}
.wallet-adapter-button:hover { background-color: #1c1c1f !important; border-color: #212124 !important; }

/* Truncate address only in navbar */
.wallet-compact .wallet-adapter-button {
  overflow: hidden !important; text-overflow: ellipsis !important;
  white-space: nowrap !important; max-width: 160px !important;
}
.wallet-adapter-dropdown-list { z-index: 9999 !important; }   /* above header */

/* Modal */
.wallet-adapter-modal { background: rgba(0,0,0,0.5) !important; backdrop-filter: blur(8px) !important; -webkit-backdrop-filter: blur(8px) !important; }
.wallet-adapter-modal-overlay { background: transparent !important; }
.wallet-adapter-modal-wrapper {
  background: #1f1f23 !important; border: none !important; border-radius: 16px !important;
  box-shadow: 0 24px 48px rgba(0,0,0,0.5) !important; max-width: 380px !important; width: 100% !important;
  padding: 0 !important; overflow: hidden !important;
}
.wallet-adapter-modal-title { color: #fff !important; font-weight: 600 !important; font-size: 16px !important; text-align: center !important; padding: 24px 48px 20px !important; }

/* Detected badge styled green (uses brand teal #26A69A) */
.wallet-adapter-modal-list .wallet-adapter-button span {
  margin-left: auto !important; font-size: 11px !important; font-weight: 600 !important;
  background: rgba(38, 166, 154, 0.15) !important; color: #26A69A !important;
  padding: 4px 10px !important; border-radius: 4px !important;
  text-transform: uppercase !important; letter-spacing: 0.5px !important;
}

/* Hidden bits */
.wallet-adapter-modal-list-more,
.wallet-adapter-modal-collapse-button,
.wallet-adapter-modal-middle { display: none !important; }
```

Responsive (mobile/tablet) compact wallet button:

```css
@media (max-width: 1199px) {
  .wallet-compact .wallet-adapter-button { padding: 6px 10px !important; font-size: 12px !important; }
  .wallet-compact .wallet-adapter-button-start-icon,
  .wallet-compact .wallet-adapter-button-start-icon img { width: 16px !important; height: 16px !important; margin-right: 4px !important; }
}
```

External deps: @solana/wallet-adapter-react-ui (provides the .wallet-adapter-* base classes these override). The .wallet-compact wrapper class must be applied by the navbar component.

---

## 15. TradingView chart theming (public/tradingview-custom.css)

This file overrides the internal DOM of the TradingView Advanced Charts widget so its background/borders match surface-850 (#111113). It is loaded by the chart component (referenced via the widget custom_css_url / injected stylesheet — verify in the chart doc). Reproduced verbatim:

```css
/* TradingView Custom Styles */

/* Force background color */
.chart-container, .chart-controls-bar, .chart-markup-table, .pane, .chart-page, .layout__area--center {
  background-color: #111113 !important;
}
/* Price scale background */
.price-axis-container, .pane-legend { background-color: #111113 !important; }
/* Time axis background */
.time-axis-container { background-color: #111113 !important; }
/* Toolbar background */
.group-wWM3zP_M- { background-color: #111113 !important; }
/* Make chart borders match background */
.chart-container, .layout__area--center, .layout__area--right, .layout__area--bottom, .layout__area--left, .layout__area--top {
  border-color: #111113 !important;
}
/* Price scale / time axis borders */
.price-axis-container { border-color: #111113 !important; }
.time-axis-container  { border-color: #111113 !important; }
/* Pane separators */
.pane-separator { background-color: #111113 !important; border-color: #111113 !important; }
/* Chart wrapper cells */
.chart-markup-table td { border-color: #111113 !important; }
/* Layout area borders */
[class*="borderTop"], [class*="borderBottom"], [class*="borderLeft"], [class*="borderRight"] {
  border-color: #111113 !important;
}
```

> WARNING - Fragile selector: .group-wWM3zP_M- is a TradingView build-hashed class name and may change when the TradingView library is upgraded. Re-verify after any TV version bump.

---

## 16. Migration checklist (this doc)

1. Port tailwind.config.ts theme.extend (colors, fonts, fontSize, boxShadow, backgroundImage, animation, keyframes) verbatim — sections 4-7.
2. Port globals.css: font @import, :root vars, base resets, scrollbar hide, component layer (cards/buttons/badges/inputs/tables), PnL helpers, avatar/modal/spinner/nav/range-slider, sonner override, wallet-adapter overrides.
3. Port public/tradingview-custom.css for the chart (section 15).
4. Strip the VS-Arena keyframes/utilities (section 7b) and the landing/arena utilities (section 11) if not porting the homepage.
5. Decide whether .btn-primary stays orange-500 (brand) or switches to primary-500 (neutral terminal).
6. Resolve the .chart-container name collision (section 11) so the landing gradient does not bleed into the TV widget.
