# Trade Page Layout & Composition

Part of the Trading Terminal Migration set — see [README](./README.md).

Source file: `apps/web/src/app/trade/page.tsx` (~4047 lines, single client component `TradePageContent`).

This document covers ONLY the page-level **composition and layout** — the panel grid, the top market-info bar, the chart/orderbook/order-entry/positions placement, mobile tab switching, the bottom sheet, responsive breakpoints, and the modals. The internals of each child (chart, orderbook, order form fields, positions table) are documented in sibling docs. Every place where fight/duel UI is woven into the layout is flagged in section 8.

---

## 1. Top-level structure

The whole page is wrapped and exported like this (bottom of the file):

```tsx
function TradePage() {
  return (
    <Suspense fallback={<TradePageLoading />}>   {/* spinner */}
      <TradePageContent />
    </Suspense>
  );
}
```

`Suspense` is required because the component calls `useSearchParams()` at the top (Next.js app-router requirement). `TradePageLoading` is a centered spinner on `bg-surface-900`.

The JSX returned by `TradePageContent` is wrapped in two providers, in order:

```tsx
return (
  <BetaGate>          {/* gate — STRIP or replace, see section 8 */}
  <AppShell>          {/* header + wallet + global chrome — KEEP */}
    <FightBanner />            {/* FIGHT — strip */}
    <ActiveFightsSwitcher />   {/* FIGHT — strip */}
    <div className="w-full px-1 py-1 touch-pan-y min-h-[calc(100vh-3rem)] max-[1199px]:pb-[60px]"
         style={{ overflowAnchor: 'none' }}>
      {/* MOBILE layout  (xl:hidden) */}
      {/* DESKTOP layout (hidden xl:grid) */}
    </div>
    {/* Mobile sticky Buy/Sell bar (xl:hidden, fixed) */}
    {/* Mobile order bottom-sheet (conditional) */}
    {/* Modals: CloseOpposite, Withdraw, EditOrder, MarginMode, Slippage */}
    <AiBiasWidget ... />       {/* optional feature — strip if unwanted */}
  </AppShell>
  </BetaGate>
);
```

Key wrapper classNames on the main container:
- `min-h-[calc(100vh-3rem)]` — fills viewport below the 3rem (`h-12`) AppShell header.
- `max-[1199px]:pb-[60px]` — reserves bottom space on mobile so the fixed Buy/Sell bar never overlaps content.
- `style={{ overflowAnchor: 'none' }}` — disables browser scroll-anchoring so live WebSocket re-renders (prices, orderbook, positions) don't make the page jump. Repeated on the `FightBanner`/`ActiveFightsSwitcher` wrappers for the same reason.

Two completely separate layout trees are rendered and toggled purely with Tailwind visibility utilities (no JS media query):

| Tree | Wrapper className | Active when |
|------|-------------------|-------------|
| Mobile (CEX-style) | `xl:hidden flex flex-col gap-1` | viewport `< 1280px` (`xl` breakpoint) |
| Desktop (5-col grid) | `hidden xl:grid xl:grid-cols-5 gap-1 h-full` | viewport `>= 1280px` |

> Tailwind default breakpoints. Relevant ones: `xl` = **1280px**, plus the arbitrary `max-[1199px]` / `min-[1200px]` (1199/1200px) used inside the Positions/tables area to switch between mobile **card lists** and desktop **tables**. Note the mismatch: outer layout flips at 1280px but the inner tables flip at 1200px.

---

## 2. Desktop layout (>= 1280px) — ASCII sketch

