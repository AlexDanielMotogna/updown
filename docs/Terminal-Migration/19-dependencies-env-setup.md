# Dependencies, Environment & Setup

Part of the Trading Terminal Migration set — see [README](./README.md).

This doc tells the migrator which npm packages, environment variables, monorepo packages, and build/run commands the **trading terminal** needs in a fresh repo. The terminal lives in the Next.js 14 app at `apps/web`. Wherever a dependency or env var is only needed by the duels/fights game layer, it is flagged **fights-only** so it can be dropped.

> SECURITY: This document lists env var **names** only. Real secret values from `.env` files are never reproduced here.

---

## 1. npm Dependencies (`apps/web/package.json`)

`apps/web` is `@tfc/web`, version `0.0.0`, `private: true`. Node engine (root): `>=20.0.0`. Package manager: `npm@10.2.0`. Monorepo uses **Turborepo** + npm workspaces (`apps/*`, `packages/*`).

### Runtime dependencies

| Package | Version | Terminal feature it supports | Status |
|---|---|---|---|
| `next` | `^14.2.20` | App-router framework, API routes, RSC, `standalone` output | **terminal-required** |
| `react` | `^18.3.1` | UI runtime | **terminal-required** |
| `react-dom` | `^18.3.1` | UI runtime | **terminal-required** |
| `lightweight-charts` | `^5.1.0` | TradingView-style price chart (`PacificaChart.tsx`) | **terminal-required** |
| `@tanstack/react-query` | `^5.90.16` | Data fetching/caching for positions, orders, balances, market data hooks | **terminal-required** |
| `zustand` | `^5.0.1` | Client state stores (`@/lib/store`, video/navigation stores, socket store) | **terminal-required** |
| `socket.io-client` | `^4.8.1` | Global realtime socket (`useGlobalSocket.ts`) to the realtime service | terminal-used (mostly fights/admin events; see Sec 6) |
| `zod` | `^3.23.0` | Request/response validation in API routes and hooks | **terminal-required** |
| `sonner` | `^2.0.7` | Toast notifications (order fills, errors) | **terminal-required** |
| `lucide-react` | `^0.468.0` | Icon set used across terminal UI | **terminal-required** |
| `@solana/web3.js` | `^1.98.4` | Solana tx building for Pacifica deposits / on-chain | **terminal-required** (Pacifica) |
| `@solana/spl-token` | `^0.4.14` | USDC SPL transfer / deposit instruction (`deposit-instruction.ts`, `useUsdcBalance.ts`) | **terminal-required** (Pacifica deposits) |
| `@solana/wallet-adapter-base` | `^0.9.23` | Wallet adapter primitives | **terminal-required** (Pacifica) |
| `@solana/wallet-adapter-react` | `^0.15.35` | `useWallet`/`useConnection` hooks for signing | **terminal-required** (Pacifica) |
| `@solana/wallet-adapter-react-ui` | `^0.9.35` | Wallet connect modal/button UI | **terminal-required** (Pacifica) |
| `@solana/wallet-adapter-wallets` | `^0.19.32` | Concrete wallet integrations (Phantom etc.) | **terminal-required** (Pacifica) |
| `@solana-mobile/wallet-adapter-mobile` | `^2.2.5` | Mobile wallet adapter | terminal-optional (Pacifica mobile) |
| `bs58` | `^5.0.0` | Base58 encode/decode for Solana keys and Pacifica signing (`lib/pacifica/signing.ts`) | **terminal-required** (Pacifica) |
| `@mui/material` | `^7.3.7` | MUI components used in deposit modal, wallet button, some widgets | **terminal-required** (see note) |
| `@mui/icons-material` | `^7.3.7` | MUI icons paired with above | **terminal-required** (see note) |
| `@emotion/react` | `^11.14.0` | Styling engine MUI depends on | **terminal-required** (with MUI) |
| `@emotion/styled` | `^11.14.1` | Styling engine MUI depends on | **terminal-required** (with MUI) |
| `@prisma/client` | `^6.1.0` | DB client (re-exported via `@tfc/db`) used in server-side terminal routes (orders, trade recording) | **terminal-required** (server) |
| `ioredis` | `^5.9.2` | Redis client for exchange adapter cache (`cached-adapter.ts`) | terminal-optional (caching; currently disabled — see Sec 3) |
| `recharts` | `^3.7.0` | Account/PnL performance chart (`PerformanceChart.tsx`) | terminal-used (profile/PnL); chart can be dropped without breaking order flow |
| `@tfc/db` | `*` (workspace) | Prisma client + types (see Sec 4) | **terminal-required** (server) |
| `@tfc/shared` | `*` (workspace) | Shared constants/types/events (see Sec 4) | **terminal-required** |
| `@anthropic-ai/sdk` | `^0.74.0` | AI-bias widget / AI features | **fights-only** (drop) |
| `@aws-sdk/client-secrets-manager` | `^3.965.0` | AWS secrets provider for user private keys (`SECRETS_PROVIDER=aws`) | terminal-optional (only if using AWS secrets) |
| `react-markdown` | `^10.1.0` | Markdown rendering (docs/content) | **fights-only / content** (drop) |
| `remark-gfm` | `^4.0.1` | GFM plugin for react-markdown | **fights-only / content** (drop) |
| `rehype-slug` | `^6.0.0` | Heading slugs for react-markdown | **fights-only / content** (drop) |

