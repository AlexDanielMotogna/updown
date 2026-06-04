# Trading Modals

Part of the Trading Terminal Migration set — see [README](./README.md).

This doc covers all the **trading-terminal modals** (close, limit-close, TP/SL, flip, edit order, withdraw, deposit, settings, etc.). It excludes `CancelFightModal` (fight/duel-only — note that it exists at `apps/web/src/components/CancelFightModal.tsx` but is part of the arena layer and must NOT be migrated). Other excluded modals: `AiDisclaimerModal`, `landing/BetaApplyModal` (landing/marketing only).

All modal files live in `apps/web/src/components/` (deposit modal under `apps/web/src/components/deposit/`).

---

## Shared conventions

All modals follow the same visual/structural pattern. Reproduce these once, then reuse:

| Concern | Convention |
|---|---|
| Mount | Most render through `<Portal>` (`apps/web/src/components/Portal.tsx`) into `document.body`. Exceptions: `SettingsModal`, `QuickPositionModal`, `DepositModal`, `NoPacificaModal` render inline (no Portal). |
| Backdrop | `fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm`. Click on backdrop closes (via `onClick={onClose}` on backdrop, with `e.stopPropagation()` on the panel, OR an explicit `handleBackdropClick` that checks `e.target === e.currentTarget`). |
| Panel | `bg-surface-900 rounded-2xl w-full max-w-md mx-4` (some use `max-w-sm`). |
| Close (X) button | `text-surface-500 hover:text-white transition-colors` + a 16px stroke SVG `M6 18L18 6M6 6l12 12`. |
| Primary button | `w-full py-2.5 rounded-lg font-medium bg-white text-black hover:bg-surface-200 disabled:bg-surface-700 disabled:text-surface-500 disabled:cursor-not-allowed`. (QuickPositionModal uses `bg-orange-500` instead.) |
| Long/Short colors | `text-win-400` / `bg-win-500/20` for LONG; `text-loss-400` / `bg-loss-500/20` for SHORT. |
| Spinner | `<Spinner size="xs" variant="white" />` (`apps/web/src/components/Spinner.tsx`) shown inside button while submitting. |
| Slider | `<Slider min max value onChange color? />` (`apps/web/src/components/Slider.tsx`). |
| z-index | Standard `z-50`; nested/secondary modals `z-[60]`; Settings/Quick `z-[100]`; Deposit `z-[9998]/[9999]`; NoPacifica `z-[9999]`. |

Two **prop patterns** coexist:
- **Controlled-open** modals take `isOpen: boolean; onClose: () => void` and early-return `null` when `!isOpen` (`EditOrderModal`, `WithdrawModal`, `CloseOppositeModal`, `SettingsModal`, `QuickPositionModal`, `DepositModal`).
- **Conditionally-rendered** modals are only mounted when needed by the parent, so they take no `isOpen` (`MarketCloseModal`, `LimitCloseModal`, `TpSlModal`, `FlipPositionModal`). `NoPacificaModal` self-gates on auth store.

Shared design tokens (`win`, `loss`, `surface`, `primary`, `profit`) → see [Design tokens](./02-design-tokens-css.md). Order hooks (`useCreateMarketOrder`, etc.) → see [Trading hooks](./05-trading-hooks.md) (adjust filename to your set). Position type → see [Positions](./07-positions.md).

---

## Modal index

| Modal | File | Open pattern | Action it performs | Hook / API |
|---|---|---|---|---|
| EditOrderModal | `EditOrderModal.tsx` | `isOpen` + `order` | Edit a resting limit order's price (size unchanged) | `useEditOrder()` |
| MarketCloseModal | `MarketCloseModal.tsx` | mounted | Close a position at market, partial via %/amount | parent `onConfirm(amount, percentage)` → `onClosePosition(id,'market',...)` |
| LimitCloseModal | `LimitCloseModal.tsx` | mounted | Place a reduce-only limit order to close | parent `onConfirm(price, amount, percentage)` → `onClosePosition(id,'limit',...)` |
| TpSlModal | `TpSlModal.tsx` | mounted | Set / remove TP & SL (full or partial), cancel existing partials | parent `onConfirm(TpSlParams)` + `onCancelOrder()` |
| FlipPositionModal | `FlipPositionModal.tsx` | mounted | Confirm flipping LONG↔SHORT at market | parent `onConfirm()` → `onClosePosition(id,'flip')` |
| CloseOppositeModal | `CloseOppositeModal.tsx` | `isOpen` | Warn that a new order will net-close an opposite position | parent `onConfirm()` |
| QuickPositionModal | `QuickPositionModal.tsx` | `isOpen` | All-in-one: market close / limit close / TP-SL / flip (mobile-first bottom sheet) | calls hooks directly: `useCreateMarketOrder`, `useCreateLimitOrder`, `useSetPositionTpSl` |
| WithdrawModal | `WithdrawModal.tsx` | `isOpen` | Withdraw USDC from Pacifica | `useWithdraw()` |
| DepositModal | `deposit/DepositModal.tsx` | `isOpen` | Deposit USDC into Pacifica (on-chain Solana tx) | `useDeposit()` + `useUsdcBalance()` |
| SettingsModal | `SettingsModal.tsx` | `isOpen` | Toggle navbar UI components (localStorage) | none (localStorage + CustomEvent) |
| NoPacificaModal | `NoPacificaModal.tsx` | self-gated | Blocking prompt to create a Pacifica account | `GET /api/auth/pacifica/me` |
| ~~CancelFightModal~~ | `CancelFightModal.tsx` | — | **EXCLUDED — fight layer only** | — |