```
+--------------------------------- AppShell header (h-12 / 3rem) ---------------------------------+
+------------------------------------------------------------------------------------------------+
| [FightBanner]  (strip)                                                                         |
| [ActiveFightsSwitcher]  (strip)                                                                |
+------------------------------------------------------------------------------------------------+
|  xl:grid xl:grid-cols-5  (5 columns, gap-1)                                                    |
| +--------------------------------- col-span-4 ----------------------+ +------ col-span-1 -----+ |
| | left column wrapper (flex flex-col gap-1, order-1)               | | RIGHT COLUMN          | |
| | +------------- inner grid: grid-cols-12 gap-1 -----------------+ | | order-2 row-span-2    | |
| | | +-- col-span-3 --+ +------------- col-span-9 -------------+ | | | min-h-[1104px]        | |
| | | |  ORDER BOOK    | |  CHART HEADER (MarketSelector+stats) | | | | "Place Order"         | |
| | | |  <OrderBook>   | | ------------------------------------ | | | |  - Cross/Iso toggle   | |
| | | |  (order-2)     | |  <TradingViewChartAdvanced h=650>    | | | |  - order type tabs    | |
| | | |                | |    + quick-order overlay (order-1)   | | | |  - Buy/Sell toggle    | |
| | | +----------------+ +--------------------------------------+ | | |  - Fight Cap.(strip)  | |
| | +-------------------------------------------------------------+ | |  - Leverage slider    | |
| | +----------- POSITIONS PANEL (order-4, min-h-[400px]) -------+ | |  - Size / Price       | |
| | | Tabs: Positions|Open Orders|Trades|History [All|Fight](str)| | |  - TP / SL            | |
| | | <Positions> / orders / trades / order-history tables       | | |  - Place Order btn    | |
| | +-----------------------------------------------------------+ | +----------------------+ |
| +-----------------------------------------------------------------+                          |
+------------------------------------------------------------------------------------------------+
```

### Grid mechanics

Outer: `xl:grid xl:grid-cols-5` with two children:

1. **Left column wrapper** — `col-span-4 flex flex-col gap-1 order-1 h-full`. Two stacked blocks:
   - **Top row** — nested `grid grid-cols-12 gap-1`:
     - **Order Book** — `col-span-3 order-2 card overflow-hidden h-full flex flex-col` (`style={{ contain: 'layout' }}`). Header `<h3>Order Book</h3>`, then a scroll area `flex-1 overflow-y-auto overscroll-y-auto isolate` (`contain: 'strict'`) wrapping `<OrderBook>`.
     - **Chart** — `col-span-9 order-1 card overflow-hidden`. Contains the **chart header** market-info row and the chart container `h-[650px] relative` with `<TradingViewChartAdvanced height={650}>` plus the quick-order overlay.
   - **Positions panel** — `order-4 card min-h-[400px] flex flex-col overflow-hidden` (`contain: 'strict'`). Tab bar + table/list body.
2. **Right column (Place Order)** — `col-span-1 order-2 row-span-2 min-h-[1104px] flex flex-col overflow-hidden card` (`contain: 'layout'`). `row-span-2` makes the order form span full height alongside both the chart row and the positions panel.

> The `order-*` utilities are mostly redundant given DOM order; leftovers. Load-bearing pieces are the col-spans (`5 -> 4+1`, inner `12 -> 3+9`) and `row-span-2` on the order panel.

### Desktop chart-header market info (line ~1673)

A horizontal `flex items-center gap-6 text-sm` row: `<MarketSelector>` then six labeled stat columns — **Last Price**, **Mark**, **24h Change** (green/red), **24h Volume**, **Open Interest**, **Next Funding / Countdown** (green/red). Values come from `usePrices` `getPrice(selectedMarket)` destructured near the top (`currentPrice`, `markPrice`, `priceChange`, `volume24h`, `openInterest`, `nextFundingRate`).

---

## 3. Mobile layout (< 1280px) — ASCII sketch

```
+------------- AppShell header -------------+
| [FightBanner] [ActiveFightsSwitcher]      |  (strip both)
+-------------------------------------------+
| MARKET INFO BAR (card)                    |
|  <MarketSelector>  price  %chg   [v]      |  <- chevron toggles expandable stats grid
|  (expanded: Mark | 24h Vol | OI | Funding)|
+-------------------------------------------+
| SECTION TABS (card): Chart|Order Book|Info|  <- mobileSection state
+-------------------------------------------+
| SECTION CONTENT (card overflow-hidden)    |
|   chart    -> <TradingViewChartAdvanced h=400>   (h-[400px])
|   orderbook-> <OrderBook>                        (h-[500px] scroll)
|   info     -> 2-col grid of stat tiles (incl. Maker/Taker fee)
+-------------------------------------------+
| POSITIONS PANEL (card h-[calc(100vh-16rem)])     |
|  Tabs: Positions|Orders|Trades|History [All|Fight]|  (fight toggle strip)
|  card-list rows (mobile) instead of tables        |
+-------------------------------------------+
   +---- FIXED bottom-14, z-40 ----+
   |  [Buy / Long]   [Sell / Short]|  <- opens bottom sheet
   +-------------------------------+
   (Order form lives in a bottom SHEET, not inline)
```

