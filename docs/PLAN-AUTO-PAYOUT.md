# Plan — Auto-Payout (eliminar el flow de Claim)

> Estado: PROPUESTA (no implementado). Objetivo: cuando un pool resuelve, el
> servidor paga automáticamente a cada ganador con una transferencia
> authority-signed, sin que el usuario tenga que firmar un `claim`. Mismo trato
> para refunds (one-sided). Estimación total: **4-6 días**.

---

## 1. Por qué el contrato debe cambiar

El `claim` actual del programa Anchor es **`user_signed`** — el wallet del
ganador firma la transferencia desde el vault. Para automatizar, el **authority**
tiene que poder firmar en lugar del usuario. Sin tocar el contrato no hay forma:
no podés "impersonar" al user desde el backend.

**Approach descartado:** meter el payout dentro de `resolve`. Solana impone
~1232 bytes de tx + ~1.4M CU. Con remaining accounts + ALT entran ~24-30
ganadores por tx. Pools PM con cientos de bettors no entran ni con batching
agresivo. → **No viable como camino principal.**

**Approach elegido:** dejar `resolve` como está y agregar a `claim`/`refund`
una segunda variante (o un check) que acepte la `authority` como signer válido.
Un job backend itera ganadores post-resolución y los paga.

---

## 2. Fases y estimaciones

### Fase 0 — Discovery + alineación (0.5d)

- Auditar todos los caminos del claim actual (squad pools, tournament prizes,
  refunds parciales/totales).
- Decidir si la **claim manual** se queda como fallback (recomendación: **sí**,
  oculta por defecto, surface en notificación si el auto-payout falló).
- Confirmar: ¿migrar pools con wins pendientes o aplicar solo a pools nuevos?
- Confirmar: tournament prizes (entry-fee escrow) — ¿mismo flujo o separado?

### Fase 1 — On-chain (3-5h)

**Cambios:**
- `programs/parimutuel_pools/src/instructions/claim.rs`: aceptar
  `signer == bet.user || signer == authority`. La cuenta destino sigue siendo
  el ATA del user (no se puede pagar a otra cuenta). Misma lógica de cálculo de
  payout, mismo decremento del vault, misma marca de claimed.
- `programs/parimutuel_pools/src/instructions/refund.rs`: idem.
- (`resolve.rs` no toca.)
- `lib.rs`: re-export.

**Operación:**
- `anchor build` → IDL nuevo.
- Redeploy en devnet (es upgradeable, ya tienen flujo con keypair del program).
- Regenerar `packages/solana-client/src/idl/parimutuel_pools.json`.
- `pnpm --filter solana-client build` y **commitear `dist` fresco** (el repo
  tiene `dist` tracked, así que rebuild + commit es obligatorio — ya nos comimos
  ese footgun una vez).

**Tests on-chain:** dos unit tests anchor — claim con user signer (ya funciona),
claim con authority signer (nuevo). Refund idem.

### Fase 2 — Backend auto-payout (1.5-2d)

**Nuevo módulo `apps/api/src/services/auto-payout.ts`:**
- `runAutoPayoutForPool(poolId)`:
  1. Query `prisma.bet.findMany({ where: { poolId, isWinner: true, claimed: false } })`.
  2. Para cada bet:
     - `getOrCreateAssociatedTokenAccount(connection, authorityKeypair, usdcMint, userPubkey)` — crea ATA si falta. Authority paga ~0.002 SOL recuperables.
     - `buildClaimIx(...)` con la nueva variante authority-signed.
     - Enviar con la connection del `RpcConnectionManager` (ya tiene failover/rotation).
     - Confirmar.
     - Atomic update: `bet.update({ claimed: true, claimTx, payoutAmount })` + `eventLog` row + `emitWalletPayout` por WS + `notification` ("You won $X").
  3. Rate-limit interno: max N en paralelo (default 4), backoff exponencial en RPC errors.
  4. Si una bet falla irreparablemente (ATA no se puede crear, signature inválida): la marca como `payoutFailed = true` y la deja para fallback manual + alerta admin.