> **MUI note:** The core trading terminal layout (chart / orderbook / order entry / positions) is primarily Tailwind-styled. MUI + Emotion are pulled in by the **Pacifica deposit modal** (`components/deposit/DepositModal.tsx`), `WalletButton.tsx`, and a few widgets. If you reimplement the deposit modal in Tailwind, you can drop all four (`@mui/*`, `@emotion/*`). Keep them if you port those components verbatim.

> **socket.io note:** `useGlobalSocket.ts` connects to the realtime service for arena/fight/admin events. The terminal's live market data (prices, orderbook, fills) comes from the **Pacifica WebSocket** (`usePacificaWebSocket.ts`), NOT socket.io. So `socket.io-client` is **fights-only** for the terminal unless you reuse the global socket for something else.

### Dev dependencies (`apps/web`)

| Package | Version | Purpose | Status |
|---|---|---|---|
| `typescript` | `^5.7.2` | Type checking / build | **terminal-required** |
| `tailwindcss` | `^3.4.17` | Design system / styling (see [Design tokens](./02-design-tokens-css.md)) | **terminal-required** |
| `postcss` | `^8.4.49` | Tailwind/PostCSS pipeline (`postcss.config.mjs`) | **terminal-required** |
| `autoprefixer` | `^10.4.20` | CSS vendor prefixing | **terminal-required** |
| `prisma` | `^6.1.0` | CLI for `prisma generate` during build | **terminal-required** (server) |
| `@types/node` | `^22.10.2` | Node types | **terminal-required** |
| `@types/react` | `^18.3.12` | React types | **terminal-required** |
| `@types/react-dom` | `^18.3.1` | React DOM types | **terminal-required** |
| `@tfc/tsconfig` | `*` (workspace) | Shared TS config base (`@tfc/tsconfig/nextjs.json`) | **terminal-required** (or inline it — see Sec 4) |

### Root `package.json` shared/dev deps

Root declares `turbo ^2.3.0`, `prettier ^3.4.2`, `eslint ^9.17.0`, `ts-loader ^9.5.4`, `pg ^8.17.1`, `typescript ^5.7.2`, and hoists `@anthropic-ai/sdk`, `ioredis`, `prisma`, `react`, `react-dom`. Only `turbo` (build orchestration), `typescript`, `prisma`, `react`, `react-dom` matter for the terminal; the rest are fights/tooling.

---

## 2. Required Environment Variables

Var **names** only. The terminal reads Pacifica config both server-side (no prefix) and client-side (`NEXT_PUBLIC_` prefix). In Next.js, `apps/web/.env.local` overrides `apps/web/.env`.

### 2a. Terminal-required env vars

