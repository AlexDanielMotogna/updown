# Plan - Auto-Payout (eliminar el flow de Claim)

> **Estado**: PROPUESTA REFINADA (v2). Objetivo: cuando un pool resuelve, el
> servidor paga automáticamente a cada ganador con una transferencia
> authority-signed, sin que el usuario tenga que firmar un `claim`. Mismo
> trato para refunds (one-sided) - **ya existe**, sólo falta el camino para
> winners.
>
> **Versión**: v2 (2026-05-30). Cambios mayores vs v1 en §1.
>
> **Estimación total**: **5-7 días** (vs 4-6 v1; el ahorro por scope ya
> implementado se compensa con admin panel + idempotencia + per-side
> handling).
>
> **Implementa antes de**: el roadmap de gamificación
> ([IMPLEMENTATION-PLAN-GAMIFICATION.md](./IMPLEMENTATION-PLAN-GAMIFICATION.md)).
> Auto-payout cambia el momento de awards (BET_WON XP se otorga al
> auto-pago, no al claim manual), entonces gamification se diseña
> asumiendo auto-payout ya activo.

---

## 1. Qué cambió desde v1 (TL;DR del scope real)

El audit reveló que **mucho del trabajo ya está hecho**. Resumen ejecutivo:

| Pieza | Estado v1 asumía | Estado real (audit 2026-05-30) | Delta |
|---|---|---|---|
| `refund.rs` authority-only | "hay que modificar" | **ya está authority-only** (`refund.rs:49`) | ✅ Cero trabajo on-chain para refund |
| `autoRefundBets()` | "hay que crear" | **ya existe** con 3 retries + backoff en `apps/api/src/scheduler/onchain-tx.ts` | ✅ Template listo para `autoClaimBets()` |
| Per-side bet PDA | no existía cuando v1 se escribió | **fully shipped** (`buildClaimIx` y `buildRefundIx` aceptan `side: 0\|1\|2`) | ➕ Hay que pensar hedging |
| 3 handlers auto-refund | "endpoint admin one-shot" | **ya operativos** en `resolve-logic.ts`: `handleSingleBettorRefund`, `handleOneSidedRefund`, `handleNoStrikePricePool` | ✅ Solo falta el camino "winners" |
| `claim.rs` authority-signed | "modificar" | **sigue sin estarlo** - único cambio on-chain real | 🔴 1 condición que agregar |
| DB fields | "Bet.payoutFailed nuevo" | confirmado: faltan `payoutFailed`, `payoutAttempts`, `lastAttemptedAt` | 🔴 Migration nueva |
| Admin panel | "endpoint suelto" | **no hay tab Payouts** - admin tiene Health/Pools/Finance/Users/Events/Actions/Tournaments/Categories | 🔴 Nueva tab + 6 endpoints |

**Net**: scope on-chain bajó (`refund` ya está), scope backend bajó (template
existe), pero subió scope admin (tab nueva) y subió scope de safety
(idempotencia + hedging).

---

## 2. Por qué `claim.rs` debe cambiar

El `claim` actual:
- **User firma** (`claim.rs:43`: `pub user: Signer<'info>`) - obligatorio.
- **Authority co-firma** (`claim.rs:46-49`) - para validar que `fee_bps`
  pasado on-chain coincida con el del nivel del user (anti-manipulation).
- **Authority no puede bypass user**: no hay condición tipo
  `signer == user || signer == authority`.

Para auto-payout, authority **tiene que poder firmar sola**. Dos caminos:

**Opción A - Modificar `claim.rs`** (recomendado):
- Cambiar el constraint a "`user OR authority` deben firmar".
- Mantener fee validation (authority sigue garantizando fee correcto).
- Claim manual sigue funcionando (user puede firmar como antes).
- Una sola instrucción, menos surface.

**Opción B - Nueva instrucción `auto_claim_ix`**:
- Authority-only.
- `claim` queda intocado.
- Más código, dos paths a mantener.

**Recomendación: A.** Más simple, claim manual queda como fallback natural.

**`resolve.rs` no se toca.** Auto-payout es post-resolve, dispara después
de que `pool.winner` ya está seteado.