**Integración:**
- Hook en el lugar donde hoy se transiciona `pool.status → RESOLVED` o
  `CLAIMABLE`, dispará `runAutoPayoutForPool(poolId)` (fire-and-forget con
  catch a logger). Probablemente en `services/scheduler.ts` o donde se llama
  `emitPoolStatus(...)`.
- Recompensas (`awardBetResolution`): ya migradas a resolución, sin cambios.

**Refunds:** mismo módulo, función `runAutoRefundForPool(poolId)` — itera bets,
authority-signed refund, marca `refunded`.

**Endpoints existentes:**
- `POST /api/transactions/claim` (prepare/confirm): **mantener** como fallback
  manual. Agregar header `X-Fallback` o un flag para que el cliente solo lo use
  si el auto-payout falló.

**Monitoring:**
- Endpoint admin `/api/admin/payout-status?poolId=` que devuelve el estado por
  bet (pendiente, pagado, falló) — útil cuando algo se atasca.
- Métrica simple: balance del authority wallet (ya existe? si no, endpoint chico
  que el admin pueda consultar).

### Fase 3 — Frontend cleanup (3-6h)

**Quitar UI activa de claim:**
- `apps/web/src/components/profile/PoolsBetTable.tsx`, `BetRow.tsx` — el botón
  "Claim" desaparece; mostrar "Paid" con link al tx, o "Pending" si el
  auto-payout aún no procesó.
- `apps/web/src/app/profile/page.tsx` — banner "Claim All" fuera.
- `apps/web/src/components/MarketCard.tsx` — chip "Claim" → "Paid"/"Won"/"Refunded".
- `apps/web/src/hooks/useClaim.ts`, `useClaimableBets.ts` — deprecar o convertir
  en hooks de fallback (mostrar "Stuck? Claim manually" si `payoutFailed`).

**Notificaciones:** actualizar copys
(`buildNotification('BET_PAID_OUT', ...)`) — un toast nuevo "You won $X — paid"
con tx link. Reusa el sistema actual.

**Estados de UI nuevos:**
- `Pending payout` (pool ya resuelto, bet aún sin `claimTx`): chip gris "Paying
  soon…".
- `Paid` (con `claimTx`): chip verde "Paid" + link.
- `Payment failed` (`payoutFailed: true`): chip rojo "Claim manually" + botón
  que abre el flujo viejo manual.

### Fase 4 — Testing (1d)

**Smoke tests en devnet:**
- Pool con 1 ganador → paga al toque.
- Pool con 10 → paralelo, ninguna falla.
- Pool con 100+ → estrés del RPC, verificar rate-limit + retry.
- Refund full pool (one-sided).
- ATA missing en un user → se crea, se cobra rent al authority, sigue.
- RPC down a propósito → backoff funciona, sigue cuando vuelve.
- Falla irrecuperable → bet marcada `payoutFailed`, notificación, fallback
  manual visible en frontend.
- Bets pre-existentes con `claimed: false` y `winner` ya resuelto: trigger
  manual del job de migración (ver Rollout).

### Fase 5 — Rollout (0.5d)

**Feature flag**: env var `AUTO_PAYOUT_ENABLED` + opcional flag por categoría
de pool (`pool_category.auto_payout_enabled` en DB). Default OFF en producción.

**Orden:**
1. Deploy backend con flag OFF — nada cambia.
2. Encender flag para **CRYPTO** primero (pocos ganadores por pool → bajo
   riesgo + barato).
3. Monitorear 24-48h.
4. Encender para **SPORTS**.
5. Encender para **PM**.
6. Job de migración one-shot: procesar bets de pools ya resueltos pero sin
   claim, autopagar. Hecho desde un endpoint admin con confirmación.

---

## 3. Archivos a tocar