| Env var name | One-line purpose | Scope |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string used by Prisma (`@tfc/db`) for server-side order/trade routes | server |
| `DIRECT_URL` | Direct (non-pooled) Postgres URL for Prisma migrations | server |
| `PACIFICA_API_URL` | Pacifica REST base URL (server-side calls) | server |
| `PACIFICA_WS_URL` | Pacifica WebSocket URL (server-side, if used) | server |
| `PACIFICA_BUILDER_CODE` | Builder/affiliate code attached to orders server-side | server |
| `PACIFICA_API_KEY` | Optional Pacifica rate-limit API key | server |
| `NEXT_PUBLIC_PACIFICA_API_URL` | Pacifica REST base URL exposed to browser (market data, account) | client |
| `NEXT_PUBLIC_PACIFICA_WS_URL` | Pacifica WebSocket URL used by `usePacificaWebSocket.ts` (prices/orderbook/fills) | client |
| `NEXT_PUBLIC_PACIFICA_BUILDER_CODE` | Builder code attached to client-signed orders | client |
| `NEXT_PUBLIC_TRADEFIGHTCLUB_FEE_WALLET` | Solana fee/treasury wallet that receives builder fees | client |
| `NEXT_PUBLIC_ENABLE_BUILDER_FEES` | Feature flag: attach builder fees to orders (`true`/`false`) | client |
| `NEXT_PUBLIC_SOLANA_NETWORK` | Solana cluster (`devnet` / `mainnet-beta`) for wallet adapter | client |
| `NEXT_PUBLIC_SOLANA_RPC_URL` | Optional explicit Solana RPC endpoint (else defaults by network) | client |
| `SOLANA_RPC_URL` | Server-side Solana RPC for on-chain tx (deposits/treasury) | server |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | WalletConnect / RainbowKit project id for wallet modal | client |

### 2b. Conditionally required (secrets/caching/auth)

| Env var name | One-line purpose | When needed |
|---|---|---|
| `SECRETS_PROVIDER` | Selects key storage backend: `local` (dev), `aws`, or `vault` | If terminal stores user/agent private keys |
| `AWS_REGION` / `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | AWS Secrets Manager creds | `SECRETS_PROVIDER=aws` |
| `VAULT_ADDR` / `VAULT_TOKEN` | HashiCorp Vault creds | `SECRETS_PROVIDER=vault` |
| `EXCHANGE_KEY_ENCRYPTION_SECRET` | Symmetric key to encrypt/decrypt agent-wallet private keys in DB | If using encrypted exchange connections (HL/Lighter; Pacifica is client-signed) |
| `JWT_SECRET` | Signs/verifies app auth tokens used by API routes | Auth |
| `REDIS_URL` | ioredis connection (exchange adapter cache). Commented out in current `.env` | Optional caching |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST endpoint (alternative cache) | Optional caching |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST token | Optional caching |
| `NODE_ENV` | `development` / `staging` / `production` | Always |

### 2c. Other-exchange env vars (only if you port those adapters — NOT Pacifica)

`HYPERLIQUID_API_URL`, `NEXT_PUBLIC_HYPERLIQUID_API_URL`, `NEXT_PUBLIC_HYPERLIQUID_WS_URL`, `HYPERLIQUID_BUILDER_ADDRESS`, `HYPERLIQUID_BUILDER_FEE`, `PRIVATE_KEY_METAMASK`, `NADO_GATEWAY_URL`, `NADO_ARCHIVE_URL`, `NADO_TRIGGER_URL`, `NADO_CHAIN_ID`, `NADO_BUILDER_ID`, `NADO_BUILDER_FEE_RATE`, `NEXT_PUBLIC_NADO_GATEWAY_URL`, `NEXT_PUBLIC_NADO_WS_URL`. These belong to the multi-exchange abstraction. **Pacifica-only migration can ignore all of these.**

### 2d. Fights-only / non-terminal env vars (drop)

`SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_TRACES_SAMPLE_RATE`, `API_PORT`, `API_HOST`, `CORS_ORIGINS`, `REALTIME_PORT`, `REALTIME_HOST`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL` (realtime socket — fights), `ADMIN_WALLET_ADDRESSES`, `ADMIN_SECRET`, `INTERNAL_API_SECRET`, `WEB_APP_URL`, `TREASURY_WALLET_ADDRESS`, `TREASURY_PRIVATE_KEY`, `LEADERBOARD_REFRESH_INTERVAL_MINUTES`, `STALE_FIGHT_THRESHOLD_MINUTES`, `FILL_RECONCILIATION_INTERVAL_MINUTES`, `ANTI_CHEAT_*`, `REFERRAL_CODE_SALT`, `REFERRAL_COMMISSION_T1/T2/T3`, `ANTHROPIC_API_KEY`, `AI_RATE_LIMIT_MAX`. Keep `TREASURY_*` / `SOLANA_RPC_URL` only if you port Pacifica deposits/withdrawals.

---

## 3. `next.config.mjs` notes

`apps/web/next.config.mjs` (reproduce these settings):