---

## 3. Coexistencia con gamificación

Auto-payout es **pre-requisito** del roadmap de gamificación. Por qué:

1. **`awardBetWin` se mueve del claim manual al auto-payout**. Hoy se
   llama en `confirm-claim` (`apps/api/src/routes/claims.ts:349`). Cuando
   auto-payout active, debe llamarse en `autoClaimBets()` después de tx
   confirmada, no en confirm-claim.
2. **Notificaciones cambian de tipo**: hoy `POOL_WON` + `POOL_CLAIMABLE`
   + (luego user reclama) → `CLAIM_SUCCESS`. Mañana: `POOL_WON` + (auto)
   → `BET_PAID` con tx link + XP/coins inline. Tres notifs → una.
3. **Pool-boost milestones** (gamification §5) se calculan en
   resolución. Auto-payout corre después. Orden de operaciones:
   ```
   resolve()
     → set pool.winner
     → award participation XP (todos)
     → award pool-boost XP (todos si milestone hit) ← gamification
     → autoClaimBets() ← este plan
       → for each winner: tx + award BET_WON XP + emit BET_PAID
   ```
4. **Reputation per-category** (gamification §4) lee `Bet.claimed=true`
   para contar wins. Sin auto-payout, ese contador queda incompleto
   porque users no reclaman → stats se ven peor de lo que son. Auto-payout
   garantiza que cada win se contabilice.

**Decisión**: este plan **debe shippear primero**. La gamification roadmap
asume auto-payout activo en CRYPTO mínimo (Wave 1 de gamification puede
ir en paralelo con rollout de auto-payout en SPORTS/PM).

---

## 4. Fases del trabajo

### Fase 0 - Discovery + alineación (0.5d)

**Decisiones a confirmar antes de tocar código** (ver §13).

- Confirmar hedged-user behavior (UP+DOWN en 3-way): pagar winning side,
  loser side queda `claimed=false` permanente (DB diferencia con
  `bet.side !== pool.winnerSide`).
- Confirmar scope: **CRYPTO + SPORTS + PM**. Tournament prizes y squad
  pools quedan **fuera del scope v1** (manual). Razón: tournament prize
  tiene su propia instrucción (`claim_tournament_prize`); squad pools usan
  el mismo `claim.rs` así que técnicamente entran gratis cuando hagamos
  Opción A - confirmar.
- Confirmar wallet separada para payouts (no usar program authority como
  payout signer). **Recomendación**: sí, blast-radius más chico.

### Fase 1 - On-chain (2-3h, reducido vs v1)

**Cambios:**
- `programs/parimutuel_pools/src/instructions/claim.rs`:
  - Cambiar `pub user: Signer<'info>` → mantener `Signer` pero relajar
    constraint a "uno de los dos firma":
    ```rust
    // Pseudocódigo
    constraint = user.is_signer || authority.is_signer @ PoolError::UnauthorizedClaim
    ```
  - Mantener fee validation contra `pool.authority`.
  - Resto del payout math sin cambios.
- `programs/parimutuel_pools/src/lib.rs`: re-export sin cambios (no nueva
  instrucción).
- **`refund.rs` NO se toca** - ya es authority-only (`refund.rs:49`,
  user marcado como `AccountInfo`, no `Signer`).

**Operación:**
- `anchor build` → IDL nuevo.
- Redeploy en devnet (upgradeable, flujo existente).
- Regenerar `packages/solana-client/src/idl/parimutuel_pools.json`.
- `pnpm --filter solana-client build` + commitear `dist/` fresco
  (footgun ya documentado).

**Tests on-chain** (`programs/parimutuel_pools/tests/`):
- Claim con user signer (existente).
- Claim con authority signer (nuevo). Mismo payout esperado.
- Claim con ambos (degenerate: user firma + authority co-firma, sigue OK).

### Fase 2 - Backend `autoClaimBets()` (1d)

**Nuevo módulo `apps/api/src/scheduler/auto-claim.ts`** (espejo de
`autoRefundBets()`):