Mobile differences from desktop:
- **No inline order form.** Place-Order form is in a bottom **sheet** (`showOrderSheet`) opened by the fixed Buy/Sell bar. The sheet duplicates the exact desktop order-form markup.
- **Chart / Order Book / Info are mutually exclusive**, driven by `mobileSection` state (`'chart' | 'orderbook' | 'info'`).
- Tables become **card lists** below `max-[1199px]` (each table block has a `max-[1199px]:block hidden` card variant and an `overflow-x-auto max-[1199px]:hidden` table variant).

### Mobile section tab switcher (line ~1181)

```tsx
const [mobileSection, setMobileSection] =
  useState<'chart' | 'orderbook' | 'info'>('chart');

<div className="card flex items-center">
  {(['chart', 'orderbook', 'info'] as const).map((tab) => (
    <button key={tab} onClick={() => setMobileSection(tab)}
      className={`flex-1 py-2.5 text-xs font-medium text-center transition-colors border-b-2 ${
        mobileSection === tab
          ? 'text-surface-200 border-surface-300'
          : 'text-surface-400 border-transparent hover:text-white'}`}>
      {tab === 'chart' ? 'Chart' : tab === 'orderbook' ? 'Order Book' : 'Info'}
    </button>
  ))}
</div>
```

### Mobile sticky Buy/Sell bar (line ~3361)

```tsx
<div className="xl:hidden fixed bottom-14 left-0 right-0 z-40 bg-surface-900 border-surface-800 px-3 py-2 flex gap-3">
  <button onClick={() => { setSelectedSide('LONG'); setShowOrderSheet(true); }}
    className="flex-1 py-3 rounded-lg bg-win-500 hover:bg-win-400 text-white font-bold text-sm">Buy / Long</button>
  <button onClick={() => { setSelectedSide('SHORT'); setShowOrderSheet(true); }}
    className="flex-1 py-3 rounded-lg bg-[#e8566d] hover:bg-[#ec6b7e] text-white font-bold text-sm">Sell / Short</button>
</div>
```
`bottom-14` (3.5rem) sits above the AppShell mobile bottom nav. The Sell button uses a hardcoded hex `#e8566d` instead of the `loss-500` token (worth normalizing on migration).

### Mobile order bottom-sheet (line ~3377)

Animated sheet with backdrop. Open/close is a two-phase transition controlled by `showOrderSheet` (mount) + `orderSheetVisible` (transform):

```tsx
const [showOrderSheet, setShowOrderSheet] = useState(false);
const [orderSheetVisible, setOrderSheetVisible] = useState(false);

// Open: mount -> next frame set visible (slide in)
useEffect(() => {
  if (showOrderSheet) {
    requestAnimationFrame(() => requestAnimationFrame(() => setOrderSheetVisible(true)));
  }
}, [showOrderSheet]);

// Close: invisible -> wait 500ms -> unmount
const closeOrderSheet = useCallback(() => {
  setOrderSheetVisible(false);
  setTimeout(() => setShowOrderSheet(false), 500);
}, []);
```

Sheet structure:
- Outer `xl:hidden fixed inset-0 z-[70]`.
- Backdrop `absolute inset-0 bg-black/60 transition-opacity duration-500` (opacity bound to `orderSheetVisible`).
- Sheet wrapper `absolute left-0 right-0 bottom-0 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]` with `transform: translateY(0|100%)`.
- Content `bg-surface-900 rounded-t-2xl max-h-[85vh] overflow-y-auto pb-4` with a sticky drag-handle header (`w-10 h-1 bg-surface-600 rounded-full`).

> WARNING: The full order form is **duplicated** verbatim between the desktop right column (approx lines 2451-3357) and the mobile sheet (approx lines 3422 onward). When rebuilding, extract one `<OrderEntryPanel>` and render it in both places.

---

## 4. Component-placement table