---

## Per-modal detail

### 1. EditOrderModal

Edit the limit price of a resting order. Size/amount stay fixed.

```ts
interface Order { id: number; symbol: string; side: string; price: string; size: string; type: string; }
interface EditOrderModalProps { isOpen: boolean; onClose: () => void; order: Order | null; }
```

- **State:** `price` (string), seeded from `order.price` via `useEffect` on open.
- **Action:** on submit, `editOrderMutation.mutate({ orderId, symbol, price, amount: order.size }, { onSuccess: onClose })`.
- **Hook:** `useEditOrder()` (`apps/web/src/hooks/useOrders.ts`, returns React-Query `useMutation`). Params: `{ orderId: number; symbol: string; price: string; amount: string }`. The hook strips `-USD` from symbol and signs client-side with the Solana wallet.
- **Validation:** disabled unless `priceNum > 0` AND `price !== order.price` AND not `isPending`. Invalid input (`NaN`/`<=0`) silently returns.
- **UX:** read-only info card (Symbol / Side / Size), single numeric price input (USD suffix, spinner arrows hidden), button label `Update Price` → `Updating...`. Panel `max-w-sm`.

### 2. MarketCloseModal

Market-close a (partial) position. Mounted only when a position is selected.

```ts
export interface MarketCloseParams { positionId: string; amount: string; percentage: number; }
interface MarketCloseModalProps {
  position: Position;            // from ./Positions
  onClose: () => void;
  onConfirm: (amount: string, percentage: number) => void;
  isSubmitting?: boolean;
}
```

- **State:** `amount` (token units, seeded `position.sizeInToken.toString()`), `percentage` (default 100).
- **Live price:** `usePrices().getPrice(position.symbol)?.price` (falls back to `position.markPrice`), badge shows pulsing `LIVE`.
- **Lot-size rounding:** hard-coded `LOT_SIZES` map keyed by token base symbol (`BTC: 0.00001`, `ETH: 0.0001`, `SOL: 0.01`, … plus forex `USDJPY/EURUSD/GBPUSD: 0.001`); fallback `0.00001`. `roundToLotSize = Math.floor(value/lot)*lot`. On amount blur, clamps to `position.sizeInToken` and re-rounds.
- **Derived:** `usdValue = amount * livePrice`; `estimatedPnl = (side==='LONG'? live-entry : entry-live) * amount`.
- **Action:** `onConfirm(amount, percentage)`; the parent (`Positions.tsx`) routes to `onClosePosition(id, 'market', { positionId, amount, percentage })`.
- **UX:** quick-% buttons `[25,50,75,100]`, slider 0–100, two-way amount↔% sync, est-PnL colored. Button `Market Close` → spinner + `Closing...`.

### 3. LimitCloseModal

Place a reduce-only limit order to close. Same `LOT_SIZES` map and price/amount mechanics as MarketClose, plus a price field.

```ts
interface LimitCloseModalProps {
  position: Position;
  onClose: () => void;
  onConfirm: (price: string, amount: string, percentage: number) => void;
  isSubmitting?: boolean;
}
```

- **State:** `price` (seeded to `formatPrice(position.markPrice)` on mount), `amount`, `percentage` (default 0).
- **Mid button:** sets price to `formatPrice(livePrice)`.
- **Action:** `onConfirm(price, amount, percentage)` → parent `onClosePosition(id, 'limit', { positionId, price, amount, percentage })`.
- **UX:** header shows leverage badge + size; subtitle "Send limit order to close position."; USD value column = `amount * (price || markPrice)`; est-PnL uses the entered `price`. Button `Limit Close` → `Submitting...`.

