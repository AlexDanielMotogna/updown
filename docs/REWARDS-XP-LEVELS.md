# UpDown — XP, Niveles y UP Coins

> Documento de referencia de la economía de recompensas. **Fuente de verdad: el código** (no la página `/docs`, que tiene alguna imprecisión — ver §8). Generado verificando los siguientes archivos:
> - `apps/api/src/utils/levels.ts` — curva de niveles, XP por acción, multiplicador de coins
> - `apps/api/src/utils/coins.ts` — cálculo de UP Coins
> - `apps/api/src/utils/fees.ts` — fee por nivel
> - `apps/api/src/services/rewards.ts` — dónde/cuándo se otorgan XP y coins
> - `apps/api/src/services/referrals.ts` — recompensas de referidos

---

## 1. XP por acción

| Acción | XP | Constante | Dónde se otorga | Archivo |
|---|---|---|---|---|
| Participación (apuesta) | **+100** | `BET_PLACED` | Al **resolver** el pool normal (no refunds), por cada apostador — gane o pierda | `awardBetResolution` |
| Primer pool resuelto del día | **+200** | `DAILY_FIRST_BET` | Primer pool que te resuelve en el día (UTC) | `awardBetResolution` |
| Apuesta ganada | **+150** | `BET_WON` | Al **reclamar** un bet ganador (no en refunds) | `awardBetWin` |
| Claim completado | **+50** | `CLAIM_COMPLETED` | Al completar el claim | `awardClaimCompleted` |
| Referido aceptado | **+500** | `REFERRAL_XP_REWARD` | Cuando alguien acepta tu referido | `acceptReferral` |

> **XP en resolución, no en colocación** (cambiado 2026-05-26 para evitar farmeo — ver §8). Al colocar la apuesta solo se registran stats (`trackBetPlacement`: totalBets, totalWagered, dailyBetCount). El XP de participación se otorga cuando el pool resuelve **normal** (dos lados, ganador real); los pools de un solo lado / un solo apostador / vacíos se reembolsan y **no dan XP**. Cubre crypto/squad (`resolve-logic.ts`) y sports/predicciones (`sports-scheduler.ts`).

**Reset diario:** los contadores `dailyBetCount` y `dailyCoins` se resetean en la primera acción de un nuevo día UTC (`ensureDailyReset`).

### Bono de XP por racha (win streak)

`winStreakBonus(streak) = 100 × (min(streak, 10) − 2)`, solo si `streak ≥ 3`. Se otorga junto con `BET_WON`.

| Racha | Bono XP |
|---|---|
| 1–2 | 0 |
| 3 | +100 |
| 4 | +200 |
| 5 | +300 |
| … | … |
| 10 o más (cap) | **+800** |

La racha se incrementa en cada victoria (`awardBetWin`) y se resetea a 0 al perder (`resetStreak`).

---

## 2. Curva de niveles

40 niveles. XP **acumulado** para alcanzar el nivel `L`:

```
threshold(L) = Σ  floor(500 × (n−1)^1.8)   para n = 2..L
```

Equivalente: el XP necesario para pasar **del nivel L al L+1** es `floor(500 × L^1.8)`.

---

## 3. Tabla completa de niveles (1–40)

Columnas: XP acumulado para alcanzar el nivel · XP desde el nivel anterior · multiplicador de coins · fee de plataforma · bono de UP Coins al subir a ese nivel.