| Component / block | Import | Desktop slot | Mobile slot | Notes |
|---|---|---|---|---|
| `AppShell` | `@/components/AppShell` | wraps everything | same | Header, wallet, bottom nav. **Keep.** |
| `BetaGate` | `@/components/BetaGate` | outermost wrapper | same | Beta access gate. **Strip/replace.** |
| `FightBanner` | `@/components/FightBanner` | below header | same | **FIGHT — strip.** Renders null/empty when no fight. |
| `ActiveFightsSwitcher` | `@/components/ActiveFightsSwitcher` | below banner | same | **FIGHT — strip.** Returns `<div className="h-0 overflow-hidden"/>` when no active fights. |
| `MarketSelector` | `@/components/MarketSelector` | chart header (col-9) | market-info bar | Symbol dropdown. Receives `blockedSymbols` (fight). |
| `TradingViewChartAdvanced` | `@/components/TradingViewChartAdvanced` | col-9, `height={650}` | section `chart`, `height={400}` | `onQuickOrder`, `onWidgetReady={setTvWidget}`. |
| `OrderBook` | `@/components/OrderBook` | col-3 | section `orderbook` | Props: `symbol, currentPrice, oraclePrice, tickSize`. |
| `Positions` | `@/components/Positions` | positions panel (Positions tab) | same | Many close/TP-SL callbacks. |
| Orders / Trades / History tables | inline JSX | positions panel | card-list variants | `max-[1199px]` flips table/cards. |
| Order-entry form | inline JSX | right column | bottom sheet (duplicated) | Extract into one component. |
| `CloseOppositeModal` | `@/components/CloseOppositeModal` | conditional modal | same | Shown when opening opposite-side position. |
| `WithdrawModal` | `@/components/WithdrawModal` | modal | same | `availableBalance` from `account`. |
| `EditOrderModal` | `@/components/EditOrderModal` | modal | same | Edit a LIMIT order's price/size. |
| Margin-mode modal | inline JSX | modal `z-[80]` | same | Cross/Isolated radio confirm. |
| Slippage modal | inline JSX | modal `z-50` | same | Sets `slippage` (default `0.5`). |
| `AiBiasWidget` | `@/components/AiBiasWidget` | floating widget | same | Draws on chart via shared `tvWidget`. Optional — strip if out of scope. |

### Child props (copy-paste from the page)

```tsx
<OrderBook symbol={selectedMarket} currentPrice={currentPrice} oraclePrice={currentPrice} tickSize={tickSize} />

<TradingViewChartAdvanced
  symbol={selectedMarket}
  height={650}                              /* 400 on mobile */
  currentPrice={currentPrice}
  onQuickOrder={handleChartQuickOrder}      /* (price, 'LONG'|'SHORT', clickY?) */
  onWidgetReady={setTvWidget}
/>

<MarketSelector
  markets={markets.length > 0 ? markets : [DEFAULT_MARKET]}
  selectedMarket={selectedMarket}
  onSelectMarket={handleMarketChange}
  getPrice={getPrice}
  blockedSymbols={inFight ? blockedSymbols : []}   /* FIGHT — pass [] when stripping */
/>

<WithdrawModal isOpen={showWithdrawModal} onClose={...} availableBalance={...} />
<EditOrderModal isOpen={showEditOrderModal} onClose={...} order={editingOrder} />
<AiBiasWidget selectedMarket={selectedMarket} currentPrice={currentPrice} tvWidget={tvWidget} />
```

`DEFAULT_MARKET = { symbol: 'BTC-USD', name: 'Bitcoin', maxLeverage: 50 }`.

---

## 5. Bottom-tab navigation (Positions panel)

State + URL persistence (shared by desktop and mobile panels):

```tsx
type BottomTab = 'positions' | 'orders' | 'trades' | 'history';
const [bottomTab, setBottomTabState] = useState<BottomTab>(getBottomTabFromUrl);
```
- Tab is mirrored to the URL query `?tab=` (the default `positions` is omitted from the URL).
- A `useEffect` re-syncs `bottomTab` when `searchParams` changes (browser back/forward).
- Tab buttons share active style `text-surface-200 border-surface-300` vs inactive `text-surface-400 border-transparent hover:text-white`, with a count badge `bg-surface-700 px-1.5 py-0.5 rounded`.

Body wrapper toggles overflow by tab:
```tsx
<div className={`flex-1 ${bottomTab === 'positions'
  ? 'flex flex-col overflow-hidden'
  : 'overflow-y-auto overflow-x-auto overscroll-y-auto'}`}>
```

---

## 6. URL / query-param contract

`handleMarketChange` and `setBottomTab` use `router.replace(url, { scroll: false })` (shallow, no scroll jump). Recognized query params:

| Param | Meaning | Set by |
|---|---|---|
| `symbol` | selected market, e.g. `ETH-USD` | `handleMarketChange`; read on mount into `selectedMarket` |
| `tab` | bottom tab (`orders`/`trades`/`history`; omitted for `positions`) | `setBottomTab` |
| `fight` | **FIGHT** — active fight id, preserved across market changes | external; read in `handleMarketChange` to preserve it |