### 4. TpSlModal

The most complex modal. Manages full-position and partial Take-Profit / Stop-Loss orders, with optional limit-stop prices.

```ts
export interface TpSlParams {
  positionId: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  size: string;                                  // token units (full or partial effective size)
  takeProfit?: { stopPrice: string; limitPrice?: string } | null;   // null = remove
  stopLoss?:   { stopPrice: string; limitPrice?: string } | null;   // null = remove
  isPartial: boolean;
  partialAmount?: string;
}
interface TpSlModalProps {
  position: Position;
  onClose: () => void;
  onConfirm: (params: TpSlParams) => void;
  onCancelOrder?: (orderId: string, symbol: string, orderType: string) => Promise<void>;
  isSubmitting?: boolean;
}
```

- **Tabs:** `Full Position` vs `Partial`. Partial tab lists existing partial orders (filtered: `amount < sizeInToken * 0.99`, sorted by `triggerPrice` desc) and an `Add` button opening a **nested** "Add Partial TP/SL" modal at `z-[60]`.
- **Live data:** `usePrices().getPrice(symbol)` provides `price`, `lotSize` (fallback `0.00001`), `tickSize` (fallback `0.01`). Prices rounded to tick size before submit (`roundToTickSize` via `Math.round(v/tick)*tick` then `toFixed` to kill float error); amounts rounded to lot size.
- **%-of-margin helpers:** `calculateTpPrice(gainPercent, size)` / `calculateSlPrice(lossPercent, size)` derive a price from a target margin gain/loss. TP buttons `[25,50,75,100]`, SL buttons `[-25,-50,-75,-100]`.
- **Limit-price toggle:** when on, exposes TP/SL limit-price inputs and an explanatory note ("converts your TP/SL from a market stop into a limit stop…").
- **Actions:**
  - `handleConfirmFullPosition` → builds `TpSlParams` with `isPartial:false`, `size = sizeInToken`, only includes `takeProfit`/`stopLoss` when their price `> 0`.
  - `handleConfirmPartial` → `isPartial:true`, `size = partialAmount || sizeInToken`, `partialAmount`. After submit it closes the nested modal, resets the partial form, and **keeps the main modal open**.
  - Cancel an existing partial via `onCancelOrder(orderId, base-symbol, 'TP MARKET' | 'SL MARKET')`, tracked by `cancellingOrderId`.
- **Parent wiring (Positions.tsx):** `onConfirm={handleTpSlConfirm}` → `onSetTpSl(params)`. The consuming page maps `TpSlParams` → `useSetPositionTpSl()` whose params are `{ symbol, side, size, take_profit?: { stop_price; limit_price? } | null, stop_loss?: …, fightId? }` (note camelCase→snake_case mapping happens in the page, not the modal).
- **UX:** panel `max-h-[90vh] flex flex-col` with scrollable body; footer Confirm only on Full Position tab.

### 5. FlipPositionModal

Pure confirmation dialog — flip LONG↔SHORT at market, same size.

```ts
interface FlipPositionModalProps {
  position: Position;
  onClose: () => void;
  onConfirm: () => void;     // no args
  isSubmitting?: boolean;
}
```

- **No inputs.** Shows Current Position, New Position (opposite side), and Position Value = `sizeInToken * markPrice`.
- **Action:** `onConfirm()` → parent `onClosePosition(id, 'flip')`. (Implementation note: a flip is executed as a 2× market order in the opposite side — see QuickPositionModal `handleFlip`.)
- **UX:** button `Flip Position` → `Flipping...`.

### 6. CloseOppositeModal

Warning/confirm shown before opening an order that would net-close an existing opposite-side position.

```ts
interface CloseOppositeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  symbol: string;
  currentPositionSide: 'LONG' | 'SHORT';
  currentPositionValue: number;   // USD
  orderSide: 'LONG' | 'SHORT';
  orderValue: number;             // USD
  isLoading?: boolean;
}
```

- **Logic (display only):** `willCloseAmount = min(currentPositionValue, orderValue)`; `willFullyClose = orderValue >= currentPositionValue`; `remainingOrderValue = orderValue - willCloseAmount`. Builds an explanatory sentence and decides whether a new residual position opens.
- **Action:** two buttons — `Cancel` (→ `onClose`) and `Confirm` (→ `onConfirm`). Confirm button is colored by `orderSide` (`bg-loss-500` for SHORT, `bg-win-500` for LONG).
- **UX note:** has a "Don't show this again" checkbox that is **cosmetic only** (not wired to any state/persistence — the migrator must implement the suppression if desired). Side renders as Buy/Sell. Price row hard-coded `Market`.

