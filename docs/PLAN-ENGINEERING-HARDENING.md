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
- **P0.2 — ✅ NÚCLEO COMPLETO (4 slices).** Suite de tests sobre la lógica de dinero. Era ~1 test. El cálculo parimutuel, `resolve`, `refund`, `refund_bettor`, `claim`, `close_*` no tienen tests. Un bug aquí mueve fondos. → tests unitarios del cálculo + tests de integración del scheduler con un validador local / mocks de Connection.
  - **Slice 1 — ✅ (commit `9dd4393`).** Matemática de pago on-chain. Extraído `Pool::winnings_for(weight, winner)` (fuente única; `claim.rs` lo llama — refactor puro, verificado por compile + test). Suite centralizada **`programs/parimutuel_pools/tests/money_math.rs`** (14 tests): `multiplier_bps` (bordes), `total_pool` (suma/overflow), `winnings_for` (split por peso, NoWinningBets) y **conservación** (winnings == losing pool, nunca paga de más; dust < 1/ganador queda en vault).
    - **Toolchain:** Windows nativo no linkea Rust (GNU `link` tapa el `link.exe` de MSVC). Tests corren en **WSL**: `cargo test -p parimutuel_pools --test money_math` → 14 passed. ⚠️ Antes de deploy: `anchor build` (BPF) — este commit solo validó host.
  - **Slice 2 — ✅ (off-chain/vitest, commits `82caa14`, `ead3786`).** La lógica pura que decide **quién cobra**:
    - **2a** `apps/api/src/services/sports/regulation-time.test.ts` (8 tests): `regulationWinner`/`wentBeyondRegulation` — score→HOME/AWAY/DRAW, y DRAW si fue a prórroga/penales (un penalti ganado es empate de regulación). Cubre todos los tokens AET/PEN de las 3 APIs, case-insensitive, set-membership (no substring).
    - **2b** `apps/api/src/scheduler/resolve-logic.test.ts` (6 tests): extraído `winnerForPrices(strike, final)` (antes inline en `resolvePool`) y testeado + `pricesForSideWin` como su inversa exacta (round-trip).
    - Corren nativo: `pnpm --filter api exec vitest run <archivo>`. ⚠️ **Suite global roja por env:** `bets/pools/transactions/pool-scheduler` fallan sin DB / `AUTHORITY_SECRET_KEY` (pre-existente, no por estos cambios) — arreglar el harness (mocks/env) es trabajo aparte de P0.2.
  - **Slice 3 — ✅ (off-chain/vitest, commit `d03a42e`).** `apps/api/src/scheduler/sports-scheduler.test.ts` (4 tests): `voidSportsPool` refund→cancel safety. Invariante de fondos: **nunca marcar CANCELLED si un bettor sigue debiendo**. Casos: error inesperado de refund → NO cancela; aborta al primer fallo; happy-path refund de todos + CANCELLED; AlreadyClaimed idempotente. Exportada la fn; mocks solo de las hojas; fake timers para el delay de 2s.
  - **Slice 4 — ✅ (Rust, commit `b714712`).** `refund.rs` era una **3ª copia** de la fórmula de `claim` → ahora llama `Pool::winnings_for` (fuente única en claim+refund). +2 tests en `money_math.rs` (16 total). `refund_bettor` (devuelve principal) y `close_*` (guards) no tienen matemática que extraer.
  - **P0.2 — núcleo COMPLETO.** Matemática on-chain (claim/refund/multiplier/conservación) + reglas de ganador off-chain (sports/crypto) + safety de void. Lo que queda fuera de P0.2-núcleo: arreglar el harness vitest (env/DB) para correr la suite entera; tests de integración con validador local (litesvm/bankrun) para los handlers completos de las instrucciones.

