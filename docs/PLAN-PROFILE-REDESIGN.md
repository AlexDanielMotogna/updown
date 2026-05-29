# Plan — Rediseño del Profile (profesional)

> Estado: PROPUESTA (no implementado). Objetivo: convertir `/profile` de
> "mis apuestas con cabecera de stats" en un profile profesional que lidere con
> identidad, una fila de métricas clave y un Overview tipo dashboard, reutilizando
> componentes y endpoints que **ya existen**.

---

## 1. Estado actual

**Página:** `apps/web/src/app/profile/page.tsx`
**Header:** `apps/web/src/components/profile/ProfileHeader.tsx`

Estructura hoy:
- Franja de stats arriba: Predictions, Wins, Win Rate, Current Streak, Best Streak.
- Banner (gif animado, `backgroundSize: contain`).
- Grid de 7 cards: avatar+nivel+XP · Balance · UP Coins · Predictions · Win/Loss · Total Staked · Total Won.
- Tabs: **Pools** (tabla `PoolsBetTable` + filtros por categoría) · **Tournaments** (`TournamentPrizes`).
- Banner "Claim All" cuando hay payouts pendientes.

### Problemas (por qué no se ve "pro")
1. **Duplicación de datos.** `Predictions` aparece en la franja superior y en la card 4. `Wins / Win Rate / Streaks` arriba se solapan con la card `Win/Loss`.
2. **12 números planos, sin jerarquía.** 5 stats + 7 cards al mismo peso visual. No hay "hero stats" vs secundarios; cuesta escanear.
3. **Identidad débil.** Solo wallet truncada + avatar. Sin "member since", sin rank, sin nombre.
4. **Falta P&L.** No existe la ganancia neta (Total Won − Total Staked), que es la métrica más "profesional" para un producto de predicción/trading.
5. **Datos ya disponibles que no se muestran:**
   - `GET /api/users/rewards` → historial de XP/coins (existe, no se usa).
   - `ReferralDashboard` → dashboard de referidos completo (existe, no está en el profile).
   - `GET /api/users/leaderboard` → permite mostrar el **rank** del usuario (no se usa).
6. **Stats parciales/inconsistentes.** `totalStaked` y `totalPayout` se calculan en `page.tsx` solo sobre los bets ya cargados (paginados), mientras `totalBets` es all-time desde el `User`. Mezcla all-time con "lo cargado".
7. **Progresión invisible.** El sistema de niveles tiene **beneficios reales** (fee 5%→3% por nivel; multiplicador de coins 1x→2x) que no se muestran. Es el gancho de engagement más fuerte y está oculto.

---

## 2. Principios de diseño

- **Liderar con identidad** + una sola fila de métricas north-star (**4, no 12**).
- **Cada número aparece una sola vez** (eliminar duplicación).
- **Atar la gamificación a beneficios reales** (fees, multiplicadores) → la progresión deja de ser cosmética.
- **Separar Overview (dashboard) de History (datos crudos).**
- **Reusar** componentes/endpoints existentes; construir de cero solo el Overview tab.

---

## 3. Información: arquitectura propuesta

```
┌───────────────────────────────────────────────────────────────────────┐
│ [BANNER brandeado, ~160px]                                             │
│  ╭────╮  7xKL…9fA2 [copy]                    [Share] [Add funds $12.40]│
│  │ AV │  ◆ Lv.12 Trader · Member since Mar 2026 · Rank #42 (Top 8%)   │
│  │⬡12 │  XP ████████░░░░ 8,240 / 11,915   → next: Lv.13 Oracle        │
│  ╰────╯                                                                 │
├── MÉTRICAS HERO (4 tiles) ─────────────────────────────────────────────┤
│  Net P&L          Win Rate         Volume Staked      UP Coins         │
│  +$1,240 ▲        62% (31W/19L)    $4,500             1,240.50 ⬡       │
├── TABS: Overview | History | Rewards | Referrals | Tournaments ────────┤
│ OVERVIEW (nueva, default):                                             │
│  ┌ Rendimiento por categoría ─┐  ┌ Nivel y beneficios ──────────────┐ │
│  │ Crypto   18  67% ███        │  │ Ahora: Lv.12  fee 4.50%  1.2x    │ │
│  │ Sports   12  58% ██         │  │ Sig.:  Lv.13  fee 4.25%  1.2x    │ │
│  │ Politics  8  50% ██         │  │ faltan 3,675 XP                  │ │
│  └─────────────────────────────┘  └──────────────────────────────────┘ │
│  ┌ Actividad reciente ─────────┐  ┌ Referrals (snapshot) ────────────┐ │
│  │ +150 XP  Won BTC pool   2h  │  │ 3 referidos · $12.40 ganado      │ │
│  │ +50 ⬡    Daily bonus    5h  │  │ [Copiar link de invitación]      │ │
│  └─────────────────────────────┘  └──────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────┘
```

### Zonas

**A. Header de identidad (hero)**
- Avatar con anillo/badge de nivel.
- Wallet truncada + copy + (futuro) display name.
- `Member since` (ya viene `createdAt` en `/profile`).
- Chip de **Rank** ("#42 · Top 8%").
- Barra XP con el **título del próximo nivel**.
- Acciones a la derecha: **Share**, **Add funds** (con el balance USDC al lado — el balance vive aquí, no como stat de profile).