```typescript
// Pseudocódigo de alto nivel
export async function autoClaimBets(
  poolId: string,
  pool: PoolWithState,
  attempts = AUTO_CLAIM_MAX_RETRIES, // 3
): Promise<AutoClaimResult>
```

Estructura:
1. Query: `prisma.bet.findMany({ where: { poolId, claimed: false, side: pool.winnerSide } })`.
   - **Importante**: NO incluir losers. Hedged user con UP+DOWN: solo se
     toma la fila ganadora.
2. Para cada bet:
   - Pre-check: `if (bet.claimed) skip` (idempotencia post-fetch race).
   - `getOrCreateAssociatedTokenAccount(connection, authorityKeypair, usdcMint, userPubkey)` - crea ATA si falta. Authority paga ~0.002 SOL.
   - Derive UserBet PDA con `(pool, user, side)`.
   - `buildClaimIx(...)` con `side` correcto, fee_bps según
     `getFeeBps(user.level)`.
   - Enviar con `RpcConnectionManager` (failover/rotation existente).
   - Confirmar con `confirmed` commitment.
   - **Atomic update**:
     ```typescript
     await prisma.bet.update({
       where: { id: bet.id, claimed: false }, // optimistic lock
       data: { claimed: true, claimTx, payoutAmount, lastAttemptedAt: new Date(), payoutAttempts: { increment: 1 } },
     });
     ```
   - `eventLog.create({ eventType: 'BET_AUTO_PAID', payload: { betId, tx, amount } })`.
   - Award rewards: `awardBetWin(walletAddress)` - XP + coins + streak.
   - Emit WS: `wallet:payout` con `{ amount, tx, xp, coins, level, streak }`.
   - Create notification: `BET_PAID` con tx link + XP/coins inline.
3. Si una bet falla:
   - Marcar `payoutFailed = true`, `payoutAttempts += 1`,
     `lastAttemptedAt = now`.
   - Si `payoutAttempts < 3`: retry después de backoff (2s, 4s, 8s).
   - Si `payoutAttempts >= 3`: alerta admin via event log
     (`PAYOUT_FAILED_PERMANENT`), fallback manual queda disponible.
4. Rate-limit interno: paralelizar máx 4, secuencializar el resto.

**Hooks de integración:**

En `apps/api/src/scheduler/pool-resolver.ts:processClaimableTransitions`:
```typescript
// Pseudocódigo
for (const pool of staleResolved) {
  await transitionToClaimable(pool);
  if (autoPayoutEnabledFor(pool)) {
    autoClaimBets(pool.id, pool).catch(err => logger.error('auto-claim failed', err));
  }
}
```

En `awardBetWin` (`apps/api/src/services/rewards.ts`):
- Hoy se llama desde `confirm-claim`. Ahora también desde `autoClaimBets`.
- **Critical**: idempotency check - si `bet.claimed=true` ya y reward
  log existe para esta bet, skip. Sin esto, doble-award si user reclama
  manual y auto-pago dispara concurrentemente.

**Feature flag**:
- ENV: `AUTO_PAYOUT_ENABLED` (default `false` en prod).
- DB: `pool_category.config.autoPayoutEnabled` (granular por categoría).
- Helper: `autoPayoutEnabledFor(pool)` consulta ambos (env AND category).
- Default OFF para v1 release.

**Endpoints existentes - mantener como fallback:**
- `POST /api/transactions/claim` (prepare/confirm): sin cambios. User
  puede seguir reclamando manual. Si bet ya tiene `claimed=true`, devuelve
  400 con mensaje "Already paid".

### Fase 3 - Frontend cleanup (3-6h)

**Quitar UI activa de claim (cuando feature flag está ON):**

- `apps/web/src/components/profile/PoolsBetTable.tsx`,
  `BetRow.tsx`:
  - Si `bet.claimed && bet.claimTx`: chip verde "Paid" + link al tx.
  - Si `bet.payoutFailed && bet.payoutAttempts >= 3`: chip rojo
    "Claim manually" + botón abre flujo viejo.
  - Si `bet.isWinner && !bet.claimed && !bet.payoutFailed`: chip gris
    "Paying soon…" con tooltip "Auto-paid within 30s of resolution".