| Lvl | Título | XP acumulado | XP desde anterior | Coin mult | Fee | Bono level-up (UP) |
|----:|--------|-------------:|------------------:|:---------:|:---:|-------------------:|
| 1 | Newcomer | 0 | — | 1.0x | 5.00% | — |
| 2 | Newcomer | 500 | 500 | 1.0x | 5.00% | 10 |
| 3 | Observer | 2,241 | 1,741 | 1.0x | 5.00% | 15 |
| 4 | Observer | 5,853 | 3,612 | 1.0x | 5.00% | 20 |
| 5 | Observer | 11,915 | 6,062 | 1.0x | 4.75% | 25 |
| 6 | Speculator | 20,974 | 9,059 | 1.1x | 4.75% | 30 |
| 7 | Speculator | 33,552 | 12,578 | 1.1x | 4.75% | 35 |
| 8 | Speculator | 50,153 | 16,601 | 1.1x | 4.75% | 40 |
| 9 | Analyst | 71,265 | 21,112 | 1.1x | 4.75% | 45 |
| 10 | Analyst | 97,362 | 26,097 | 1.1x | 4.50% | 50 |
| 11 | Analyst | 128,909 | 31,547 | 1.2x | 4.50% | 55 |
| 12 | Trader | 166,361 | 37,452 | 1.2x | 4.50% | 60 |
| 13 | Trader | 210,163 | 43,802 | 1.2x | 4.50% | 65 |
| 14 | Trader | 260,753 | 50,590 | 1.2x | 4.50% | 70 |
| 15 | Trader | 318,562 | 57,809 | 1.2x | 4.25% | 75 |
| 16 | Oracle | 384,015 | 65,453 | 1.35x | 4.25% | 80 |
| 17 | Oracle | 457,531 | 73,516 | 1.35x | 4.25% | 85 |
| 18 | Oracle | 539,524 | 81,993 | 1.35x | 4.25% | 90 |
| 19 | Oracle | 630,402 | 90,878 | 1.35x | 4.25% | 95 |
| 20 | Veteran | 730,569 | 100,167 | 1.35x | 4.00% | 100 |
| 21 | Veteran | 840,425 | 109,856 | 1.5x | 4.00% | 105 |
| 22 | Veteran | 960,365 | 119,940 | 1.5x | 4.00% | 110 |
| 23 | Veteran | 1,090,780 | 130,415 | 1.5x | 4.00% | 115 |
| 24 | Expert | 1,232,059 | 141,279 | 1.5x | 4.00% | 120 |
| 25 | Expert | 1,384,587 | 152,528 | 1.5x | 3.75% | 125 |
| 26 | Expert | 1,548,744 | 164,157 | 1.7x | 3.75% | 130 |
| 27 | Expert | 1,724,909 | 176,165 | 1.7x | 3.75% | 135 |
| 28 | Legend | 1,913,458 | 188,549 | 1.7x | 3.75% | 140 |
| 29 | Legend | 2,114,762 | 201,304 | 1.7x | 3.75% | 145 |
| 30 | Legend | 2,329,192 | 214,430 | 1.7x | 3.50% | 150 |
| 31 | Legend | 2,557,115 | 227,923 | 1.9x | 3.50% | 155 |
| 32 | Mythic | 2,798,895 | 241,780 | 1.9x | 3.50% | 160 |
| 33 | Mythic | 3,054,895 | 256,000 | 1.9x | 3.50% | 165 |
| 34 | Mythic | 3,325,474 | 270,579 | 1.9x | 3.50% | 170 |
| 35 | Titan | 3,610,991 | 285,517 | 1.9x | 3.25% | 175 |
| 36 | Titan | 3,911,801 | 300,810 | 2.0x | 3.25% | 180 |
| 37 | Immortal | 4,228,257 | 316,456 | 2.0x | 3.25% | 185 |
| 38 | Immortal | 4,560,712 | 332,455 | 2.0x | 3.25% | 190 |
| 39 | Paragon | 4,909,515 | 348,803 | 2.0x | 3.25% | 195 |
| 40 | Apex Legend | 5,275,014 | 365,499 | 2.0x | 3.00% | 200 |

---

## 4. Fee de plataforma por nivel

`getFeeBps(level)` — en basis points (500 = 5.00%). Default para wallets no registradas: **500 (5%)**.

| Rango de nivel | Fee |
|---|---|
| 1–4 | 5.00% |
| 5–9 | 4.75% |
| 10–14 | 4.50% |
| 15–19 | 4.25% |
| 20–24 | 4.00% |
| 25–29 | 3.75% |
| 30–34 | 3.50% |
| 35–39 | 3.25% |
| 40 | 3.00% |

> **Nota:** el fee solo se cobra cuando el pool tiene **más de 1 apuesta** (`betCount <= 1 → fee = 0`). Los pools de un solo lado se reembolsan completos sin fee.

---

## 5. UP Coins — cómo se ganan