**B. Métricas hero (4 tiles, north-star)**
1. **Net P&L** = Total Won − Total Staked (con color y flecha). *(nuevo)*
2. **Win Rate** (con W/L debajo).
3. **Volume Staked** (Total Staked all-time).
4. **UP Coins**.

Secundarios (Predictions, Current/Best Streak) → chips dentro del Overview, no en la fila hero.

**C. Tabs**
| Tab | Contenido | Fuente |
|---|---|---|
| **Overview** (default, nueva) | Rendimiento por categoría · Nivel y beneficios · Actividad reciente · Snapshot de referrals | bets + `/profile` + `/users/rewards` + `/referrals/stats` |
| **History** | Tabla de bets + filtros (lo actual) | `PoolsBetTable` |
| **Rewards** (nueva) | Feed paginado de XP/coins, agrupado por día, icono por motivo | `GET /api/users/rewards` |
| **Referrals** (nueva) | Dashboard de referidos | `ReferralDashboard` |
| **Tournaments** | Premios (lo actual) | `TournamentPrizes` |

---

## 4. Plan por fases

### Fase 1 — Reestructurar cabecera + dedupe (mayor impacto, casi todo frontend)
- Nuevo `ProfileHeader`: avatar+anillo de nivel, wallet+copy, member-since, barra XP con título del próximo nivel.
- 4 tiles hero (incluye **Net P&L**). Eliminar la franja superior duplicada y colapsar las 7 cards.
- Balance + "Add funds" pasan a acciones del header.
- History tab = `PoolsBetTable` actual (sin cambios).

### Fase 2 — Overview tab (engagement)
- Card **Rendimiento por categoría** (agrupar bets por `poolType` / `league`, win rate por categoría).
- Card **Nivel y beneficios** (fee% ahora vs próximo + multiplicador de coins; XP que falta).
- **Actividad reciente** (de `/users/rewards`, últimas N).
- **Snapshot de referrals** (de `/referrals/stats`).

### Fase 3 — Tabs Rewards & Referrals
- **Rewards**: feed paginado de `/users/rewards` (icono por `reason`: BET_WON, DAILY_BONUS, WIN_STREAK, LEVEL_UP, REFERRAL_ACCEPTED…).
- **Referrals**: montar `ReferralDashboard`.

### Fase 4 — Toques pro (opcional)
- Chip de rank en leaderboard.
- Achievements/badges derivados de datos existentes (streaks, hitos, niveles).
- Profile público compartible `/u/[wallet]`.

---

## 5. Cambios de API (chicos)

| Necesidad | Cómo | Esfuerzo |
|---|---|---|
| **Net P&L all-time correcto** | Agregar `totalWon` al serializer de `/api/users/profile` (hoy existe `totalWagered`; falta el total ganado). Evita el cálculo parcial sobre bets paginados. | bajo |
| **Rank** | `rank` en `/profile` (count de users con más XP + 1) o endpoint `/api/users/rank?wallet=`. | bajo |
| **Beneficios de nivel** | Bloque `nextLevel` en `/profile` (fee% y multiplicador del próximo nivel) usando `utils/levels.ts` y `utils/coins.ts`. | bajo |
| Rewards / Referrals / categoría | **Sin cambios** — los endpoints ya existen. | — |

---

## 6. Reutilización (no reinventar)

Componentes existentes a reusar:
- `UserLevelBadge` — badge de nivel + título.
- `XpProgressBar` — barra de XP animada.
- `ReferralDashboard` (+ `referral/*`) — tab de Referrals completa.
- `PoolsBetTable` / `BetRow` — History tab.
- `AnimatedValue` — transiciones de números en los tiles hero.
- `LeaderboardTable` / `leaderboard/LeaderboardRow` — referencia para el rank.

Endpoints existentes a reusar:
- `GET /api/users/profile` — nivel, XP, coins, stats, fee%, referralCode, createdAt.
- `GET /api/users/rewards` — feed XP/coins (Rewards tab + Actividad reciente).
- `GET /api/users/leaderboard` — rank.
- `GET /api/referrals/stats|earnings|payouts` — Referrals.

Design tokens: `useThemeTokens()` / `lib/theme.ts` (incluye `levelTiers`, `categoryColors`, `gain`, `accent`, etc.).

---

## 7. Referencias de datos (verificado)

- **User model** (`apps/api/prisma/schema.prisma`): `totalXp`, `level`, `coinsBalance/Lifetime/Redeemed`, `totalBets`, `totalWins`, `totalWagered`, `currentStreak`, `bestStreak`, `referralCode`, `createdAt`. (Falta un agregado de total ganado → ver §5.)
- **Niveles** (`apps/api/src/utils/levels.ts`): 40 niveles, 14 títulos (Newcomer → Apex Legend), curva acumulada.
- **Coins** (`apps/api/src/utils/coins.ts`): 0.10 UP por $1 USDC; multiplicador por nivel 1.0x→2.0x; cap diario 500 UP.
- **Fee por nivel**: 5.00% (Lv 1-4) → 3.00% (Lv 40).
- **Referral**: 500 XP + 50 UP al aceptar; comisión 1% del bet al resolver; payout USDC on-chain (min $1).