### 7. QuickPositionModal

Self-contained mobile-first bottom sheet (`items-end sm:items-center`, `rounded-t-2xl sm:rounded-2xl`) that bundles Market close / Limit close / TP-SL / Flip into one tabbed modal. **Unlike the others, it calls the order hooks directly** rather than delegating via `onConfirm`.

```ts
interface QuickPositionModalProps {
  position: Position;        // NOTE: this is the raw WS Position from '@/hooks/usePacificaWebSocket'
  isOpen: boolean;
  onClose: () => void;
}
```

- **Imports:** `useCreateMarketOrder`, `useCreateLimitOrder`, `useSetPositionTpSl` (from `@/hooks/useOrders`), `usePrices`, MUI icons (`@mui/icons-material/{Close,TrendingDown,SwapVert}`), and trading utils `calculateTpPrice, calculateSlPrice, calculatePositionMetrics, roundToLotSize, roundToTickSize, formatPrice` from `@/lib/trading/utils`.
- **Position field names differ** (raw WS shape): `position.entry_price`, `position.amount`, `position.liq_price` (strings). `calculatePositionMetrics({ position, markPrice, leverage })` normalizes to `{ entryPrice, amount, side, margin, unrealizedPnl, unrealizedPnlPercent }`.
- **Tabs:** `close | limit | tpsl | flip`. Form resets on open transition (`wasOpen` guard).
- **Actions (all set `isSubmitting` and `onClose()` on success):**
  - `handleClose` → `createMarketOrder.mutateAsync({ symbol, side: isLong?'ask':'bid', amount, reduceOnly:true, slippage_percent:'1' })`.
  - `handleLimitClose` → `createLimitOrder.mutateAsync({ symbol: base, side, amount, price, reduceOnly:true })`.
  - `handleSetTpSl` → `setTpSl.mutateAsync({ symbol, side:'LONG'|'SHORT', size: position.amount, take_profit: {stop_price}|null, stop_loss: {stop_price}|null })` (prices rounded to tick size).
  - `handleFlip` → market order of **2× position size** opposite side, `reduceOnly:false`.
- **UX:** orange primary buttons (`bg-orange-500`), a 6-cell position grid (Entry/Mark/Liq/Size/Margin/PnL), and a secondary `Go to Terminal` button that does `window.location.href = '/trade?symbol=' + base`.

### 8. WithdrawModal

Withdraw USDC from the Pacifica account.

```ts
interface WithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableBalance: number | null;
}
```

- **State:** `amount` (reset to `''` on open).
- **Max:** `handleMaxClick` sets `amount = max(0, availableBalance - 1)` (leaves $1 for fee).
- **Action:** `withdrawMutation.mutate({ amount: amountNum.toString() }, { onSuccess: onClose })`.
- **Hook:** `useWithdraw()` (`useOrders.ts`), params `{ amount: string }`, signs the withdraw operation with the wallet (server-relayed to Pacifica).
- **Validation:** `amountNum > 0 && (availableBalance===null || amountNum <= availableBalance)`.
- **UX:** Available-balance row with hover tooltip explaining withdrawable = equity − required margin; info box ("Daily withdrawal limit is $250,000, resets at UTC 00:00. Withdrawal fee is $1."); `USDC` suffix + `Max` button; button `Confirm Withdraw` → `Processing...`.

### 9. DepositModal (`deposit/DepositModal.tsx`)

Deposit USDC into Pacifica via an **on-chain Solana mainnet transaction** signed by the connected wallet. No backend involved.

```ts
interface DepositModalProps { isOpen: boolean; onClose: () => void; }
const QUICK_AMOUNTS = [10, 50, 100, 250];
```