**Unidades:** se almacenan en *base units*. Display = `base / 100` (`UP_COINS_DIVISOR = 100`). Tasa base: **0.10 UP por cada $1 USDC** apostado (10 base units por $1).

> ⚠️ Las coins se otorgan **solo al reclamar un bet ganador** (`awardBetWin`), nunca al depositar. Esto evita dar coins en pools reembolsados/one-sided. Los $ se truncan a dólares enteros (`betUsdc = monto / 1e6`), así que una apuesta de $1.99 cuenta como $1.

| Fuente | Fórmula (display UP) | Constante / función |
|---|---|---|
| Coins base por apuesta | `floor($enteros × 0.10 × levelMult × rateDiario)` | `calculateCoinsForBet` |
| Bono por victoria | `50% de las coins base × levelMult` | `calculateWinBonus` |
| Bono por racha (≥3) | `min(streak × 2.00, 20.00) UP` | `calculateStreakBonus` |
| Bono por subir de nivel | `nivelNuevo × 5.00 UP` | `calculateLevelUpBonus` |
| Referido aceptado | **50.00 UP** (`5000` base) | `REFERRAL_COINS_REWARD` |

`levelMult` = multiplicador de coins por nivel (columna "Coin mult" de la tabla, de 1.0x a 2.0x).

### Límites diarios / anti-abuso (solo coins)

| Regla | Valor |
|---|---|
| Mínimo de apuesta para coins | **$1 USDC** |
| Cap diario por wallet | **500 UP** (`50,000` base) |
| Apuestas 1–20 del día | 100% de tasa |
| Apuestas 21–40 del día | 50% de tasa |
| Apuestas 41+ del día | 0% (sin coins) |

---

## 6. UP Coins por nivel (bono de level-up)

Al **subir** al nivel `N` recibes `N × 5 UP` (`N × 500` base units). Esto es independiente de las coins por apuesta.

- Nivel 2 → 10 UP · Nivel 10 → 50 UP · Nivel 20 → 100 UP · Nivel 40 → 200 UP
- **Total acumulado** subiendo del nivel 2 al 40: **4,095 UP**

---

## 7. Programa de referidos

| Concepto | Valor | Constante |
|---|---|---|
| XP al aceptar el referido | +500 XP | `REFERRAL_XP_REWARD` |
| UP Coins al aceptar | +50 UP (`5000` base) | `REFERRAL_COINS_REWARD` |
| Comisión por apuestas del referido | **1% del monto** | `COMMISSION_BPS = 100` |
| Cuándo se gana la comisión | Cuando el pool resuelve normal (no refund), gane o pierda el referido | `recordReferralCommissions` |
| Pago mínimo | $1 USDC | — |
| Pago | Transferencia USDC on-chain (authority firma) | `claimReferralPayout` |
| Auto-referido | Bloqueado | `acceptReferral` |

---

## 8. Notas e historial

1. **Farmeo de XP — RESUELTO (2026-05-26).** Antes, el XP de placement (100 + 200) se daba en cada depósito **sin mínimo de apuesta ni cap diario**, y como los pools one-sided/single-bettor **se auto-reembolsan**, se podía apostar polvo, recuperar el stake y quedarse con el XP gratis. **Fix:** el XP de participación se movió a la **resolución normal** del pool (`awardBetResolution`), que nunca se ejecuta para pools reembolsados. Al colocar solo se registran stats (`trackBetPlacement`). Cubre crypto/squad y sports/predicciones. Sports/predicciones no eran farmeables igual (resultado real, pools no creables on-demand) pero se unificó por consistencia.

2. **Página `/docs` (user-facing).** El copy dice "UP Coins and XP are awarded on claim" (Quick Start paso 6). Es una simplificación aceptable para usuarios, aunque técnicamente el XP de participación ahora es en **resolución** (justo antes del claim). Si se quiere precisión, ajustar a "cuando tu pool resuelve / al reclamar".

3. **Edge case menor:** el bono diario (+200) se determina con una consulta a `rewardLog` (`DAILY_BONUS` de hoy). Si a un mismo wallet le resuelven varios pools en el **mismo tick** del scheduler, podría otorgarse 2 veces por una carrera — no es un vector de farmeo (no se puede provocar barato) y el impacto es +200 puntual.