> When stripping fights, drop the `fight` param. `handleMarketChange` builds `/trade?fight=${id}&symbol=${symbol}` when a fight id is present — simplify to `/trade?symbol=${symbol}`.

Page `document.title` is set in an effect to `${asset} - Trade - Trading Fight Club` (rename on migration).

---

## 7. z-index map (for re-implementation)

| Layer | z-index |
|---|---|
| Mobile sticky Buy/Sell bar | `z-40` |
| Slippage modal | `z-50` |
| Mobile order sheet | `z-[70]` |
| Quick-order chart overlay | `z-20` (within chart) |
| Margin-mode modal | `z-[80]` |
| Sheet sticky header (within sheet) | `z-10` |

---

## 8. Fight entanglements — how to strip them

The terminal works standalone; fight logic is **additive** and removable cleanly. Exact spots in `page.tsx`:

| Location | What it is | How to remove |
|---|---|---|
| L13-14 imports | `FightBanner`, `ActiveFightsSwitcher` | Remove imports + the two `<div style={overflowAnchor}>` wrappers at L1109-1117. |
| L22 import | `AiBiasWidget` (AI-bias feature, not core) | Remove import + `<AiBiasWidget>` at L4026 if out of scope. |
| Hooks (L83-94) | `useFight`, `useStakeInfo`, `useFightPositions`, `useFightTrades`, `useFightOrders`, `useFightOrderHistory` | Delete these calls and everything derived from `fightId`, `inFight`, `inActiveFight`, `stake`, `availableStake`, `currentExposure`, `maxExposureUsed`, `blockedSymbols`, `fightMaxSize`. |
| `isSymbolBlocked` (L106) + auto-switch effect (L275) | Auto-redirects away from "blocked" symbols during a fight | Remove the `useMemo` and the `useEffect`. |
| `handleMarketChange` (L112) | Preserves `?fight=` in URL | Simplify to always `/trade?symbol=${symbol}`. |
| `showFightOnly` / `showFightCapital` state (L266-268) | Fight-only data toggle + Fight Capital accordion | Remove both. |
| Active-data selectors (L1078-1099) | `fightFilteredPositions`, the `showFightOnly && fightId ? fightX : X` ternaries for `activePositions/activeTrades/activeOpenOrders/activeOrderHistory`, plus `fightPnl/fightMargin/fightRoi` | Replace each `activeX` with the plain source (`displayPositions`, `tradeHistory`, `openOrders`, `orderHistoryData`). Drop the fight PnL aggregates. |
| `[All / Fight only]` toggle in Positions tab header (desktop L1830, mobile L1296) | Pill group wrapped in `{fightId && (...)}` | Delete the whole pill `<div>`. |
| Fight Capital accordion (L2583-2633) | `{inFight && stake !== null && (...)}` block inside the order panel (and its mobile-sheet twin) | Delete the block in both copies. |
| Order submission (L450, L468, L502, L624, L742, L820-862) | `fightId: fightId || undefined` passed to every order mutation; `isPreFightFlip` flag in `handleClosePosition` | Remove the `fightId` props and the `isPreFightFlip` branch — order hooks accept calls without them. |
| Max-size guard in `handlePlaceOrder` (L536-541) | Blocks orders over `fightMaxSize` | Remove the `if (inActiveFight && fightMaxSize > 0 && ...)` check. |
| `MarketSelector` `blockedSymbols` prop | Greys out fight-blocked symbols | Pass `blockedSymbols={[]}` (or drop the prop). |

After these edits the layout (grid, tabs, sheet, modals) is unchanged — only the fight-conditional sub-blocks and props disappear.

---

## 9. Gaps the migrator must supply

- All data/trading hooks imported from `@/hooks` (account, prices, order CRUD, leverage/margin, history, builder-code) — documented in the hooks doc, not here.
- `BetaGate` and `AppShell` wrappers (separate docs). `BetaGate` is a TFC-specific access gate; replace with your own gate or a no-op fragment.
- Builder-code approval flow (`useBuilderCodeStatus` / `useApproveBuilderCode`) is Pacifica-specific; the warning banners in the order panel depend on it.
- `sonner` `toast` and `@mui/icons-material` (`FileDownloadIcon`, `FileUploadIcon`) are external deps used in this file.
- Tailwind design tokens (`surface-*`, `win-*`, `loss-*`, `card`, `font-display`) must exist — see the design-tokens doc.