- `apps/web/src/app/profile/page.tsx`: drop banner "Claim All" cuando
  flag ON.
- `apps/web/src/components/MarketCard.tsx`: chip "Claim" → "Won"/"Paid"/"Refunded".
- `apps/web/src/hooks/useClaim.ts`, `useClaimableBets.ts`: deprecar (no
  borrar - fallback). Wrap en `if (!autoPayoutEnabled || bet.payoutFailed)`.

**Notificaciones:**

Tipo nuevo `BET_PAID` con shape:
```typescript
{
  type: 'BET_PAID',
  title: 'You won $12.50',
  message: 'BTC/USD 1h • +200 XP • +12 UP',
  poolId,
  txSignature,
  severity: 'success',
}
```

Toast más prominente, confetti, 10s display.

**Detección de feature flag en frontend**:
- `GET /api/config/feature-flags` devuelve `{ autoPayoutEnabled: boolean }`
  por categoría. Cache en React Query 1min.
- UI condicional: si flag OFF, mostrar botón Claim viejo.

### Fase 4 - Admin Panel (1d) - NUEVO en v2

**Nueva tab "Payouts"** en `apps/web/src/app/admin/page.tsx`, posición
#3 (después de "Pools", antes de "Finance").

**Componente `PayoutManagement.tsx`** con 4 secciones:

#### 4a. Authority wallet monitor (top)
- Tarjeta con SOL balance + USDC balance del payout wallet.
- Status indicator:
  - 🟢 Verde si SOL > 0.5 + USDC sufficient for outstanding payouts.
  - 🟡 Amarillo si SOL < 0.5 o USDC < expected next 24h.
  - 🔴 Rojo si SOL < 0.1 (no puede pagar gas).
- Botón "Fund wallet" (link a docs internos de cómo recargar).
- Reusa: SystemHealth ya muestra authority SOL - extender.

#### 4b. Failed payouts list
- Query `GET /admin/payouts/failed` - bets con `payoutFailed=true`.
- Tabla con: pool ID, wallet, side, amount, payoutAttempts, lastAttemptedAt, last error.
- Acción por fila: "Retry" → `POST /admin/payouts/:betId/retry`.
- Acción bulk: "Retry all" (botón con confirmación).
- Auto-refresh cada 30s.
- Reusa patrón de PoolManagement (stuck pools).

#### 4c. Pending payouts queue
- Query `GET /admin/payouts/queue` - bets con `isWinner=true && claimed=false && !payoutFailed`.
- Útil para diagnosticar atascos.
- Filtros: por pool, por wallet, por antigüedad.

#### 4d. Migration runner
- One-shot job para procesar pools resueltos sin claim antes de feature
  flag (history).
- Botón "Dry run" (preview de cuántas bets, monto total, sin ejecutar).
- Botón "Execute" con confirmación + razón obligatoria.
- SSE log streaming durante ejecución (patrón ya usado en
  `recover-orphaned-pools`).
- Reusa patrón de ManualActions.

#### 4e. Feature flag controls
- Toggle global: `AUTO_PAYOUT_ENABLED` (env var, requiere restart si
  cambia - surface advertencia).
- Toggle por categoría: switches que llaman a
  `PATCH /admin/categories/:id/feature-flags`.
- Status: pools currently in scope vs out-of-scope.

**Nuevos endpoints admin** (`apps/api/src/routes/admin/payouts.ts`):

```
GET    /admin/payouts/queue          - Lista pending payouts
GET    /admin/payouts/failed         - Lista failed payouts
POST   /admin/payouts/:betId/retry   - Manual retry
GET    /admin/payouts/migration/preview - Dry-run del migration job
POST   /admin/payouts/migration      - Ejecutar migration (SSE)
GET    /admin/payouts/stats          - Success rate, avg latency, etc.
PATCH  /admin/categories/:id/feature-flags - Toggle autoPayoutEnabled
GET    /admin/wallet/balance         - Authority wallet SOL + USDC
```

