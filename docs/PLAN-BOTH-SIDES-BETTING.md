# Plan: apostar a múltiples lados en el mismo pool (hedge)

> Estado: **PLAN / re-análisis**. No implementado. Rama: `feature/both-sides-betting` (worktree aislado).
> Objetivo: que la **misma wallet** pueda tener posición en >1 lado del mismo pool (UP+DOWN en crypto; cualquier combo de Home/Draw/Away en deportes; Yes+No en PM). Motivo de negocio: más volumen y el usuario que va perdiendo puede cubrirse en el otro lado.

Aplica a los **3 tipos de pool**:
- **Crypto** — 2 lados (UP/DOWN), `poolType=CRYPTO`, `numSides=2`.
- **Deportes** — 2 ó 3 lados (Home/Away, o Home/Draw/Away), `poolType=SPORTS`, `numSides=2|3`.
- **PM (predicciones)** — 2 lados (Yes/No → UP/DOWN), `poolType=SPORTS` con league `PM_*`, `numSides=2`. Comparte TODO el flujo de deportes (deposit/claim/refund + `sports-scheduler`).

---

## 1. La restricción raíz (on-chain)

`programs/parimutuel_pools/src/instructions/deposit.rs:96-99` — el `UserBet` PDA es `[SEED_PREFIX, pool, user]` (una cuenta por usuario por pool, un solo `side`). Al re-depositar con otro lado el **programa** rechaza:

```rust
require!(user_bet.side == side, PoolError::SideMismatch);
```

Todo lo demás (API, DB, front) solo refleja esta regla. **Quitar el check de la API NO alcanza**: hay que cambiar el programa y redeployar.

---

## 2. Decisión de diseño (clave) — Opción A vs B

| | **A — cuenta por lado** (side en las seeds) | **B — montos por lado** (una cuenta) |
|---|---|---|
| PDA | `[SEED, pool, user, side]` → 1 cuenta por (pool,user,**side**) | `[SEED, pool, user]` (igual que hoy) |
| Struct `UserBet` | **sin cambios** (`{side, amount, claimed, bump}`) | cambia → `{amount_up, amount_down, amount_draw, claimed, bump}` |
| Mapeo DB↔chain | **1:1** (1 fila Bet = 1 cuenta) | 1 cuenta ↔ **N filas** (hay que reconciliar) |
| `getUserBetPDA` | gana parámetro `side` (3 call sites) | sin cambios |
| Refund | `autoRefundBets` por fila = por cuenta (casi sin cambios) | dedupe por wallet + refund suma los lados |
| Claim | reclama la cuenta del lado ganador; cuentas perdedoras quedan sin cerrar (igual que hoy los perdedores) | reclama la única cuenta (paga lado ganador, cierra); reclama rent |
| Capas de app (rewards, display, notif) | siguen **por-fila** sin reconciliar | hay que mapear N filas ↔ 1 cuenta |
| Rompe cuentas viejas en redeploy | sí (seeds nuevas) | sí (layout nuevo) |

**Recomendación: Opción A.** Mantiene el modelo "1 fila Bet = 1 cuenta on-chain = 1 lado" de punta a punta, así rewards/claim/refund/display/notificaciones siguen operando por apuesta sin lógica de reconciliación, y el struct on-chain no cambia (menos riesgo). El costo es pasar `side` en la derivación del PDA (3 lugares) y elegir la fila del lado **ganador** en claim/notif.

> El "rent leak" de las cuentas perdedoras (no se cierran) **ya existe hoy** (los perdedores nunca reclaman → su `UserBet` nunca se cierra). A no lo empeora conceptualmente; solo se multiplica por la cantidad de lados perdidos. Se puede limpiar después con un barrido authority-signed.

El resto del plan asume **Opción A**. (Si se elige B, cambian §4.1, §4.5 y §4.6 según la columna B.)

---

## 3. Modelo de datos

- DB `Bet`: `@@unique([poolId, walletAddress])` → **`@@unique([poolId, walletAddress, side])`**. Permite 1 fila por lado (hasta 2 en crypto/PM, hasta 3 en deportes 3-way).
- On-chain: 1 `UserBet` por (pool, user, side).

---

## 4. Cambios por capa (exhaustivo)

### 4.1 Programa Anchor (Rust) — `programs/parimutuel_pools/src/`
- `instructions/deposit.rs`:
  - Seeds del `user_bet`: agregar `&[side as u8]`.
  - Quitar el bloque `else { require!(side mismatch); amount += }`. Con seeds por lado, cada lado es su propia cuenta `init_if_needed` y se acumula en ella (re-deposit al mismo lado sigue sumando).
  - `#[derive(Accounts)]` necesita `#[instruction(side: Side, amount: u64)]` para usar `side` en las seeds.
- `instructions/claim.rs`: seeds del `user_bet` agregar `&[side as u8]`; necesita el `side` como arg de instrucción (o derivar por `pool.winner`). El check `user_bet.side == winner` se mantiene (la cuenta reclamada es la del lado ganador).
- `instructions/refund.rs` (revisar): seeds por lado; refund por cuenta.
- `state.rs`: `UserBet` **sin cambios**. (En B sí cambia.)
- `errors.rs`: `SideMismatch` queda sin uso (dejar o quitar).
- `anchor build` → IDL nuevo. **El deploy lo corre el usuario** (authority).