```
On-chain
├── programs/parimutuel_pools/src/instructions/claim.rs       (modificar)
├── programs/parimutuel_pools/src/instructions/refund.rs      (modificar)
└── programs/parimutuel_pools/src/lib.rs                       (re-export)

solana-client
├── packages/solana-client/src/idl/parimutuel_pools.json      (regenerar)
├── packages/solana-client/src/instructions/index.ts          (nueva firma authority-signed)
├── packages/solana-client/dist/*                              (rebuild + commit)

Backend
├── apps/api/src/services/auto-payout.ts                       (NEW)
├── apps/api/src/services/scheduler.ts                         (hook)
├── apps/api/src/services/rewards.ts                           (verificar XP en resolve)
├── apps/api/src/routes/transactions.ts                        (claim manual = fallback)
├── apps/api/src/routes/admin.ts                               (endpoints monitoring + migration)
└── apps/api/prisma/schema.prisma                              (Bet.payoutFailed, claimTx ya existe)

Frontend
├── apps/web/src/components/profile/PoolsBetTable.tsx
├── apps/web/src/components/profile/BetRow.tsx
├── apps/web/src/components/MarketCard.tsx
├── apps/web/src/app/profile/page.tsx                          (drop ClaimAll banner)
├── apps/web/src/hooks/useClaim.ts                             (manual = fallback)
├── apps/web/src/hooks/useClaimableBets.ts                     (idem)
└── apps/web/src/lib/api.ts                                    (deprecar shape claim)

Docs
└── docs/PLAN-AUTO-PAYOUT.md                                   (este archivo)
```

**~15-18 archivos** entre contrato, paquete, backend y frontend. El cambio
on-chain es chico (una condición); el grueso es el job de backend con su
manejo de fallos.

---

## 4. Riesgos y trade-offs

| Riesgo | Mitigación |
|---|---|
| Authority sin SOL → no se pagan claims | Alerta automática sobre balance, fallback manual disponible |
| RPC rate-limit con muchos winners | `RpcConnectionManager` ya tiene failover; paralelizar con cap (4); backoff exponencial |
| ATA missing del user | Auto-crear (~0.002 SOL recuperables que paga authority) |
| Tx individual falla | Reintentar 3x con backoff; al cuarto `payoutFailed: true` + fallback manual surfaced |
| Single point of failure: authority wallet | Considerar wallet separada solo para payouts, fondeada con monitoring |
| Costo acumulado de fees + rent | 1000 wins/día ≈ 0.005 SOL fees + variable ATA rent; budget previsible |
| UX: pierde el "click" satisfaction | Toast más prominente "+$X.XX won — paid" con animación |
| Migración de pools viejos sin claim | Endpoint admin one-shot con confirmación + dry-run |

---

## 5. Confirmar antes de empezar

1. **Migración**: ¿procesar pools ya resueltos sin claim (one-shot) o solo
   pools nuevos? Hay ~N bets pendientes en prod (verificar).
2. **Tournament prizes**: ¿mismo flujo (auto-pay al ganador del torneo) o se
   queda manual?
3. **Squad pools**: ¿mismo flujo o se queda manual?
4. **Authority wallet**: ¿usar el mismo authority de hoy o separar uno para
   payouts (mejor para monitoring y blast-radius)?
5. **ATA missing**: ¿auto-crear (paga rent authority) o saltear → fallback
   manual? Recomendación: auto-crear (mejor UX, costo controlable).

---

## 6. Resumen ejecutivo

- **Total: 4-6 días** focused dev.
- **Distribución**: 0.5d discovery + 3-5h on-chain + 1.5-2d backend +
  3-6h frontend + 1d testing + 0.5d rollout.
- **Cambio crítico**: el contrato (`claim`/`refund` aceptan authority signer).
  Sin eso no se puede.
- **Fallback obligatorio**: dejar la claim manual disponible (oculta) para
  cualquier ganador que el auto-payout no haya podido pagar.
- **Rollout gradual**: CRYPTO → SPORTS → PM, detrás de feature flag.
- **Costo operacional**: gas + ATA rent + monitoring del authority wallet.
