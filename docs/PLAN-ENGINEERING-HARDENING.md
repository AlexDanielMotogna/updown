# Plan: Engineering Hardening (post-audit)

> Estado: **en progreso**. Rama: `chore/eng-hardening`.
> Origen: auditoría senior (grade **C**, _Request Changes_; **Block Merge** antes de mainnet con dinero real).

## Objetivo
Atacar la deuda técnica y de seguridad detectada, priorizada por **riesgo × impacto**.
No es un rewrite: son refactors incrementales en PRs pequeños, cada uno con typecheck + (idealmente) test.

---

## Backlog priorizado

### 🔴 P0 — Bloqueantes antes de mainnet (dinero / seguridad)
- **P0.1 — Secretos fuera del `.env`.** La clave privada de la authority (controla fondos), `LIQUIDITY_BOT_KEYS` y el password de Postgres prod están en texto plano en `apps/api/.env`. → mover a un Secrets Manager / KMS (o al menos variables de entorno inyectadas por la plataforma, nunca en disco/repo). Rotar claves tras la migración.
  *Owner: infra (no es code-only).*
- **P0.2 — Suite de tests sobre la lógica de dinero.** Hoy ~1 test. El cálculo parimutuel, `resolve`, `refund`, `refund_bettor`, `claim`, `close_*` no tienen tests. Un bug aquí mueve fondos. → tests unitarios del cálculo + tests de integración del scheduler con un validador local / mocks de Connection.

### 🟠 P1 — Alto ROI de código (de-risk del money-path)
- **P1.1 — Extraer capa de envío de tx on-chain (DRY).** El patrón `new Transaction().add(ix) → getLatestBlockhash → sign → sendRawTransaction → confirmTransaction → check err` está copiado en **15 archivos**. → `sendAndConfirm(ixs, signer, opts)` único. **← EMPEZAMOS AQUÍ.**
- **P1.2 — Partir god-functions del money-path.** `resolveMatchPools()` (165 L) → `resolveFinished()` / `voidCancelled()` / `closeEmptyPool()`. `sports-scheduler.ts` (718 L) en módulos por responsabilidad.
- **P1.3 — Eliminar `any` en la capa on-chain/pagos** (72 `any` en api+admin; el peor es `priceProvider: null as any` propagado por el money-path).

### 🟡 P2 — Mantenibilidad
- **P2.1 — Partir mega-componentes:** TournamentManagement (937), polymarket-sync (891), MatchExplorer (847), CategoryManagement (838) → feature-folders (form / table / dialog / hook).
- **P2.2 — Centralizar tipos** en `types/` derivados de Prisma + IDL (hoy `ZombiePool`, `StuckKnockout`, `RecentBet`… duplicados).
- **P2.3 — Adoptar `useAdminResource`/`DataTable`/`Paginator`** en el resto; eliminar los **8 `fetch()` crudos** de CategoryManagement.
- **P2.4 — Generar discriminadores del IDL** en `solana-client`, no a mano (`[233,73,...]`).

### 🟢 P3 — Performance / pulido
- Virtualización de tablas grandes (EventLog, closures, pools).
- Auditar `getProgramAccounts` → `dataSlice` + filtros memcmp en todos los paths.
- Batching de tx en bucles de refund.
- Lazy-load / code-split de los mega-componentes del admin.

---

## Criterios de aceptación por ítem
- Typecheck limpio (`pnpm --filter <pkg> exec tsc --noEmit`).
- Sin cambio de comportamiento observable (salvo el que se documente).
- PR pequeño y revisable; un ítem por PR cuando sea posible.

---

## Execution log
- **P1.1 — ✅ COMPLETADO.** `sendAndConfirm` en `apps/api/src/utils/onchain.ts`, adoptado en **13 archivos / ~30 copias**, **−~320 líneas** de boilerplate:
  - scheduler: `onchain-tx` (6), `sports-scheduler` (4), `pm-cancel` (3), `orphan-recovery` (4), `auto-claim` (1), `pool-creator` (1).
  - services: `polymarket/resolver`, `referrals`, `tournament`, `squad-pools` (3), `liquidity-bot/{bot,funding}`.
  - routes: `admin/sports-explorer`, `faucet`, `tournament-actions` (1).
  - **Excepciones intencionales** (NO encajan — el usuario co-firma; authority `partialSign` + user feePayer): `routes/claims.ts`, `tournament-actions` (winner-claim), `squad-pools` (deposit). Documentadas, no forzadas.
  - Typecheck limpio. Semántica por call-site preservada (try/catch return vs throw, skipPreflight, fire-and-forget→ahora confirma en tournament-init).
- **Siguiente:** P1.2 (partir `resolveMatchPools` 165L + god-functions).