**Event log additions** - todos los admin actions de payout loguean a
`EventLog`:
- `ADMIN_PAYOUT_RETRY` (single bet)
- `ADMIN_PAYOUT_MIGRATION_DRY_RUN`
- `ADMIN_PAYOUT_MIGRATION_EXECUTED`
- `ADMIN_FEATURE_FLAG_TOGGLED` (con categoría + valor)

### Fase 5 - Testing (1d)

**Smoke tests en devnet:**
- Pool con 1 ganador → paga al toque.
- Pool con 10 → paralelo (max 4), ninguna falla.
- Pool con 100+ → estrés del RPC, verificar rate-limit + retry.
- Refund full pool (one-sided) - ya funciona, sólo verificar no
  regression.
- ATA missing en un user → se crea, se cobra rent al authority, sigue.
- RPC down a propósito → backoff funciona, sigue cuando vuelve.
- Falla irrecuperable → bet marcada `payoutFailed`, retry desde admin
  funciona, fallback manual visible en frontend.
- **Hedged user**: bet UP + bet DOWN en 3-way → solo cobra winning side,
  loser side queda `claimed=false`.
- Bet pre-existente con `claimed=false` y winner ya resuelto: trigger
  manual del job de migración (admin panel) funciona, dry-run muestra
  count correcto.
- **Race condition**: user reclama manual al mismo tiempo que
  `autoClaimBets` corre → no doble-award, no doble-tx (idempotency
  guard).
- Feature flag OFF → auto-payout NO dispara, claim manual sigue
  funcionando.
- Feature flag ON solo CRYPTO → auto-payout dispara solo en pools
  CRYPTO, SPORTS/PM ignorados.

**Integration tests (apps/api/tests/)**:
- `autoClaimBets()` idempotency: llamar 2x consecutivo → solo paga
  una vez.
- `awardBetWin()` doble-call protection: no incrementa streak 2x.

### Fase 6 - Rollout (0.5d)

**Orden:**
1. Deploy backend con `AUTO_PAYOUT_ENABLED=false` + admin tab live → nada
   cambia visiblemente.
2. Encender flag global ON, pero categorías OFF → seguro.
3. Encender categoría **CRYPTO** primero (pocos ganadores por pool,
   bajo riesgo).
4. Monitorear 24-48h: success rate, failed count, authority balance.
5. Encender **SPORTS**.
6. Encender **PM**.
7. **Job de migración** one-shot:
   - Dry-run desde admin → reportar count de bets a procesar.
   - Confirmar.
   - Ejecutar con SSE log.

---

## 5. Esquema DB - cambios

**Bet model** (`apps/api/prisma/schema.prisma:79-98`):

```prisma
// Campos a agregar:
payoutFailed     Boolean   @default(false) @map("payout_failed")
payoutAttempts   Int       @default(0) @map("payout_attempts")
lastAttemptedAt  DateTime? @map("last_attempted_at")
// claimTx y payoutAmount ya existen.
```

**PoolCategory model** (`schema.prisma:506-528`):

`config` JSON ya existe - agregar key `autoPayoutEnabled: boolean` en
el JSON shape. No migración nueva.

**Migration** nueva: `apps/api/prisma/migrations/2026XXXXXXXXX_bet_payout_tracking/`.

---

## 6. Idempotencia, concurrencia, y recovery

### 6.1 Idempotencia per-bet

**Problema**: el job puede correr 2x para el mismo pool (scheduler tick
overlap, retry post-crash, race con user manual claim).

**Solución**:
- Pre-tx check: `if (bet.claimed) return;` (lectura fresh antes de
  construir tx).
- Post-tx atomic update con optimistic lock:
  ```typescript
  await prisma.bet.update({
    where: { id: bet.id, claimed: false }, // <-- lock
    data: { claimed: true, ... },
  });
  ```
  Si otro proceso ya marcó `claimed=true`, esto lanza
  `RecordNotFound` → catch + skip + log warning.

### 6.2 Crash mid-payout

**Escenario**: server muere después de enviar tx pero antes de update
DB.

**Recovery**:
- En reboot, scheduler corre `processClaimableTransitions()` igual.
- `autoClaimBets()` query `claimed=false` incluye esta bet.
- Antes de enviar nueva tx: query Solana for existing UserBet account
  state. Si `userBet.claimed === true` on-chain pero DB dice false →
  reconciliar (mark DB claimed, lookup tx via signature search en últimos
  N blocks).