- **Hooks:** `useWallet()` (`@solana/wallet-adapter-react`), `useDeposit()` (`@/hooks/useDeposit`), `useUsdcBalance()` (`@/hooks/useUsdcBalance`). `MIN_DEPOSIT_USDC` from `@/lib/pacifica/deposit-instruction` (= **10**).
- **`useDeposit()` returns:** `{ deposit(uiAmount): Promise<void>, status: 'idle'|'signing'|'confirming'|'success'|'error', txSignature, error, reset }`. Flow: builds the deposit instruction, wraps with `ComputeBudget` (CU limit 300k, price 10k µLamports), sets recent blockhash + feePayer, `wallet.sendTransaction`, then `confirmTransaction`. Uses a dedicated **mainnet** `Connection` (`NEXT_PUBLIC_SOLANA_MAINNET_RPC_URL` → `NEXT_PUBLIC_SOLANA_RPC_URL` → `https://api.mainnet-beta.solana.com`).
- **On-chain instruction:** `buildDepositInstruction(depositor, uiAmount)` in `apps/web/src/lib/pacifica/deposit-instruction.ts` — ports Pacifica's Anchor `deposit(amount:u64)`. Hard-coded mainnet addresses:
  - `PACIFICA_PROGRAM_ID = PCFA5iYgmqK6MqPhWNKg7Yv7auX7VZ4Cx7T1eJyrAMH`
  - `PACIFICA_CENTRAL_STATE = 9Gdmhq4Gv1LnNMp7aiS1HSVd7pNnXNMsbuXALCQRmGjY`
  - `PACIFICA_VAULT = 72R843XwZxqWhsJceARQQTTbYtWy6Zw9et2YV4FpRHTa`
  - `USDC_MINT = EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` (6 decimals)
  - Discriminator `deposit` = `[0xf2,0x23,0xc6,0x89,0x52,0xe1,0xf2,0xb6]`; 10-account `keys` array (depositor, depositor USDC ATA, central state, vault, token program, ATA program, mint, system program, `__event_authority` PDA, program).
- **UX states:** `Sign in wallet…` / `Confirming…` / `Deposit again` / `Deposit`. Cannot close while `signing`/`confirming`. On success shows a Solscan link `https://solscan.io/tx/<sig>`. Quick-amount buttons + `Max` (disabled if balance < value). Shows `From: <pubkey>`. Uses `z-[9998]`/`z-[9999]`, `bg-primary-500` button, `text-profit-400` success, `text-loss-400` error.

### 10. SettingsModal

Toggles which navbar/terminal UI components are visible. Pure client state — no API.

```ts
interface SettingsModalProps { isOpen: boolean; onClose: () => void; }
```

- **State (booleans, default true):** `showQuickBar`, `showWallet`, `showNotifications`.
- **Persistence:** loads from `localStorage['tfc-settings']` on mount; on every change writes back AND dispatches `window.dispatchEvent(new CustomEvent('tfc-settings-changed', { detail: settings }))` so other components react live. **Migrator: other components subscribe to this event — preserve the key `tfc-settings` and event name `tfc-settings-changed`.**
- **UX:** three iOS-style toggle switches (track `bg-surface-400` on / `bg-surface-700` off, knob `translate-x-6`/`translate-x-1`); `z-[100]`; footer `Done` button. Renders inline (no Portal).

### 11. NoPacificaModal

Self-gating prompt shown when an authenticated user has **no linked Pacifica account**. Drives the user to deposit on Pacifica (which auto-links the account).

- **No props.** Reads `useAuthStore()` (`@/lib/store`): `{ token, isAuthenticated, pacificaConnected, setPacificaConnected, _hasHydrated }`.
- **Verification:** before showing, calls `GET /api/auth/pacifica/me` with `Authorization: Bearer <token>`. Response `{ connected: boolean }`. If `connected` → `setPacificaConnected(true)` and hides. If API/network error → assumes connected (never blocks). Only shows after hydration + server-confirmed disconnected + not dismissed.
- **Action:** external link `https://app.pacifica.fi?referral=TFC` (`PACIFICA_DEPOSIT_URL`, opens new tab). Local `dismissed` state allows soft-close (the comment says "cannot be dismissed" but a dismiss button + backdrop click exist that set `dismissed`).
- **UX:** orange lock icon, copy "Pacifica Account Required", `z-[9999]`, mobile bottom-sheet styling.

---

## Migration gotchas

- **`LOT_SIZES` map is duplicated** verbatim in `MarketCloseModal.tsx` and `LimitCloseModal.tsx`. TpSlModal/QuickPositionModal instead read `lotSize`/`tickSize` from `usePrices()`. Consolidate to a single source on migration.
- **Tick-size float fixups** (`Math.round(v/tick)*tick` then `toFixed`) matter — Pacifica rejects prices that are not a multiple of tick size.
- The modals are **presentational**; the actual order side translation (`LONG→ask`/`SHORT→bid`), `reduceOnly`, fightId, and snake_case API mapping happen in the consuming page (`apps/web/src/app/trade/page.tsx`) / `Positions.tsx`. See those handlers when wiring `onConfirm`.
