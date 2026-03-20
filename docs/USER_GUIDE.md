# UpDown - User Guide

UpDown is a crypto price prediction platform on Solana. Stake USDC to predict whether **BTC**, **ETH**, or **SOL** will go **UP** or **DOWN** within a set timeframe. All bets go into a pool — winners split the pot proportionally.

---

## Quick Start

1. **Connect Wallet** — Click "Connect Wallet" in the header. Choose an embedded wallet (no extension needed) or an external one like Phantom.
2. **Pick a Pool** — Browse the Markets page. Pools marked **JOINING** are open for predictions.
3. **Predict UP or DOWN** — Open a pool, toggle your side, enter your USDC stake, and confirm the transaction.
4. **Wait for the Result** — The pool locks (ACTIVE) and resolves after the timeframe ends (3 min – 1 hour).
5. **Claim Your Winnings** — Go to Profile > Resolved tab and click "Claim Payout" on winning bets.

---

## How Pools Work

Every pool goes through a lifecycle:

| Status | What Happens |
|---|---|
| **JOINING** | Pool is open. A strike price is locked in. Place your UP or DOWN prediction. Betting stays open until 1 second before the pool ends. |
| **RESOLVED** | Winner (UP or DOWN) is determined. If the final price > strike price, **UP wins**. If lower, **DOWN wins**. One-sided pools (no opponents) are automatically refunded. |
| **CLAIMABLE** | Winners can claim their payout via a blockchain transaction. |

A **strike price** is captured when the pool is created. A **final price** is captured when the pool ends. The countdown timer shows exactly how long until resolution.

---

## Assets & Timeframes

| Asset | Timeframes Available |
|---|---|
| **BTC** (Bitcoin) | 1m, 5m, 15m, 1h |
| **ETH** (Ethereum) | 1m, 5m, 15m, 1h |
| **SOL** (Solana) | 1m, 5m, 15m, 1h |

| Interval | Label | Speed |
|---|---|---|
| 1m | Turbo | Fastest |
| 5m | Rapid | Fast |
| 15m | Short | Standard |
| 1h | Hourly | Longest |

---

## How Odds & Payouts Work

UpDown uses **parimutuel** odds — the payout depends on how much is staked on each side.

**Formula:**
```
UP Odds  = Total Pool / Total Staked on UP
DOWN Odds = Total Pool / Total Staked on DOWN
```

**Example:**
- $100 staked on UP, $50 staked on DOWN → Total Pool = $150
- UP Odds = 150 / 100 = **1.50x**
- DOWN Odds = 150 / 50 = **3.00x**

If you bet $100 on UP and UP wins (at 1.50x odds, 5% fee):
- Gross payout: $100 x 1.50 = $150
- Fee (5%): $7.50
- **You receive: $142.50**

Odds update in real-time as more bets come in.

> If a pool is one-sided (everyone bet the same direction), all bets are **refunded**.

---

## Claiming Payouts

When you win, you need to **claim** your payout:

- **From Profile page** — Go to `/profile`, click the "Resolved" tab, and hit "Claim Payout" on any winning bet.
- **Claim All** — If you have multiple unclaimed wins, a "Claim All" banner appears at the top to batch-claim them.
- **From Pool detail** — Open the resolved pool and claim directly.

Each claim is a Solana transaction — you'll need to confirm it in your wallet.

---

## XP, Levels & Rewards

### Earning XP

| Action | XP Earned |
|---|---|
| Place a prediction | +100 XP |
| First bet of the day | +200 XP bonus |
| Win a prediction | +150 XP (on claim) |
| Claim a payout | +50 XP |
| Win streak (3+) | +100 x (streak - 2), max +800 XP |

### Levels (1–40)

As you earn XP, you level up. Each level requires more XP than the last (formula: `500 x (level-1)^1.8` per level). Your level unlocks a title, fee discount, and coin multiplier:

| Level | Title | Total XP | Fee | Coin Multiplier |
|---|---|---|---|---|
| 1 | Newcomer | 0 | 5.00% | 1.0x |
| 5 | Observer | 11,915 | 4.75% | 1.0x |
| 10 | Analyst | 97,362 | 4.50% | 1.1x |
| 15 | Trader | 318,562 | 4.25% | 1.2x |
| 20 | Veteran | 730,569 | 4.00% | 1.35x |
| 25 | Expert | 1,384,587 | 3.75% | 1.5x |
| 30 | Legend | 2,329,192 | 3.50% | 1.7x |
| 35 | Titan | 3,610,991 | 3.25% | 1.9x |
| 40 | Apex Legend | 5,275,014 | 3.00% | 2.0x |

Higher levels = lower fees = bigger payouts.

### UP Coins

UP Coins are an in-game currency. Coins are **only awarded when you claim** a winning bet (never at deposit time).

**How coins are earned:**