```js
const nextConfig = {
  transpilePackages: ['@tfc/shared', 'react-markdown', 'remark-gfm', 'rehype-slug'],
  reactStrictMode: true,
  output: 'standalone',
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client', 'prisma'],
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: 'https', hostname: 'assets.coingecko.com', pathname: '/coins/images/**' },
      { protocol: 'https', hostname: 'explorer-api.walletconnect.com', pathname: '/v3/logo/**' },
    ],
  },
  // host redirect tfc.gg -> www.tfc.gg (drop for migration)
};
```

Migration-critical lines:
- `transpilePackages: ['@tfc/shared', ...]` — **required** so the workspace package and ESM markdown deps compile. Keep `@tfc/shared`; drop the markdown entries if you drop those deps.
- `serverComponentsExternalPackages: ['@prisma/client', 'prisma']` — **required** so Prisma uses native `require` at runtime instead of being bundled.
- `output: 'standalone'` — for Docker/standalone deploys.
- `images.remotePatterns` — `assets.coingecko.com` (token logos) is terminal-relevant; `explorer-api.walletconnect.com` is wallet-relevant.
- The `tfc.gg` redirect is product-specific — drop it.

> **Caching status:** In the current `apps/web/.env`, `REDIS_URL` is commented out ("network timeout"), so the ioredis-backed exchange adapter cache (`lib/server/exchanges/cached-adapter.ts`) runs without Redis. The terminal works without Redis; treat it as optional.

---

## 4. Monorepo packages used by the terminal

### `@tfc/db` (`packages/db`)
Wraps Prisma. Source `packages/db/src/index.ts`:
- Exports a singleton `prisma` (default + named).
- `export * from '@prisma/client'` — so the terminal imports **Prisma model types + enums** from `@tfc/db`.
- `export * from './settlement-lock.js'` — exposes `SETTLEMENT_LOCK_TIMEOUT_MS` (fights settlement; not terminal).

Terminal server files import from `@tfc/db`:

| File | Imports |
|---|---|
| `apps/web/src/lib/server/orders.ts` | `prisma` |
| `apps/web/src/lib/server/order-actions.ts` | `prisma` |
| `apps/web/src/lib/server/trade-recording.ts` | `prisma`, `FightStatus` (the `FightStatus` enum is fight-entangled — see Sec 6) |
| `apps/web/src/lib/server/fight-exposure.ts` | `prisma`, `FightStatus`, `Prisma` (**fights-only** file) |

What the terminal needs from `@tfc/db`: just `prisma` + Prisma-generated types/enums. `settlement-lock` is fights-only.

### `@tfc/shared` (`packages/shared`)
Barrel `packages/shared/src/index.ts` re-exports `./constants`, `./types`, `./events`, `./utils`. Build output is `dist/` (ESM, `tsc`). Subpath exports: `@tfc/shared`, `@tfc/shared/types`, `@tfc/shared/constants`, `@tfc/shared/events`.

**Terminal-relevant constants** (in `packages/shared/src/constants/index.ts`) you'll want to copy:

```ts
export const CANDLE_INTERVALS = ['1m','3m','5m','15m','30m','1h','2h','4h','8h','12h','1d'] as const;
export const ORDER_SIDES   = { LONG: 'LONG', SHORT: 'SHORT' } as const;
export const ORDER_TYPES   = { MARKET: 'MARKET', LIMIT: 'LIMIT' } as const;
export const PACIFICA_SIDES = { BID: 'bid', ASK: 'ask' } as const;          // bid=long, ask=short
export const PACIFICA_TRADE_SIDES = {
  OPEN_LONG: 'open_long', OPEN_SHORT: 'open_short',
  CLOSE_LONG: 'close_long', CLOSE_SHORT: 'close_short',
} as const;
export const MIN_LEVERAGE = 1;                 // max leverage comes from Pacifica per-market
```

**Fights-only constants** in the same file (drop): `FIGHT_DURATIONS_MINUTES`, `FIGHT_STAKES_USDC`, `FIGHT_STATUS`, `PARTICIPANT_SLOTS`, `PNL_TICK_INTERVAL_MS`, `LEADERBOARD_RANGES`.