**Helper**: `reconcileBetState(bet)` corre antes de cada attempt si
`bet.payoutAttempts > 0` (probable crash anterior).

### 6.3 Network partition (tx sent, confirmation lost)

**Escenario**: enviamos tx, RPC timeout antes de confirm.

**Solución**:
- Persistir tx signature en DB **antes** de esperar confirm.
- En retry, primero check signature: si exists on-chain con
  `confirmed`/`finalized`, marcar bet como paid sin re-enviar.

### 6.4 RPC failover

Usar `RpcConnectionManager` existente - rotación automática, no requiere
trabajo nuevo.

---

## 7. Per-side bet PDA - hedging

Con el refactor both-sides reciente, un user puede tener 2 bets en un
pool 3-way (ej. UP + DOWN).

**Caso**: pool 3-way Sports. Alice: $10 UP, $10 DOWN. Resolution: HOME
gana (= UP).

**Auto-payout behavior**:
- Query `WHERE poolId=X AND side=pool.winnerSide AND claimed=false`.
- Solo trae Alice's UP bet.
- DOWN bet de Alice queda `claimed=false` permanente.

**¿Es esto OK?**
- ✅ On-chain: refund.rs solo aplica para "no winner side". DOWN bet de
  Alice no es "no winner" (HOME ganó, no DOWN, pero Alice tiene UP que sí
  ganó). DOWN bet simplemente pierde - eso es el riesgo de hedging.
- ✅ DB: el filtro `claimed=false` no afecta nada (loser bets siempre
  quedan claimed=false en parimutuel - solo se reclama si ganaste).
- ⚠️ UI: la bet DOWN de Alice aparece como "Lost". Hoy aparece igual,
  cero cambio.

**Sin acción adicional.** Documentar en código + comment.

---

## 8. Tournament prizes y squad pools

**Scope v1**: NO incluir.

**Razones**:
- Tournament prizes usan `claim_tournament_prize` (instrucción
  separada, no `claim`). Requiere su propio refactor authority-signed
  + autoTournamentPrize().
- Squad pools usan el mismo `claim.rs` así que **técnicamente** entran
  gratis cuando hagamos opción A. Pero la lógica de XP/coins/notifs es
  distinta (shared squad coins, equipment XP boost, etc - gamification
  scope). Mejor incluirlos cuando squad shared pools v2 se shippee.

**v1.1 (post)**: extender a tournament prizes después de testing v1.

---

## 9. Authority wallet - operations

**Recomendación**: wallet separada para payouts (no usar program
authority).

**Por qué**:
- Blast radius: si payout wallet se compromete, no pierdes control del
  programa.
- Monitoring: balance de payout wallet es señal de health independiente.
- Rotation: rotar payout wallet sin redeploy del programa
  (vs `pool.authority` que está hardcoded por pool).

**Implementación**:
- Nueva env var `PAYOUT_AUTHORITY_KEYPAIR_PATH`.
- En `autoClaimBets()`, usar payout keypair en lugar de program
  authority.
- **Pero**: `claim.rs` requiere que signer sea `pool.authority`. Para
  que payout wallet pueda firmar, debe ser **igual** a `pool.authority`
  O `claim.rs` debe aceptar "signer == pool.authority OR signer ==
  permitted payout authority".

**Decisión**:
- **v1**: usar program authority (simple). Wallet separada es nice-to-
  have, defer.
- **v2**: agregar `pool.payout_authority` field (Pubkey, settable at
  init) + relajar `claim.rs` constraint.

**Balance monitoring v1**:
- Endpoint admin `/admin/wallet/balance` (SOL + USDC).
- Alert si SOL < 0.5 (logger.warn + email opcional).
- UI surface en admin tab Payouts (§4a).

**Rotation procedure v1** (program authority compromise):
- Documentar en `docs/RUNBOOK-AUTHORITY-ROTATION.md` (nuevo doc, scope
  fuera de este plan): pause auto-payout flag, transfer remaining vault,
  redeploy con nueva authority.

