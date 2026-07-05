# Railway env vars — World Cup lockdown + session feature gates

> What to set in Railway for the new work (2026-07-05): the production "coming soon"
> lockdown (World Cup page), the UP-coin Store gating, and the upcoming contest auth.
> These are ADDITIONS to your existing Railway variables — don't remove anything else.

## TL;DR — the important ones
| Variable | Service | PROD (updown.my) | DEV (Railway dev) | Notes |
|---|---|---|---|---|
| `NEXT_PUBLIC_PROD_LOCKDOWN` | web | **`true`** | `false` | Redirects the whole app to `/worldcup` ("under development"). This is what hides everything in prod. |
| `NEXT_PUBLIC_ENABLE_STORE` | web | `false` (or unset) | `true` | UP-coin Store/Inventory/boost UI. Keep hidden in prod. |
| `NEXT_PUBLIC_ENV` | web | **`PROD`** | **`DEV`** | Drives the gates when the API URL is ambiguous. Set it explicitly per env. |

Setting `NEXT_PUBLIC_PROD_LOCKDOWN=true` is the single switch that puts prod into
"coming soon + World Cup" mode. To later launch the full app, flip it to `false`.

> These are `NEXT_PUBLIC_*` → they are **baked at build time**. After changing them in
> Railway you must **redeploy the web service** for the change to take effect.

## Why `NEXT_PUBLIC_ENV` matters
The gates infer the environment: explicit `NEXT_PUBLIC_ENV` wins; otherwise they guess
from `NEXT_PUBLIC_API_URL` (localhost→LOCAL, contains `dev`/`staging`/`railway.app`→DEV,
else PROD). If your prod API URL is a `*.railway.app` domain, the guess would wrongly say
DEV and the lockdown would NOT engage. So in prod set **`NEXT_PUBLIC_ENV=PROD`** (and/or
just set `NEXT_PUBLIC_PROD_LOCKDOWN=true` explicitly, which always wins).

## Contest auth (World Cup predictions) — REQUIRED
The API verifies the Privy login token server-side (so a contest entry is tied to a real
X/Google/email identity) via Privy's public JWKS. Add to the **api** service:
| Variable | Service | Value |
|---|---|---|
| `PRIVY_APP_ID` | api | the same Privy app id as the web `NEXT_PUBLIC_PRIVY_APP_ID` (public, not a secret) |

No `PRIVY_APP_SECRET` needed — verification uses the public JWKS, only the app id.
If `PRIVY_APP_ID` is missing, prediction writes just return 401 (matches still load).

X/Twitter login is Privy-managed (same as Google) — no extra X API tier or dashboard
OAuth setup needed; it just works once `twitter` is in the login methods (already in code).

## Notes / caveats
- **Terminal app is separate.** The lockdown middleware is in the web app only. The
  trading terminal (its own Railway service / subdomain) is NOT hidden by this. To fully
  hide prod, either take the terminal service down or add a similar gate there.
- **Migrations** for the UP-coin work apply automatically on deploy (`prisma migrate
  deploy`). The emission control stays dormant until you activate an epoch in
  Admin → Economy → UP Economy.
- **Local dev** (`apps/web/.env`) already has `NEXT_PUBLIC_PROD_LOCKDOWN=false` and
  `NEXT_PUBLIC_ENABLE_STORE=true`, so nothing changes locally. To preview the lockdown
  locally, set `NEXT_PUBLIC_PROD_LOCKDOWN=true` and restart `next dev`.
- No new envs are required for the **football resolver fix** (PR #137).