### 🟠 P1 — Alto ROI de código (de-risk del money-path)
- **P1.1 — Extraer capa de envío de tx on-chain (DRY).** El patrón `new Transaction().add(ix) → getLatestBlockhash → sign → sendRawTransaction → confirmTransaction → check err` está copiado en **15 archivos**. → `sendAndConfirm(ixs, signer, opts)` único. **← EMPEZAMOS AQUÍ.**
- **P1.2 — Partir god-functions del money-path.** `resolveMatchPools()` (165 L) → `resolveFinished()` / `voidCancelled()` / `closeEmptyPool()`. `sports-scheduler.ts` (718 L) en módulos por responsabilidad.
- **P1.3 — Eliminar `any` en la capa on-chain/pagos** (72 `any` en api+admin; el peor es `priceProvider: null as any` propagado por el money-path).
  - **Data-shape `any` — ✅ parcial (commit `fc00207`).** `category-config.ts` 17→0 (tipo `CategoryConfigJson` + helper `asConfig` para el JSON column `config`; `mapRow` tipado con el modelo Prisma). `serializers.ts` 6→0 (campos sports/PM opcionales explícitos en vez de `Record<string,any>`; quitados los `(bet.pool as any)`). api `any`: 71→46. **Resto (~46)**: patrones dispersos y awkward (builders de Prisma con claves dinámicas `where/data: any` → tipar reintroduce casts enum/index; augmentación de objetos de respuesta `(x as any).campo=`). Bajo ROI; dejar/oportunista.
  - **Money-path `any` — ✅ (commits `05bcf3d`, `204a8e4`).** (1) El peor: split de tipos `OnChainDeps` (prisma/connection/wallet) ⊂ `ResolverDeps` (+priceProvider); las 7 helpers de `onchain-tx` toman `OnChainDeps`; `voidSportsPool` construye un `OnChainDeps` tipado sin cast → `null as any` eliminado. (2) `resolveFeeBps` en `utils/payout.ts` tipado (no más `args: any`); +`payout.test.ts` (7 tests) para `calculatePayout`/`calculateWeightedPayout`.
  - **Pendiente:** quedan ~69 `any` NO-money-path (forma de datos / JSON): `category-config` 17, `tournaments` 10, `serializers` 6, `polymarket-explorer` 5… Retorno decreciente; barrido cuando convenga.

### 🟡 P2 — Mantenibilidad
- **P2.1 — Partir mega-componentes:** TournamentManagement (937), polymarket-sync (891), MatchExplorer (847), CategoryManagement (838) → feature-folders (form / table / dialog / hook).
  - **✅ 4 mega-componentes partidos (commits `c682649`, `3332d5a`, `1a385e6`, `fe9983c`).** Todos move puro, typecheck limpio, imports huérfanos eliminados:
    - TournamentManagement 937 → 723 (`tournament-config.ts` + `TournamentRow.tsx`). _Falta opcional: extraer los diálogos Create/Edit/Assign/Resolve._
    - MatchExplorer 847 → 464 (`match-explorer-config.ts` + `MatchExplorerDialogs.tsx` con BrowseSdb/AddCategory).
    - CategoryManagement 838 → 187 (`category-management-config.ts` + `CategoryCard.tsx` + `CategoryEditDialog.tsx`).
    - PmExplorer 566 → 437 (`pm-explorer-config.ts` + `PmExplorerDialogs.tsx`). _Diálogos create/resolve se quedan (cierran sobre estado del padre)._
    - Patrón: módulo `*-config.ts` (tipos+constantes+helpers, sin acoplar a React) que comparten padre e hijos para evitar ciclos; sub-componentes props-driven a su archivo. Verificación: solo `tsc` (el front no tiene tests).
- **P2.2 — Centralizar tipos** en `types/` derivados de Prisma + IDL (hoy `ZombiePool`, `StuckKnockout`, `RecentBet`… duplicados).
- **P2.3 — Adoptar `useAdminResource`/`DataTable`/`Paginator`** en el resto; eliminar los **8 `fetch()` crudos** de CategoryManagement.
- **P2.4 — Generar discriminadores del IDL** en `solana-client`, no a mano (`[233,73,...]`).
  - **✅ Resuelto vía test de drift (commit `648e94b`), no reemplazo en runtime.** Reemplazar los 17 discriminadores a mano por valores del IDL en runtime es un edit del money-path arriesgado; en su lugar `apps/api/src/onchain-discriminators.test.ts` (20 tests) construye cada instrucción y verifica que sus 8 bytes == `sha256("global:<name>")[0..8]` (la derivación canónica de Anchor), cross-checkea el IDL y fija los 3 que faltan en el IDL. Corre contra `dist` (lo que despliega la API). **Hallazgo:** el IDL JSON commiteado está **stale** — no incluye `close_losing_bet`/`refund_bettor`/`sweep_vault_dust` (del rent-recovery); regenerar con `anchor build` cuando se actualice el programa.

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
  - **P1.2 modularización — ✅ (commit `1ee3c99`).** `sports-scheduler.ts` 714L → 6 archivos (DAG sin ciclos): `sports-shared` (23), `sports-pool-creation` (315), `sports-pool-resolution` (188), `sports-pool-void` (66), `sports-sweep` (55), `sports-scheduler` (89, lifecycle + **barrel re-export** para no romper imports externos). Move puro, sin cambio de comportamiento; eliminado import muerto `Transaction`. Typecheck + tests verdes.
- **P1.2 — ✅ COMPLETO.**