---

## 10. Observabilidad

### 10.1 Structured logs

Cada `autoClaimBets()` corrida emite:
```json
{
  "level": "info",
  "msg": "auto_claim_completed",
  "poolId": "...",
  "totalBets": 12,
  "succeeded": 11,
  "failed": 1,
  "totalPayoutUsdc": "...",
  "totalGasSol": "...",
  "durationMs": 4320
}
```

Cada bet individual:
```json
{
  "level": "info",
  "msg": "bet_paid",
  "betId": "...",
  "walletAddress": "...",
  "amount": "...",
  "txSignature": "...",
  "attempt": 1
}
```

Failures:
```json
{
  "level": "error",
  "msg": "bet_payout_failed",
  "betId": "...",
  "attempt": 3,
  "error": "RPC timeout"
}
```

### 10.2 Métricas (endpoint simple)

`GET /admin/payouts/stats` devuelve:
```typescript
{
  last24h: {
    attempted: number,
    succeeded: number,
    failed: number,
    avgLatencyMs: number,
    totalPayoutUsdc: string, // BigInt as string
    totalGasSol: string,
  },
  pending: number, // outstanding winners
  failed: number, // payoutFailed=true outstanding
  authoritySolBalance: string,
  authorityUsdcBalance: string,
}
```

### 10.3 Alertas

V1: log-based (Railway logs).

V2 (post): integrar con notification email/Slack vía nueva env var.

---

## 11. Archivos a tocar (resumen)

```
On-chain (1 file)
└── programs/parimutuel_pools/src/instructions/claim.rs          [modify]

solana-client (rebuild)
├── packages/solana-client/src/idl/parimutuel_pools.json         [regen]
└── packages/solana-client/dist/*                                 [rebuild + commit]

Backend (~6 files)
├── apps/api/prisma/schema.prisma                                 [add fields]
├── apps/api/prisma/migrations/2026XXXX_bet_payout_tracking/      [NEW]
├── apps/api/src/scheduler/auto-claim.ts                          [NEW]
├── apps/api/src/scheduler/pool-resolver.ts                       [hook]
├── apps/api/src/services/rewards.ts                              [idempotency guard]
├── apps/api/src/services/notifications.ts                        [BET_PAID type]
├── apps/api/src/routes/admin/payouts.ts                          [NEW, 8 endpoints]
└── apps/api/src/routes/transactions.ts                           [check claimed before sign]

Frontend (~7 files)
├── apps/web/src/app/admin/page.tsx                               [add Payouts tab]
├── apps/web/src/app/admin/components/PayoutManagement.tsx        [NEW]
├── apps/web/src/components/profile/PoolsBetTable.tsx             [Paid/Pending/Failed chips]
├── apps/web/src/components/profile/BetRow.tsx                    [idem]
├── apps/web/src/components/MarketCard.tsx                        [chip rename]
├── apps/web/src/app/profile/page.tsx                             [drop Claim All if flag ON]
├── apps/web/src/hooks/useClaim.ts                                [fallback only]
├── apps/web/src/hooks/useClaimableBets.ts                        [fallback only]
└── apps/web/src/components/NotificationToasts.tsx                [BET_PAID handling]

Docs
└── docs/PLAN-AUTO-PAYOUT.md                                      [este archivo]
```

**~17 archivos** entre contrato, paquete, backend, frontend y admin.

---

## 12. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Authority sin SOL → no se pagan claims | Endpoint balance + alert + manual claim sigue habilitado |
| RPC rate-limit con muchos winners | `RpcConnectionManager` failover existente; cap parallel 4; backoff exponencial |
| ATA missing del user | Auto-crear (~0.002 SOL recuperables) |
| Tx individual falla 3x | `payoutFailed=true` + retry desde admin + manual fallback |
| Authority compromise | Wallet separada (v2), runbook de rotation (post-v1) |
| Costo acumulado | 1000 wins/día ≈ 0.005 SOL gas + ~$2 ATA rent (recuperable); presupuestable |
| Race condition: user reclama manual + auto-payout corre | Optimistic lock con `where: { claimed: false }` |
| Crash mid-payout | `reconcileBetState()` antes de retry; chequea on-chain primero |
| Hedged user solo cobra una side | Documentado; intencional (hedging tiene su costo) |
| Doble award XP (user manual + auto) | Idempotency check en `awardBetWin` (busca reward_log con `claim_tx`) |
| Migración pools viejos | Dry-run obligatorio + admin confirmación + SSE log |
| Feature flag rollout incorrecto | Cap por categoría + env var double-check |
| Tournament/Squad fuera de scope | Documentado; v1.1 |