### 4.2 `packages/solana-client/src/`
- `pdas.ts` (o donde esté `getUserBetPDA`): agregar parámetro `side` a la derivación.
- `instructions/index.ts`: `buildDepositIx` / `buildClaimIx` / `buildRefundIx` — los **args** no cambian (siguen `side, amount` / `fee_bps`); solo se les pasa el `userBet` PDA derivado con side. Verificar que la cuenta `userBet` siga siendo la correcta.
- `accounts/index.ts` + `types.ts`: `UserBetAccount` sin cambios (Opción A).
- Copiar IDL regenerado.

### 4.3 DB / Prisma — `apps/api/prisma/`
- `schema.prisma`: cambiar el `@@unique` de `Bet` (ver §3).
- Migración nueva.

### 4.4 API depósitos — `apps/api/src/routes/deposits.ts`
- **Quitar** los 2 checks `SIDE_MISMATCH` (`/deposit` ~131-139 y `/confirm-deposit` ~análogo).
- `bet.findUnique`/`upsert` por `poolId_walletAddress` → clave compuesta **`poolId_walletAddress_side`** (líneas ~106, ~124, ~266, ~392).
- `/deposit`: derivar `getUserBetPDA(poolPDA, user, side)`.
- **maxBettors (squad)**: hoy usa `bet.count({poolId})` y `findUnique(poolId_walletAddress)` — con filas por lado eso **sobre-cuenta** (misma wallet en 2 lados = 2 filas). Cambiar a contar **wallets distintas** (`groupBy walletAddress` o `distinct`).

### 4.5 API claims — `apps/api/src/routes/claims.ts`
- `/claim`: hoy busca `findUnique(poolId_walletAddress)` (una fila). Cambiar a buscar la **fila del lado ganador** del usuario: `findUnique(poolId_walletAddress_side: {…, side: pool.winner})`. Si no existe → no ganó.
- `getUserBetPDA(poolPDA, user)` → pasar `pool.winner` como side.
- `calculatePayout`: hoy se llama con solo `totalUp/totalDown` y `side as 'UP'|'DOWN'` → **bug en 3-way (DRAW)**. Pasar `totalDraw: pool.totalDraw` y `side: bet.side`. (Las funds on-chain ya son correctas; esto corrige el display/fallback.)
- `betCount` para fee: hoy `bet.count({poolId})` cuenta filas; con hedge una sola wallet puede dar betCount≥2. Para "fee waived si 1 solo bettor" usar **wallets distintas**, no filas.
- `confirm-claim`: igual, `calculatePayout` con `totalDraw` + side real.

### 4.6 Resolver / refunds — `apps/api/src/scheduler/`
- `resolve-logic.ts`:
  - **Detección de refund por totales, no por `betCount`.** Hoy `betCount === 1` → `handleSingleBettorRefund`. Una wallet hedgeada (2 filas, ambos totales > 0) NO debe reembolsarse: debe resolver normal. Gatear refund por `totalUp==0 || totalDown==0` (y considerar draw en 3-way), no por cantidad de filas/bettors.
  - El `awardBetResolution` (XP, ya mergeado) itera `allBets` por wallet única — con filas por lado, una wallet con 2 lados aparece 2 veces; ya hago `new Set(walletAddress)` así que da XP 1 vez por wallet. ✓ (revisar que siga así.)
- `onchain-tx.ts` `autoRefundBets`: en Opción A funciona casi igual (por fila = por cuenta, derivando `getUserBetPDA` con `bet.side`). **Hay que pasar `side` a `refundBetOnChain`/`getUserBetPDA`.**
- `sports-scheduler.ts` (`resolveMatchPools`): resuelve por resultado real; cubre deportes **y PM**. Revisar que el claim posterior tome la fila del lado ganador (mismo cambio que §4.5). Caso "todos los bettors en lados perdedores" → nadie reclama (sin refund), igual que hoy.

### 4.7 Notificaciones — `apps/web/src/hooks/useNotifications.ts`
- `onPoolStatus`: hoy `bets.find(b => b.pool.id === data.id)` devuelve **una** apuesta y decide WON/LOST por su side. Con hedge la wallet tiene posición ganadora **y** perdedora.
- Cambio: evaluar el **conjunto** (`bets.filter(b => b.pool.id === id)`). Si **alguna** posición está en el lado ganador → **una sola** notif `POOL_WON`/`POOL_CLAIMABLE`. El lado perdedor **no** emite un `LOST` aparte (sería contradictorio). → **una notificación limpia por pool.**

### 4.8 Frontend — formularios y vistas
Confirmado revisando el código actual:

- **Form de apuesta** — el lock por `existingBetSide` (`BetForm.tsx:43,56,63,317`) fuerza el lado y cambia el botón a "Add to UP". En la práctica casi no se pasa esa prop hoy; **el bloqueo real es el servidor** (`SIDE_MISMATCH`). Cambios:
  - Quitar el lock para que el selector permita elegir cualquier lado siempre.
  - Crypto: `BetForm.tsx`, `bet/SideSelector.tsx`, `pool/ArenaSection.tsx`, `pool/CryptoPoolModal.tsx`, `app/pool/[id]/page.tsx`.
  - Deportes/PM: `sports/MatchBetModal.tsx`, `sports/ThreeWaySelector.tsx`, `app/match/[id]/page.tsx` (permitir cualquier combo de los 2-3 lados).
- **"Tu posición"**: hoy se asume 1. Mostrar **todas** las posiciones del usuario en el pool (ej. *"$10 UP · $5 DOWN · neto …"*). Revisar todo `bets.find(b => b.pool.id === id)` que asuma una sola: `app/pool/[id]`, `app/match/[id]`, `components/pool/PoolRow*.tsx`, `BetCard.tsx`.
- **Activity feed** (`app/match/[id]/page.tsx:436+`): ya itera **todas** las apuestas por fila → muestra varias por wallet sin cambios. ✓
- **Sidebar de pools activos** (`components/sidebar/PoolsSidebarList.tsx`): es **pool-céntrico** (ganador/odds/totales), **no muestra el lado del usuario** → **sin cambios**.
- **Profile** (`profile/PoolsBetTable.tsx`, `profile/BetRow.tsx`): listar varias filas por pool (una por lado); el botón **Claim** por pool debe apuntar a la fila del lado **ganador**.

#### Resumen por superficie de display
| Superficie | ¿Muestra ambos lados? | Cambio |
|---|---|---|
| Notificaciones | 1 notif/pool (gana si algún lado ganó) | Evaluar el conjunto |
| Sidebar pools activos | N/A (pool-céntrico) | **Ninguno** |
| Pool page — form | permite elegir/sumar cualquier lado | Quitar lock |
| Pool page — tu posición | **Sí, ambas** | Listar posiciones |
| Pool page — Activity feed | Sí (ya funciona) | Ninguno |
| Profile (tabla/row) | filas por lado | Listar varias + Claim al lado ganador |

### 4.9 Rewards — `apps/api/src/services/rewards.ts`
- `trackBetPlacement` corre por confirm-deposit (por fila/lado) → un hedger acumula `dailyBetCount` por cada lado. Aceptable (sigue siendo actividad), pero notar para los tiers de coins.
- `awardBetResolution` / `awardBetWin`: por wallet en resolución / por fila ganadora en claim. El lado perdedor nunca reclama → no hay doble premio. ✓

---

## 5. Casos borde a cubrir
1. **Hedger solitario** (1 wallet, ambos lados): el pool es 2-sided → resuelve normal, NO refund (§4.6). Paga fee normal.
2. **3-way deportes**: claim/notif/payout deben contemplar DRAW (§4.5, §4.7).
3. **Refund (one-sided real)**: si un lado queda en 0 total, refund de todas las filas (cada una su cuenta en A).
4. **maxBettors squad**: contar wallets distintas, no filas (§4.4).
5. **Fee waiver "1 bettor"**: por wallets distintas, no filas (§4.5).
6. **Display profile/portfolio**: varias filas por pool en el mismo wallet.

---

## 6. Migración / redeploy ⚠️
- Cambiar las seeds (A) o el layout (B) del `UserBet` **rompe las cuentas existentes**: pools en vuelo con el esquema viejo no se podrán reclamar/reembolsar con el binario nuevo.
- Prod es **testing-only, sin usuarios reales** (ver memoria) → se puede redeployar + resetear. En localhost/dev: **drenar** (dejar resolver los pools abiertos) antes de deployar.
- Los **3 entornos comparten el mismo programa/authority** → el redeploy los afecta a todos.
- **El deploy lo corre el usuario** (`anchor deploy`). Yo entrego Rust + IDL + DB + API + front + typecheck.

---

## 7. Orden de implementación (checklist)
1. [ ] Anchor: `deposit.rs`, `claim.rs`, `refund.rs` (seeds con side) + `anchor build` → IDL.
2. [ ] `solana-client`: `getUserBetPDA(side)` + IDL copiado.
3. [ ] Prisma: `@@unique([poolId, walletAddress, side])` + migración.
4. [ ] API `deposits.ts`: quitar SIDE_MISMATCH, clave compuesta, PDA con side, maxBettors por wallet.
5. [ ] API `claims.ts`: fila ganadora, PDA con winner, payout con `totalDraw`, fee por wallets.
6. [ ] `onchain-tx.ts` / `resolve-logic.ts`: refund por totales, `refundBetOnChain(side)`.
7. [ ] `useNotifications.ts`: win/loss sobre el conjunto de posiciones.
8. [ ] Front: forms crypto + sports/PM, vistas de posiciones, botón claim → lado ganador.
9. [ ] Typecheck API + web.
10. [ ] (Usuario) `anchor deploy` + migración DB en cada entorno (drenar antes).

---

## 8. Decisión pendiente antes de codear
- **¿Opción A o B?** (recomiendo A). Esto define §4.1/§4.5/§4.6.
- Confirmar que el deploy on-chain lo corre el usuario y que se acepta romper cuentas de test.
