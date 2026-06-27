# UpDown Terminal — Plan: Spot Trading (HyperLiquid)

**Versión:** 2026-06-28
**Objetivo:** añadir trading **spot** de HyperLiquid al terminal (comprar/vender y mantener tokens
como HYPE, PURR, etc.), con un toggle **Spot | Perps**, reutilizando al máximo la infraestructura
de perps que ya existe.

> Resumen ejecutivo: NO es solo un switch. Se reutiliza ~50-60% (auth con agent wallet, WS streams,
> chart, orderbook, transporte de órdenes, shell del formulario). Lo nuevo (~40-50%) es el modelo de
> **holdings** (spot no tiene Position/leverage/liquidación), los **endpoints spot** de HL, la
> **resolución de asset index spot** y las **vistas spot** (catálogo, holdings, order entry sin
> apalancamiento).

---

## 1. Diferencias spot vs perp (lo que cambia el modelo)

| Concepto | Perp (hoy) | Spot (nuevo) |
|---|---|---|
| Qué tienes | `Position` (entry, mark, liq, leverage, uPnL, funding) | **Holding**: balance de un token |
| Apalancamiento | sí (`updateLeverage`, margin mode) | **no** |
| Liquidación / funding | sí | **no** |
| P&L | `unrealizedPnl` nativo de HL | **coste medio** (calculado de fills) |
| Asset index (órdenes) | índice en `meta.universe` (0..N) | **`10000 + spotIndex`** de `spotMeta` |
| Coin en API/WS | `"BTC"` | par spot, normalmente `"@{spotIndex}"` o `"TOKEN/USDC"` |
| Balances | `clearinghouseState` (perp) | `spotClearinghouseState` (lista de `{coin, total, hold}`) |
| Cuenta de fondos | perp margin | spot wallet (ya transferible vía `usdClassTransfer`, existe) |

---

## 2. Qué se reutiliza vs qué es nuevo

**Reutilizable tal cual:**
- Auth con agent wallet + firma server-side (`signer.ts`, `buildHyperliquidSigner`) — idéntica para spot.
- Transporte de órdenes (mismo endpoint `exchange`, `client.order(...)`).
- WS streams (`l2Book`, `candleSnapshot`, `allMids`) — funcionan con el coin spot.
- Chart, orderbook, Toast, modales, el shell de `OrderEntry`.
- Transferencia Spot↔Perps y balance USDC spot (`lib/hlBalances.ts` `fetchSpotUsdc`, `usdClassTransfer`).

**Nuevo:**
- Endpoints spot en `info-client`.
- Mapa de asset index spot en `signer`.
- Tipo `Balance`/`Holding` en `exchange-core` + mappers.
- Métodos `getSpotMarkets` / `getSpotBalances` en el read-adapter.
- Toggle Spot|Perps + catálogo spot + panel Holdings + OrderEntry spot (sin leverage).

---

## 3. Hechos técnicos de HL spot (para no equivocarse)

- **Info endpoints:** `spotMeta`, `spotMetaAndAssetCtxs`, `spotClearinghouseState` (POST a `/info`).
- **Asset index en órdenes:** para spot, `asset = 10000 + index` donde `index` es la posición del par
  en `spotMeta.universe`. (Perps usan la posición en `meta.universe` directamente.)
- **Coin para WS/orderbook/candles:** el par spot se identifica como `"@{spotIndex}"` (p.ej. PURR/USDC
  suele ser `"PURR/USDC"` por nombre, pero la forma canónica es `@index`). El mapeo nombre↔index sale
  de `spotMeta` (`universe[].tokens` + `name`).
- **Sin leverage / sin reduceOnly / sin TP-SL-por-liquidación.** Orden spot = market o limit, buy/sell.
- **Balances:** `spotClearinghouseState(user).balances = [{ coin, total, hold }]`. `total - hold` = libre.
- **szDecimals / tick:** salen de `spotMeta` (por token) — necesarios para formatear tamaño/precio.

---

## 4. Fases