---

## 13. Decisiones a confirmar antes de empezar

| # | Decisión | Default propuesto | Necesita confirmación |
|---|---|---|---|
| 1 | Migrar pools resueltos sin claim históricos | Sí, via admin one-shot con dry-run + cap "últimos 30 días" para v1 | ✅ |
| 2 | Tournament prizes - mismo flujo o manual | **Fuera de scope v1**, manual; v1.1 después | ✅ |
| 3 | Squad pools - mismo flujo | Entran gratis con Opción A; verificar XP/notif lógica está OK | ✅ |
| 4 | Authority wallet separada para payouts | **v1: usar program authority**; v2: agregar `pool.payout_authority` | ✅ |
| 5 | ATA missing - auto-crear vs skip | Auto-crear (UX matters) | ✅ |
| 6 | Hedged user (UP+DOWN en 3-way) | **Pagar winning side, loser queda lost (intencional)** | ✅ |
| 7 | Multi-sig payout wallet | **No v1**, reconsiderar si volumen crece | ✅ |
| 8 | Notif `BET_PAID` incluye XP/coins inline | **Sí**, unifica 3 toasts en 1 | ✅ |
| 9 | Feature flag granularity | env var + DB flag por `pool_category` | ✅ |
| 10 | Failed payout retry | 3 automático con backoff + manual desde admin | ✅ |
| 11 | Real money vs devnet | **devnet ahora**, mainnet decision separada | ✅ |

---

## 14. Resumen ejecutivo

- **Total: 5-7 días** focused dev.
- **Distribución**:
  - 0.5d discovery + alineación
  - 2-3h on-chain (`claim.rs` única condición)
  - 1d backend (`autoClaimBets` mirroring `autoRefundBets`)
  - 3-6h frontend (chips + notif type)
  - 1d **admin panel** (tab nueva + 8 endpoints)
  - 1d testing
  - 0.5d rollout
- **Cambio crítico**: una condición en `claim.rs`. Resto ya está.
- **Fallback obligatorio**: claim manual queda como fallback, surface si
  `payoutFailed`.
- **Admin tab Payouts**: monitoring + manual retry + migration runner +
  feature flags.
- **Rollout gradual**: CRYPTO → SPORTS → PM, detrás de feature flag por
  categoría.
- **Coexistencia con gamificación**: shipear **primero**; gamification
  asume auto-payout activo.

---

## 15. Documentos relacionados

- [STRATEGY-COLD-START-AND-XP.md](./STRATEGY-COLD-START-AND-XP.md) -
  contexto estratégico del cold-start problem.
- [IMPLEMENTATION-PLAN-GAMIFICATION.md](./IMPLEMENTATION-PLAN-GAMIFICATION.md)
  - plan de gamificación. **Depende de este** (auto-payout es
  pre-requisito de Wave 2).
- [PLAN-BOTH-SIDES-BETTING.md](./PLAN-BOTH-SIDES-BETTING.md) - refactor
  per-side PDA, ya shipped. Contexto del hedging.

---

## Appendix - auditorías que armaron este v2

- Audit de `claim.rs`, `refund.rs`, `state.rs`, scheduler de resolución,
  y solana-client builders (2026-05-30).
- Audit del admin panel completo (tabs, auth, patrones, gaps) (2026-05-30).
- Findings clave que cambiaron el scope desde v1:
  - `refund.rs` ya authority-signed.
  - `autoRefundBets()` ya con retries + backoff.
  - Per-side PDA fully shipped.
  - DB tracking gaps confirmados.
  - Admin panel necesita tab nueva.