Current terminal imports from `@tfc/shared`:
- `apps/web/src/hooks/useGlobalSocket.ts` — imports **admin event payload types** (`AdminStatsPayload`, `AdminUserEventPayload`, `AdminFightUpdatePayload`, `AdminTradePayload`, `AdminJobPayload`, `AdminLeaderboardPayload`, `AdminPrizePoolPayload`, `AdminSystemHealthPayload`). All **fights/admin** — drop with the global socket.
- `apps/web/src/app/lobby/page.tsx` — `FIGHT_DURATIONS_MINUTES`, `FIGHT_STAKES_USDC` (**fights-only** page).

> Net: the terminal mostly needs the **Pacifica/order constants** from `@tfc/shared`. In a fresh repo you can inline these constants into a local `lib/constants.ts` and avoid the workspace package entirely.

### `@tfc/tsconfig`
`apps/web/tsconfig.json` extends `@tfc/tsconfig/nextjs.json`, sets `baseUrl: "."`, path alias `@/* -> ./src/*`, `strictNullChecks: true`, and the `next` TS plugin. In a fresh repo, replace the `extends` with a standard Next.js `tsconfig.json` and keep the `@/*` path alias.

---

## 5. Build and Run commands

### Workspace (root) scripts — Turborepo
| Command | Effect |
|---|---|
| `npm run dev` | `turbo dev` — runs all apps in dev |
| `npm run build` | `turbo build` — builds all packages/apps |
| `npm run db:generate` | `turbo db:generate` — Prisma client generation |
| `npm run db:push` | `turbo db:push` — push schema to DB |
| `npm run db:migrate` | `turbo db:migrate` — run migrations |
| `npm run lint` / `test` / `format` | turbo lint / test / prettier |

### `apps/web` scripts
| Command | Effect |
|---|---|
| `npm run dev` | `next dev -p 3001` — dev server on **port 3001** |
| `npm run build` | `prisma generate --schema=../../packages/db/prisma/schema.prisma && next build` |
| `npm run start` | `next start -p 3001` |
| `npm run lint` | `next lint` |

**Key build detail:** `apps/web build` runs `prisma generate` against `../../packages/db/prisma/schema.prisma` before `next build`. In a standalone repo, point this at your local schema or drop it if you do not use Prisma in the terminal.

### Local dev environment (from project memory)
- Local Postgres on port **5433** (docker container `tfc-postgres`); `DATABASE_URL`/`DIRECT_URL` point at `localhost:5433`.
- Prisma regenerate: `npx prisma generate` inside `packages/db`.
- `.env.local` overrides `.env` in Next.js.
- Standalone scripts (`npx tsx`) need env loaded manually (no auto-dotenv).

### Styling pipeline
`apps/web/tailwind.config.ts` + `apps/web/postcss.config.mjs` drive Tailwind 3 + autoprefixer. Copy both for the design system (see [Design tokens](./02-design-tokens-css.md)).

---

## 6. Fight entanglements in dependency/env surface

These are the specific spots where fight logic leaks into the terminal's dependency/env footprint:

1. **`trade-recording.ts` imports `FightStatus` from `@tfc/db`** — trade/fill recording (a core terminal concern) is coupled to the fight status enum. Strip the fight-status branching to make recording exchange-only.
2. **`useGlobalSocket.ts` (socket.io-client + `@tfc/shared` admin payload types)** — the global realtime socket carries arena/fight/admin events, not terminal market data. Terminal live data uses Pacifica WS instead. Dropping fights lets you remove `socket.io-client` and the `Admin*Payload` imports.
3. **`@tfc/shared` constants barrel mixes order/Pacifica constants with fight constants** (`FIGHT_*`, `PARTICIPANT_SLOTS`, `PNL_TICK_INTERVAL_MS`, `LEADERBOARD_RANGES`). Same file — copy only the order/Pacifica half.
4. **`@anthropic-ai/sdk`, `react-markdown`/`remark-gfm`/`rehype-slug`** are pulled in by AI-bias and content/docs features (fights-side), yet sit in the web app's deps and `next.config` `transpilePackages`. Remove from deps and from `transpilePackages`.
5. **Env: `NEXT_PUBLIC_WS_URL`** (realtime socket), `ADMIN_*`, `ANTI_CHEAT_*`, `REFERRAL_*`, `TREASURY_*`, `INTERNAL_API_SECRET`, `LEADERBOARD/STALE_FIGHT/FILL_RECONCILIATION_*` are all fights/ops — they appear in the shared `.env.example` but the terminal does not need them (except `TREASURY_*`/`SOLANA_RPC_URL` if you keep Pacifica deposits).
