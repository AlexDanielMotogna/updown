# Sports live-score coverage — current state + expansion options

**Last updated**: 2026-06-04
**Status**: decision pending. Code through commit `54f46b2` ships the 3-layer
guardrail + dynamic detection; this doc captures the conversation about
whether to expand coverage beyond the 5 SDB-confirmed sports.

---

## Confirmed coverage today

TheSportsDB live-score feed (v2 `/livescore/all`) covers exactly these
sports per written confirmation from the SDB account contact (2026-06-04):

- **Soccer**
- **American Football** (NFL)
- **Basketball** (NBA + many minor leagues)
- **Baseball** (MLB)
- **Ice Hockey** (NHL)

Anything else (Tennis, Golf, F1, Esports, Cricket, Rugby, Boxing-generic,
Cycling, Darts, Snooker, Handball, Volleyball) appears in SDB's fixture
catalog but **never in the live feed**.

The previous bootstrap fallback list included Fighting and Rugby — those
were my assumption, never verified. Removed in `54f46b2`.

## How the system decides

`apps/api/src/services/sports/pool-validation.ts → getCoverageSnapshot()`
returns three layers, evaluated in this order:

| Source | Where it comes from | When it wins |
|--------|---------------------|--------------|
| `envOverride` | `SPORTS_POOL_WHITELIST` env var | Always wins when set. Manual override for rollouts/rollbacks. |
| `observed` | Distinct `sport` from `live_scores` rows updated in the last 7 days | Wins when the table has data. The canonical, self-healing source. |
| `bootstrap` | `DEFAULT_LIVE_COVERED_SPORTS` hardcoded set (5 confirmed sports) | Only when both above are empty (fresh-DB cold start). |

The effective set drives:

1. `GET /api/admin/sports/coverage` — admin badges in MatchExplorer.
2. `POST /api/admin/sports/create-pool` 409 guard.
3. Scheduler `_createMatchPoolsInner` skip-loop for unsupported sports.

5-minute in-process cache to avoid pounding `live_scores` on bursts.

## What Odds API can actually cover (audit)

We have Odds API already integrated as a **fallback** (gap-fill +
FT-override in `pollOddsApiFallback`). It's never used as a primary
source today because SDB handles the 5 confirmed sports natively.

Mapped tournaments in `LEAGUE_TO_ODDS_API`:

| Sport | Tournaments mapped | Coverage notes |
|-------|--------------------|----------------|
| Basketball | NBA | Full |
| Ice Hockey | NHL | Full |
| American Football | NFL | Full |
| Baseball | MLB | Full |
| Soccer | EPL, La Liga, UCL, UEL, Serie A, Bundesliga, Ligue 1, Brasileirão, Championship, Eredivisie, Primeira Liga | Top leagues |
| MMA / Fighting | `mma_mixed_martial_arts` | Major UFC events |
| Tennis | `tennis_atp_french_open` (only) | **Only 1 of 4 Grand Slams currently mapped** |
| Cricket | `cricket_ipl` (only) | **Only IPL, no ODI/Test/T20I** |
| Rugby | `rugbyleague_nrl` (only) | **Only Australian NRL, no 6 Nations / Super Rugby** |

NOT available in Odds API at all (any tier):

- Golf (any tour)
- F1 / Motorsport
- Esports
- Tennis below Grand Slam level (ATP 250s, Challengers, WTA 125K, etc.)
- Boxing outside mega-events
- Cycling, Darts, Snooker, Handball, Volleyball, Cricket niche leagues

## Cost model

Each `/sports/{key}/scores?daysFrom=1` call costs **2 credits**. Poller
runs every ~60–80s per active sport. Adding a sport with a 2-week
tournament window:

```
14 days × 1440 min/day ÷ 1.5 min/poll × 2 credits ≈ 26 800 credits / 2 wks
```

That's ~Wimbledon's worth of credits for a single Grand Slam. Multi-sport
expansion compounds.

## Expansion options (the pending decision)

| # | Option | New coverage | Estimated monthly credit cost | Implementation |
|---|--------|--------------|-------------------------------|----------------|
| A | **Status quo** | 5 sports, SDB only | ~50/day gap-fill only | none |
| B | Odds API primary for the 5 SDB sports | Redundancy; same 5 | +500–1 500/mo | ~3h (flip primary order in `poller.ts`) |
| C | Add Tennis Grand Slams during the event window | +4 tournaments/year | +25k credits per 2-wk tournament | ~4h + season cron |
| D | Add IPL Cricket + NRL Rugby seasonally | +2 leagues, ~2 months each | +10–15k credits/mo during seasons | ~3h |
| E | Integrate a third API for Golf/F1/Esports | Whichever family the new provider covers | New subscription ($30–300/mo by provider) | 1 week per sport |

## My recommendation (still my opinion, not a decision)

- **A** unless users demonstrate real demand for the blocked sports.
- **C** if users are asking for tennis specifically and the cost is in
  budget — but only during the 4 Grand Slam windows per year, not as a
  permanent feature.
- **E** is the right answer for Golf/F1/Esports if those become strategic,
  because the Odds API will never solve it.

## Open follow-ups (not yet implemented)

- Decision on options A/B/C/D/E above.
- If C/D: add the new league codes to `LEAGUE_TO_ODDS_API` + admin
  category, schedule the seasonal poll window.
- If E: pick a provider, build a new adapter under
  `services/sports/livescore/` following the same `LiveScore` interface
  the existing sources implement.

## Related commits

- `04b7679` — Initial 3-layer guardrail (sport whitelist + SDB
  revalidation + zombie audit cron). Hardcoded LIVE_COVERED_SPORTS set.
- `7d3842e` — Admin Zombies tab + MatchExplorer live-coverage badges +
  server-side guard parity in `/sports/create-pool`.
- `7522d42` — Switched to empirical observed-coverage detection from the
  `live_scores` table; static set demoted to bootstrap fallback.
- `fff2eee` — Normalised Odds API sport_key family names so they don't
  leak into the observed-coverage set (`baseball_mlb → Baseball`, etc.).
- `54f46b2` — Trimmed `DEFAULT_LIVE_COVERED_SPORTS` to the 5 confirmed
  sports after the operator received written confirmation from the SDB
  contact (this commit; bootstrap set was previously assumed).