### Fase 0 — Fundaciones y decisiones
- Flag de entorno para activar spot gradualmente: `NEXT_PUBLIC_SPOT_ENABLED` (web/terminal) y, si hace
  falta server, `SPOT_ENABLED`.
- Empezar SIEMPRE en **testnet** (`NEXT_PUBLIC_HYPERLIQUID_TESTNET=true`) hasta validar el flujo de orden.
- Decidir alcance del MVP: market buy/sell + holdings + toggle (lo demás en fases siguientes).

### Fase 1 — Backend / adapter (núcleo)
1. **`packages/exchange-hyperliquid/src/info-client.ts`**: añadir
   - `spotMeta()`, `spotMetaAndAssetCtxs()`, `spotClearinghouseState(user)` (mismo `post<T>` helper).
   - Tipos en `raw-types.ts`: `HlSpotMeta`, `HlSpotMetaAndAssetCtxs`, `HlSpotClearinghouseState`.
2. **`packages/exchange-core/src/types.ts`**: añadir
   - `interface Balance { asset: string; total: string; available: string; usdValue?: string }`.
   - `MarketKind = 'perp' | 'spot'` y `Market.kind?: MarketKind` (o un `SpotMarket`); marcar `maxLeverage=0`
     y `fundingRate='0'` para spot.
   - Extender `ExchangeReadAdapter` con `getSpotMarkets()` y `getSpotBalances(accountId)`.
3. **`packages/exchange-hyperliquid/src/mappers.ts`**: `mapSpotMarkets(spotMeta, ctxs)`,
   `mapSpotBalances(spotState)`, `mapSpotPrices(...)`.
4. **`packages/exchange-hyperliquid/src/read-adapter.ts`**: implementar `getSpotMarkets()` (usa
   `spotMetaAndAssetCtxs`) y `getSpotBalances(accountId)` (usa `spotClearinghouseState`).
5. **`packages/exchange-hyperliquid/src/signer.ts`**:
   - `assetMap()` → añadir un `spotAssetMap()` que lea `spotMeta` y mapee `name -> { index: 10000+i, szDecimals }`.
   - `resolveAsset(symbol, kind)` recibe el tipo (perp/spot) y elige el mapa correcto.
   - `prepareOrder` propaga `kind` desde `OrderParams` (añadir `OrderParams.kind?: 'perp'|'spot'`,
     default `'perp'`). Spot: ignorar leverage/reduceOnly.
   - `getSpotMidPrice`/slippage: usar `allMids` con el coin spot (`@index`).
6. **Tests** (`signer.test.ts`, `read-adapter.test.ts`): asset index spot = 10000+i; orden spot sin leverage.

### Fase 2 — API + plumbing del terminal
1. **`apps/terminal` markets API** (`/api/markets`): añadir `?kind=spot` o un `/api/markets/spot` que
   devuelva el catálogo spot (vía `getSpotMarkets`).
2. **`apps/terminal/src/lib/stream.ts`**: permitir suscribir precios/orderbook de coins spot (`@index`).
3. **Balances**: endpoint/hook para `getSpotBalances` (o ampliar `useAccountStream` con `spotBalances`).
4. **Order placement** (`/api/.../order` o el server action que firma): aceptar `kind: 'spot'` y pasarlo
   al signer. Reusar agent key / builder fee igual que perps.

### Fase 3 — UI Pro terminal
1. **Toggle Spot | Perps**: en `TradeModeMenu.tsx` (o junto al selector de mercado). Estado global
   `useMarketKind` (zustand o context), persiste en localStorage.
2. **Catálogo**: la lista de mercados filtra por kind (perp vs spot) según el toggle.
3. **`OrderEntry` spot**: variante sin leverage/margin/TP-SL; solo Market/Limit + Buy/Sell + tamaño en
   token o en USDC. Reusa el shell, oculta los controles de perp.
4. **Panel Holdings** (nuevo, paralelo a `Positions`): tabla token / cantidad / valor USD / (coste medio,
   P&L cuando exista). Sustituye a Positions cuando kind=spot.