| Source | Formula | Example ($10 bet, Lv.20) |
|---|---|---|
| Base bet coins | $amount x 0.10 UP x level multiplier | 1.35 UP |
| Win bonus | 50% of base x level multiplier | 0.67 UP |
| Streak bonus (3+ wins) | min(streak x 2.00, 20.00) UP | 10.00 UP (5 wins) |
| Level-up bonus | newLevel x 5.00 UP | 100.00 UP (reach Lv.20) |

**Daily limits (anti-abuse):**

| Rule | Value |
|---|---|
| Daily coin cap per wallet | 500 UP max |
| Minimum bet for coins | $1 USDC |
| Bets 1–20/day | 100% earning rate |
| Bets 21–40/day | 50% earning rate |
| Bets 41+/day | 0% — no coins |

Limits reset at UTC midnight.

---

## Markets Page (Home)

The home page shows all available pools. You can filter by:

- **Status tabs:** ALL | JOINING | ACTIVE
- **Asset:** ALL | BTC | ETH | SOL
- **Interval:** ALL | 1m | 5m | 15m | 1h

Click the **Filters** button to reveal asset and interval filters. Pools with the most bets appear first, and the top 3 most popular pools get a "POPULAR" badge.

Each pool row shows: box art, asset name + interval tag, countdown, distribution bar, pool size, odds, player count, action button, and a share button to copy the pool link.

Your selected filters are saved in the URL — bookmarking or refreshing keeps your view.

---

## Pool Detail Page

Click any pool to see its detail page:

**Header bar:**
- Back navigation, live connection indicator, asset icon + name, interval tag, status chip

**Info strip:**
- Live price (real-time with flash colors), countdown timer, strike price (→ final price when resolved), UP pool total, DOWN pool total

**Main layout (desktop — side by side, mobile — stacked):**

| Left (chart) | Right (sidebar) |
|---|---|
| Interactive price chart with 8 intervals (1m to 1D) | UP/DOWN toggle buttons with live % |
| Line or candlestick view | Bet form with preset amounts ($10–$500) |
| Strike price line + live price indicator | Energy bar showing pool distribution |
| Hover for OHLC data on candles | Winner banner when resolved |

- **Payout preview** shown before confirming
- **AI Analyzer Bot** (bottom-right bubble) for market insights

---

## Profile Page

Your profile at `/profile` shows:

- **Stats bar:** Total predictions, wins, win rate, current streak, best streak
- **Level badge** with XP progress bar to next level
- **USDC balance** and **UP Coins** balance
- **Bet history** with three tabs:
  - **Active** — Bets in pools still open or running
  - **Resolved** — Completed bets ready to claim
  - **Claimed** — Past bets already claimed

Each bet shows: asset, interval, your side, stake, payout, price movement, and links to blockchain transactions.

---

## Leaderboard

The leaderboard at `/leaderboard` ranks all players by:

- **TOP XP** — Total experience points earned
- **TOP COINS** — Lifetime UP Coins earned
- **TOP LEVEL** — Player level

Top 3 players get gold, silver, and bronze medals. Each entry shows wallet address, level, title, stats, and best win streak.

---

## AI Analyzer Bot

The floating bot bubble on pool detail pages provides AI-powered market analysis:

- **Automatic analysis** when you open a pool — scans RSI, MACD, EMA, Bollinger Bands, and Momentum indicators
- **Chat** — Ask questions about the market, the pool, or trading in general
- **Voice mode** — Toggle robotic text-to-speech for analysis readouts
- **Signal cards** — Visual summary of the analysis direction and confidence
- **Post-mortem** — After a pool resolves, the bot explains what happened

The bot bubble is draggable — move it anywhere on screen. Your position is saved between page loads.

---

## Live Results

A floating sidebar (desktop) or FAB button (mobile) shows recently resolved pools:

- Asset and interval
- Winner (UP or DOWN)
- Total pool size
- Time since resolution

Click any result to jump to that pool's detail page. The FAB is draggable on mobile.

---

## Notifications

The bell icon in the header shows notifications for:

- **Wins & Losses** — Instant feedback when your pool resolves
- **Claims** — Confirmation when payouts are sent
- **Rewards** — XP earned, coins earned, level ups
- **Refunds** — When a one-sided pool returns your stake

Click a notification to navigate to the relevant pool.

---

## Tips

- **Start small** — Try $10–$50 bets to learn how odds shift.
- **Watch the odds** — They change in real-time as bets come in. Early bets on the minority side get better odds.
- **Level up** — Higher levels mean lower fees (5% down to 1.5%) and more UP Coins.
- **Use the AI Bot** — It provides technical analysis to help inform your predictions.
- **Claim promptly** — Don't forget to claim winning bets from your Profile page.
- **Check the Leaderboard** — See how you rank against other players.
