Formato: Epic → Tickets con Acceptance Criteria.
Prioridad: P0 (bloqueante MVP), P1 (muy recomendado), P2 (nice-to-have).

EPIC A — Repo Setup & Standards (P0)

A1 — Create repos & baseline tooling

App repo: Next.js + TS + MUI + lint + prettier + commit hooks

Program repo: Anchor + tests + CI basic
AC: ambos repos compilan, lint pasa, estructura creada.

A2 — Coding standards / architecture rules doc

Clean architecture rules, folder structure, naming conventions

“No vibe coding”, “No AI branding”, “No mixing layers”
AC: documento en /docs/ENGINEERING_STANDARDS.md y enlazado en README.

EPIC B — Solana Program (Parimutuel Pools) (P0)

B1 — Program accounts & PDAs

Pool account (asset, start/end, strike/final, totals, status)

UserBet account (wallet, side, amount, claimed)

PDA derivations documented
AC: Anchor tests crean pool/bet/claim sin fallos.

B2 — Deposit USDC to Pool

deposit(side, amount) transfiere USDC a vault PDA

valida JOINING window y amount > 0
AC: no permite deposit fuera de ventana, totales correctos.

B3 — Resolve pool (permissioned by backend authority)

resolve(strike, final, winnerSide) o 2 pasos lockStrike() + setFinalAndResolve()

Guarda precios y winner
AC: no permite resolve antes de end_time; winner correcto.

B4 — Claim payout

claim() calcula payout proporcional y transfiere USDC

evita double-claim
AC: payouts exactos según fórmula; double-claim revert.

B5 — Events + logs

Emitir events: PoolCreated, Deposited, Resolved, Claimed
AC: indexable desde backend.

Nota: para MVP, está bien que el backend sea “resolver authority”. En fase siguiente se puede mover a oráculo/verificación adicional.

EPIC C — Backend Core (API + Scheduler + Audit) (P0)

C1 — DB schema + migrations

tables: pools, bets, claims, price_snapshots, event_log (append-only)
AC: migraciones reproducibles; constraints básicas.

C2 — Pool scheduler

crea pools por allowlist (ej 8 assets) + intervals (15m/1h/24h)

estados: UPCOMING/JOINING/ACTIVE/RESOLVED/CLAIMABLE
AC: pools se generan y rotan automáticamente.

C3 — Market Data Adapter Layer

interfaz IMarketDataProvider

implementación PacificaProvider

normalización NormalizedPriceTick
AC: backend puede pedir getSpotPrice(symbol) sin conocer la forma de Pacifica.

C4 — Strike/Final capture + audit

al start: guardar strike snapshot (price, ts, source, raw_hash)

al end: guardar final snapshot
AC: cada pool tiene strike/final auditables.

C5 — Indexer (tx verification)

escucha events on-chain o consulta por signature

vincula deposit_tx con bet

valida amounts vs on-chain (mínimo)
AC: bets en DB coinciden con on-chain; logs guardados.

C6 — Resolve job

al end_time: obtiene final price, calcula winner, llama programa resolve
AC: pools terminan en RESOLVED y habilitan claim.

C7 — Claims tracking

endpoint “claimable”

guardar claim_tx al detectar tx
AC: UI ve claimable y DB guarda auditoría.

EPIC D — Frontend UI (Next + MUI, minimalismo) (P0)

D1 — MUI Theme + design tokens

dark minimal, spacing consistente, tipografía

componentes base: Button, Card, Dialog, Input, Stat, Chip
AC: UI consistente y reusable.

D2 — Wallet connect (Solana)

Solana Wallet Adapter + Phantom/Solflare

connect only (no tx)
AC: conectar/desconectar estable, sin firmas innecesarias.

D3 — Markets page (list + filters)

filtros: asset, interval, status

data de backend
AC: filtra sin recargar brutal; UX limpia.

D4 — Pool detail page

muestra: countdown, strike rule, pool totals, UP/DOWN selector, stake input

CTA “Place Bet”
AC: puede iniciar tx deposit correctamente.

D5 — Transaction modals

confirm → pending → success/fail

link a explorer
AC: flujo claro sin confusión.

D6 — My Bets

active/resolved/claimable

botón claim
AC: claim ejecuta tx y refleja estado.

EPIC E — Observability & Security (P1)

E1 — Error handling + monitoring hooks

logs backend estructurados

UI: errores con mensajes limpios
AC: errores no rompen UX.

E2 — Rate limits + validation

validation schemas (zod/joi)

rate limiting básico
AC: endpoints protegidos contra spam simple.

E3 — Admin config

allowlist assets

fee_bps

intervals
AC: configurable sin redeploy (si es posible) o env config.

EPIC F — Polishing (P2)

F1 — “How it works” page
F2 — Skeleton loaders
F3 — Basic SEO + meta
F4 — Analytics events (sin PII)