5. **AccountInfo**: mostrar balance spot disponible cuando kind=spot.

### Fase 4 — UI Simple mode
1. Catálogo simple spot (reusa `SimpleMarketsList` con kind).
2. `SimpleTradePanel` spot: comprar/vender sin leverage.
3. `SimplePositionsSidebar` → mostrar Holdings cuando kind=spot.

### Fase 5 — P&L, fills y limit
1. **Coste medio / P&L spot**: persistir fills spot (como `trade_fills`) y calcular coste medio por token;
   mostrar P&L en Holdings y en el profile (Trading tab, ampliar para spot).
2. **Limit orders** spot completos + cancelación (ya hay `cancel`, solo asegurar asset index spot).
3. **Pulido**: formato de decimales por token, mínimos de orden, validaciones.

### Fase 6 — Testing + rollout
1. Testnet end-to-end: comprar un token spot, ver holding, vender, ver balance.
2. Flag OFF en prod hasta validar; activar por `NEXT_PUBLIC_SPOT_ENABLED`.
3. Mainnet: probar con importe mínimo real.

---

## 5. Lista de archivos a tocar (resumen)

**Packages**
- `exchange-core/src/types.ts` — `Balance`, `MarketKind`, `OrderParams.kind`, adapter methods.
- `exchange-hyperliquid/src/info-client.ts` — endpoints spot.
- `exchange-hyperliquid/src/raw-types.ts` — tipos raw spot.
- `exchange-hyperliquid/src/mappers.ts` — mapSpot*.
- `exchange-hyperliquid/src/read-adapter.ts` — getSpotMarkets/getSpotBalances.
- `exchange-hyperliquid/src/signer.ts` — spotAssetMap + resolveAsset(kind) + prepareOrder spot.
- `*.test.ts` — cobertura spot.

**Terminal (apps/terminal)**
- `lib/stream.ts`, `lib/api.ts`, `lib/hlBalances.ts` — spot balances/markets/stream.
- `components/TradeModeMenu.tsx` (+ nuevo `useMarketKind`) — toggle Spot/Perps.
- `components/OrderEntry.tsx` — variante spot.
- nuevo `components/Holdings.tsx` (Pro) — panel de balances.
- `components/AccountInfo.tsx` — balance spot.
- `components/simple/SimpleMarketsList.tsx`, `SimpleTradePanel.tsx`, `SimplePositionsSidebar.tsx` — spot en Simple.

**Web (opcional, Fase 5)**
- `components/profile/TradingTab.tsx` + endpoint resumen — incluir actividad spot.

---

## 6. Riesgos / edge cases
- **Coin format**: mezclar `@index` (spot) con nombres (perp) en streams/orderbook. Centralizar el mapeo
  símbolo↔coin por kind para no romper perps.
- **Cache de asset map**: hoy `ASSET_MAP_CACHE` es por endpoint; añadir una entrada separada para spot
  (no pisar la de perps).
- **Decimales**: spot szDecimals difieren por token; un formateo mal puede rechazar la orden.
- **No romper perps**: `kind` debe default a `'perp'` en todo el camino (OrderParams, resolveAsset) para
  que el flujo actual no cambie.
- **Builder fee**: confirmar que aplica/!aplica igual en spot (revisar en testnet).

---

## 7. Esfuerzo estimado
- **Fase 1 (backend/adapter):** ~2-3 días (el grueso técnico).
- **Fase 2 (plumbing):** ~1 día.
- **Fase 3 (UI Pro):** ~2-3 días.
- **Fase 4 (Simple):** ~1-2 días.
- **Fase 5 (P&L/fills/limit):** ~2-3 días.
- **Fase 6 (testing/rollout):** ~1 día.
- **MVP** (Fases 1-3 mínimas: market buy/sell + holdings + toggle): ~4-5 días.
- **Completo:** ~1.5-2 semanas.

Reglas de oro: empezar en **testnet**, mantener `kind` con default `perp` para no tocar el flujo
existente, y centralizar el mapeo símbolo↔coin/asset-index por kind.
