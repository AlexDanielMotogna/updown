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
  - **Slice 1 — ✅ (commit `9dd4393`).** Matemática de pago on-chain. Extraído `Pool::winnings_for(weight, winner)` (fuente única; `claim.rs` lo llama — refactor puro, verificado por compile + test). Suite centralizada **`programs/parimutuel_pools/tests/money_math.rs`** (14 tests): `multiplier_bps` (bordes), `total_pool` (suma/overflow), `winnings_for` (split por peso, NoWinningBets) y **conservación** (winnings == losing pool, nunca paga de más; dust < 1/ganador queda en vault).
    - **Toolchain:** Windows nativo no linkea Rust (GNU `link` tapa el `link.exe` de MSVC). Tests corren en **WSL**: `cargo test -p parimutuel_pools --test money_math` → 14 passed. ⚠️ Antes de deploy: `anchor build` (BPF) — este commit solo validó host.
  - **Slice 2 — ✅ (off-chain/vitest, commits `82caa14`, `ead3786`).** La lógica pura que decide **quién cobra**:
    - **2a** `apps/api/src/services/sports/regulation-time.test.ts` (8 tests): `regulationWinner`/`wentBeyondRegulation` — score→HOME/AWAY/DRAW, y DRAW si fue a prórroga/penales (un penalti ganado es empate de regulación). Cubre todos los tokens AET/PEN de las 3 APIs, case-insensitive, set-membership (no substring).
    - **2b** `apps/api/src/scheduler/resolve-logic.test.ts` (6 tests): extraído `winnerForPrices(strike, final)` (antes inline en `resolvePool`) y testeado + `pricesForSideWin` como su inversa exacta (round-trip).
    - Corren nativo: `pnpm --filter api exec vitest run <archivo>`. ⚠️ **Suite global roja por env:** `bets/pools/transactions/pool-scheduler` fallan sin DB / `AUTHORITY_SECRET_KEY` (pre-existente, no por estos cambios) — arreglar el harness (mocks/env) es trabajo aparte de P0.2.
  - **Pendiente P0.2 — Slice 3 (off-chain):** `voidSportsPool` (no marcar CANCELLED si un refund falla), `resolveFinishedPool`/`closeEmptyResolvedPool` — requieren exportarlas + mockear ~13 deps o inyectar deps. **Slice 4 (Rust):** `refund`/`refund_bettor`/`close_*`, y `deposit` weight_added.

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
- **P1.2 — 🟡 EN PROGRESO.** Partido `resolveMatchPools` (145L) en `sports-scheduler.ts`:
  - `resolveMatchPools()` ahora es solo orquestador (~50L): query + batch-read cache → dispatch a void / resolve.
  - `resolveFinishedPool(pool, result)`: score update + betCount → close (empty) o resolve-on-chain (bets) + XP.
  - `closeEmptyResolvedPool(pool, result, winnerSide, winnerLabel)`: rama empty (reclaim rent / stale-layout tolerante).
  - **Cero cambio de comportamiento** (verificado por diff línea-a-línea): `continue`→`return`, `throw` sigue propagando al catch del orquestador, mismas tx/DB-writes en el mismo orden. Único cleanup: eliminado `const connection = getConnection()` (dead code tras P1.1). Typecheck limpio.
  - **Falta:** partir el resto de `sports-scheduler.ts` (718L) en módulos por responsabilidad (creación / resolución / sweep / void).
- **Siguiente:** terminar P1.2 (modularizar el archivo) o P1.3 (eliminar `any`).
