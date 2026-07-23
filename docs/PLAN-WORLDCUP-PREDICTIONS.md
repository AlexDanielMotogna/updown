# World Cup Predictions — Free-to-Play Growth Page (Plan)

> Draft (2026-07-05). A free, no-money FIFA World Cup score-prediction page for a
> Twitter promo ("$100 to 2 people who guess the correct score, ends today"). Doubles
> as the production "coming soon" surface while the real app is finished for mainnet,
> and as an email/X-handle capture for the mainnet launch list.

## Goals
- Give visitors (coming from X) something to do NOW, with zero money and zero chain.
- Capture identities (X handle + email) for the launch list and to contact promo winners.
- Show the product's polish (live scores, nice UI) without exposing the unfinished app.

## Decisions (locked with the user)
- **Login:** X + Google + email (Privy social, no wallet needed). X gives the @handle to
  tag/DM the winner; Google/email capture emails for launch.
- **Production = locked down:** in prod, ALL routes redirect to the World Cup page, which
  shows "UpDown is under development". The full app exists only in dev.
- **Winning requires exact score + correct phase** (90' / extra time / penalties).
- **Winners:** raffle 2 at random among the correct predictors (admin sees the list + runs
  the raffle).

## Scope
Free predictions are a SEPARATE lightweight system — NOT the parimutuel pools, no USDC, no
Solana/Anchor. Reuses the existing SDB + `live_scores` sports infra for fixtures + live
scores. In dev, the full app keeps working; only prod is locked.

---

## 1. Production lockdown
- A gate `PROD_LOCKDOWN` derived from env (PROD) with override `NEXT_PUBLIC_PROD_LOCKDOWN`.
  Reuse the `detectEnv()` in `apps/web/src/lib/features.ts`.
- Next.js `middleware.ts`: when locked, redirect every route to `/worldcup` EXCEPT
  `/worldcup`, `/api/*` (Privy + worldcup endpoints), Next assets (`/_next`, static), and
  Privy OAuth callbacks. In dev (not locked), no redirect.
- The `/worldcup` page renders the "UpDown is under development" banner + the contest.
- Existing STORE_UI_ENABLED gating stays; this is a broader lockdown that supersedes it in prod.

## 2. Data model (Prisma, all off-chain)
- `ContestUser`: `id`, `privyId` (unique, the Privy DID), `provider` ('x'|'google'|'email'),
  `xHandle` (nullable), `email` (nullable), `displayName`, `createdAt`. Identity for the
  promo + launch list.
- `WorldCupPrediction`: `id`, `contestUserId` (FK), `matchId` (SDB event id), `homeScore`
  Int, `awayScore` Int, `phase` enum (`REGULATION` | `EXTRA_TIME` | `PENALTIES`),
  `createdAt`, `updatedAt`. `@@unique([contestUserId, matchId])` — one editable prediction
  per user per match (locked at kickoff).
- (Optional) `WorldCupMatch` cache table if we don't want to hit SDB on every load:
  `matchId`, `homeTeam`, `awayTeam`, crests, `kickoff`, `round`, `status`, `homeScore`,
  `awayScore`, `phase` (derived), `finished`. Refreshed by a scheduler.

## 3. Auth (Privy, verified server-side)
- Frontend: Privy login with X / Google / email (no embedded wallet needed for this page).
- Backend: verify the Privy access token server-side (Privy app id + secret) → get the DID
  + linked accounts (twitter username, google email, email) → upsert `ContestUser`.
  Contest integrity REQUIRES real verification (can't trust a handle in the body like the
  existing wallet-in-body MVP auth). Add `@privy-io/server-auth` if not present.
- Prediction writes are authenticated via the Privy token (Authorization header).

## 4. Backend endpoints (`/api/worldcup`)
- `GET /matches` → remaining FWC fixtures (upcoming + live + recently finished) with live
  scores. Source: SDB schedule for the World Cup league/season + `live_scores` for live
  status. Cached (short TTL) to avoid rate limits.
- `GET /predictions` (auth) → the caller's predictions.
- `POST /predictions` (auth) → upsert `{ matchId, homeScore, awayScore, phase }`; reject if
  the match already kicked off (locked).
- Admin: `GET /admin/worldcup/predictions?matchId=` → all predictions + correct ones once
  the match is graded; `POST /admin/worldcup/raffle` → pick 2 winners among correct.

## 5. Grading
- When a FWC match finishes, SDB gives status + score. Derive:
  - phase: `FT` → REGULATION, `AET` → EXTRA_TIME, `PEN`/`AP` → PENALTIES (reuse
    `regulation-time` tokens).
  - actual score for grading (see OPEN QUESTION below).
- A prediction is correct iff `homeScore/awayScore` match AND `phase` matches.
- **Penalties score (DECIDED):** the user predicts the **shootout scoreline** (e.g. 4-5).
  SDB does not expose the shootout reliably, so the **admin enters the penalties result
  manually** before running the raffle (an LLM/ChatGPT lookup is possible but manual is
  simpler). Grading for PENALTIES matches uses that admin-entered result.

## 6. Frontend (`/worldcup`) — "chula"
- Hero: World Cup 2026 branding/logo, headline, the promo CTA ("$100 to 2 people who guess
  the correct score — ends today") + link, and "UpDown is under development".
  (IP note: the official FIFA World Cup logo is trademarked; use it per the user's call, or a
  "World Cup 2026" styling to avoid the official mark.)
- Login button (Privy) when logged out; identity chip (X handle / email) when logged in.
- **Match slider/carousel**: cards with team crests, names, LIVE score (auto-updating from
  `/matches`), kickoff/status, round (R16/QF/SF/Final).
- Per-match prediction: home/away score steppers (0-9) + phase toggle (90' / Extra Time /
  Penalties). Save. Shows the user's saved pick; locks at kickoff. Live status badge.
- "My predictions" recap + share-back-to-X button (viral loop).

## 7. Admin
- A tab to view predictions per match, the correct predictors after grading, and a
  "Raffle 2 winners" action that shows the 2 with their X handle / email to pay + tag.

---

## Build order (phased, ship value early)
1. **Prod lockdown + page shell**: middleware gate + `/worldcup` with branding, promo CTA,
   "under development", Privy login. Ships the coming-soon surface immediately.
2. **Matches + live slider**: `/matches` endpoint (FWC fixtures + live) + the carousel with
   live scores. Read-only.
3. **Predictions**: `ContestUser` + `WorldCupPrediction` models, verified Privy auth,
   POST/GET, the score + phase picker, lock-at-kickoff.
4. **Grading + admin + raffle**: derive result, mark correct predictors, admin raffle.

## Resolved (2026-07-05)
- **Logo:** use the World Cup logo/badge that SDB provides (the league `strBadge`/`strLogo`
  CDN URL) — the app already renders SDB crests, so external SDB images are fine.
- **Contest window:** PER MATCH — each match is its own contest; predictions lock at kickoff.
  "Ends today" = the matches kicking off that day.
- **Penalties:** admin-entered result (see §5).

---
## STATUS (2026-07-06) — ALL PHASES SHIPPED (branch `feature/worldcup-predictions`)
- Phase 1 prod lockdown + page shell: DONE (middleware, PROD_LOCKDOWN gate, header w/ account chip + tooltip).
- Phase 2 matches + live: DONE (`/api/worldcup/matches`, live-score overlay, status from SDB status+kickoff).
- Phase 3 predictions: DONE (ContestUser + WorldCupPrediction, jose Privy token verify, save-per-row, lock at kickoff).
- Phase 4 admin + grading + raffle: DONE + live-verified (WorldCupResult + WorldCupWinner, admin tab Economy→"World Cup",
  save official result → grade exact score+phase, raffle 2 winners among correct). Penalties = admin-entered result.
- UI matches the mockup (`ui-worldcup.png`): hero + countdown-to-next-kickoff (shows the match), filter tabs, match rows
  with score steppers + phase segmented + chrome CTA button, My Picks sidebar, footer props. Monochrome buttons +
  neon-green LIVE bar (design direction). Account chip = X handle/email only (no wallet UI), menu = only Sign out.
- Env: PRIVY_APP_ID (api) required for contest auth; NEXT_PUBLIC_PROD_LOCKDOWN=true in prod. See docs/RAILWAY-ENV-WORLDCUP.md.
