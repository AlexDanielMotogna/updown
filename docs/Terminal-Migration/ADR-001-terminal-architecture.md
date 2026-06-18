# ADR-001 — Trading Terminal Architecture (build location & exchange-adapter strategy)

- **Status:** Proposed
- **Scope:** Where the UpDown Trading Terminal lives, how it deploys, and how exchange
  integrations (HyperLiquid first, then Pacifica, Binance, …) are abstracted.
- **Related:** the rest of `docs/Terminal-Migration/` (the TFC → fresh-project migration spec),
  especially [01 – Overview & Architecture](./01-overview-architecture.md) and
  [18 – Server Exchange Adapter Layer](./18-server-adapter.md).

---

## 1. Context

We are building a professional Trading Terminal for UpDown using **HyperLiquid** as the first
trading backend, with the integration abstracted behind **adapters** so more exchanges can be
added later. Two approaches were proposed:

- **Option A — Build inside UpDown:** terminal as part of the main app, sharing auth, UI,
  design system, domain models; HyperLiquid as the first adapter.
- **Option B — Separate Trading App:** dedicated terminal app hosted at e.g. `terminal.updown.my`,
  independent frontend/backend, integrated with UpDown via shared auth/APIs; reuse the existing
  TradeFightClub (TFC) terminal.

### Facts on the ground (these drive the decision)

1. **UpDown is already a `pnpm` + `turbo` monorepo** with workspaces `apps/*` and `packages/*`
   (`apps/api`, `apps/web`, `packages/market-data`, `packages/solana-client`).
2. **An adapter pattern already exists** in UpDown: `packages/market-data` ships
   `IMarketDataProvider` + `PacificaProvider`. We are not starting from zero.
3. **An exchange-adapter design already exists** in this doc set:
   [doc 18](./18-server-adapter.md) defines `ExchangeAdapter` (market-data / account / trading
   tiers), `ExchangeProvider.getAdapter('pacifica'|'hyperliquid'|'binance')`, and a Redis
   `CachedExchangeAdapter`. HyperLiquid is already a (throwing) arm of that factory.
4. **The terminal is a different domain** from UpDown's parimutuel pools: real-time perps trading
   vs. on-chain betting pools. Different backend, latency profile, uptime sensitivity, and bundle.
5. **Design-system mismatch:** UpDown `apps/web` uses **MUI + a custom theme**; the TFC terminal
   uses **Tailwind 3 + custom tokens**. Putting the terminal as a route inside `apps/web` mixes two
   design systems into one app/bundle.
6. **Writes are client-signed, and signing differs per chain:** in TFC the *real* order is signed
   in the browser with the user's wallet and sent **directly to the exchange**; the backend only
   reads/caches. **Pacifica signs Ed25519 (Solana); HyperLiquid signs EIP-712 (EVM).** So an
   "adapter" is not one thing — it needs a server read face **and** a client signing face.
7. **Auth/wallet:** UpDown uses **Privy** (which can provision both Solana and EVM embedded
   wallets). The terminal should reuse Privy rather than duplicate auth — which rules out a fully
   separate repo.

---

## 2. Decision

**Neither Option A nor Option B as posed. Adopt the third option: a monorepo with shared
packages — the terminal as its own deployable app inside the UpDown monorepo, with exchange
integration in standalone packages.**

Concretely, inside the existing UpDown monorepo:

- The terminal is **its own deployable Next.js app `apps/terminal`** (→ `terminal.updown.my`),
  **not** a route group inside `apps/web`.
- Exchange integration lives in **framework-agnostic packages**: `packages/exchange-core`
  (the contract) + `packages/exchange-hyperliquid` + `packages/exchange-pacifica`
  (implementations).
- It **shares auth (Privy), normalized types, tooling, and CI** with UpDown by virtue of being
  the same monorepo.

This captures **Option A's upside** (shared auth/types/design/tooling, single repo) **and Option
B's upside** (independent deploy, subdomain, latency/uptime isolation) **without either's
downside**. Option A is right that we should share; Option B is right that we should deploy
separately — only the monorepo-with-packages topology gives both.

---

## 3. Options considered

| Dimension | A: route in `apps/web` | ★ Monorepo + `apps/terminal` + packages | B: separate repo |
|---|---|---|---|
| Independent deploy / subdomain | ❌ tied to web deploy | ✅ own app → `terminal.updown.my` | ✅ |
| Shared auth/wallet (Privy) | ✅ | ✅ (same monorepo) | ❌ duplicated, drifts |
| Shared types / contracts | ✅ | ✅ (`exchange-core` package) | ❌ versioning/copy, drifts |
| Latency/uptime isolation (trading) | ❌ shares runtime with betting | ✅ | ✅ |
| Design system | ❌ MUI vs Tailwind clash | ✅ own Tailwind in its app | ✅ |
| Reuse of TFC terminal | partial | ✅ via migration docs → app/packages | ✅ but re-integrate auth |
| Future exchanges | adapter buried in app | ✅ `packages/exchange-*` plug-ins | ⚠️ adapter isolated from rest |
| Tooling / CI / turbo | ✅ | ✅ single pipeline | ❌ two pipelines |
| Maintenance | medium (couples) | ✅ low (clear boundaries) | ❌ high (two repos) |
| Team productivity | high short-term | ✅ high sustained | ❌ cross-repo context switching |

A and B are each *half right*; ★ is the union of their strengths.

---

## 4. Architecture — folder structure

```
UpDown/  (pnpm + turbo monorepo)
├── apps/
│   ├── api/                      # existing (Express/Prisma/scheduler)
│   ├── web/                      # existing (Next + MUI, betting app)
│   └── terminal/                 # NEW — Next 14 App Router, Tailwind (ported from TFC)
│       └── src/
│           ├── app/
│           │   ├── (trade)/page.tsx      # terminal layout (doc 04)
│           │   └── api/                  # read/proxy routes (doc 17) → exchange-core
│           ├── components/               # orderbook, order-entry, positions (docs 05–09)
│           ├── hooks/                    # market-data + account hooks (docs 13–14)
│           └── lib/
│               ├── tradingview/          # datafeed (doc 11, proprietary binary)
│               └── auth/                 # bridge to shared Privy
├── packages/
│   ├── exchange-core/            # NEW — the contract (from doc 18; framework-agnostic)
│   │   └── src/
│   │       ├── types.ts          # normalized Market, Price, Orderbook, Position, Order, …
│   │       ├── read-adapter.ts   # interface ExchangeReadAdapter (market data + account read)
│   │       ├── signer.ts         # interface ExchangeSigner (client-side signing, per chain)
│   │       ├── stream.ts         # interface ExchangeStream (normalized WS)
│   │       ├── cached-adapter.ts # Redis read-through decorator, fail-open (doc 18 §4)
│   │       └── registry.ts       # ExchangeProvider.read/signer/stream/forUser
│   ├── exchange-hyperliquid/     # NEW — read + EIP-712 signer + WS
│   ├── exchange-pacifica/        # NEW — ported from TFC (read + Ed25519 signer + WS)
│   ├── market-data/             # existing → folds under exchange-core (price feeds)
│   └── solana-client/           # existing
└── turbo.json / pnpm-workspace.yaml   # already cover apps/* and packages/*
```

**Golden rule:** `apps/terminal` depends only on `exchange-core` (interfaces + normalized types).
It never imports `exchange-hyperliquid` directly — the `registry` resolves it. Adding Binance =
a new package + one registry arm, **zero UI changes**.

---

## 5. The adapter pattern (built on doc 18 — three faces)

The subtle trap is treating the adapter as one thing. Because **writes are client-signed and the
signing scheme differs by chain**, the contract is **three interfaces**:

```ts
// packages/exchange-core/src/read-adapter.ts  — server-side (doc 18)
export interface ExchangeReadAdapter {
  readonly name: ExchangeName;            // 'hyperliquid' | 'pacifica' | …
  // market data
  getMarkets(): Promise<Market[]>;
  getPrices(): Promise<Price[]>;
  getOrderbook(symbol: string, agg?: number): Promise<Orderbook>;
  getKlines(p: KlineParams): Promise<Candle[]>;
  getRecentTrades(symbol: string): Promise<RecentTrade[]>;
  // account (read)
  getAccount(id: string): Promise<Account>;
  getPositions(id: string): Promise<Position[]>;
  getOpenOrders(id: string): Promise<Order[]>;
  getTradeHistory(p: TradeHistoryParams): Promise<TradeHistoryItem[]>;
}

// packages/exchange-core/src/signer.ts  — CLIENT-side (the new, critical piece)
export interface ExchangeSigner {
  readonly name: ExchangeName;
  readonly chain: 'solana' | 'evm';       // Pacifica = solana/Ed25519, HyperLiquid = evm/EIP-712
  buildOrder(p: OrderParams): UnsignedPayload;
  signAndSubmit(payload: UnsignedPayload, wallet: WalletSigner): Promise<OrderResult>;
  cancel(p: CancelParams, wallet: WalletSigner): Promise<Result>;
  updateLeverage(symbol: string, leverage: number, wallet: WalletSigner): Promise<Result>;
}

// packages/exchange-core/src/stream.ts  — normalized realtime
export interface ExchangeStream {
  subscribeOrderbook(symbol: string, cb: (o: Orderbook) => void): Unsub;
  subscribePrices(cb: (p: Price[]) => void): Unsub;
  subscribeAccount(id: string, cb: (e: AccountEvent) => void): Unsub;
}

// registry.ts — factory + per-user selection
export const ExchangeProvider = {
  read(name: ExchangeName): ExchangeReadAdapter,   // wrapped in CachedExchangeAdapter if REDIS_URL
  signer(name: ExchangeName): ExchangeSigner,
  stream(name: ExchangeName): ExchangeStream,
  forUser(userId: string): Promise<{ read; signer; stream }>,  // reads DB ExchangeConnection
};
```

Supporting pieces:
- **Normalized types** (`Market`, `Position`, …) are the superset the UI consumes. Each adapter
  maps its exchange's payloads to these; the UI never sees raw Pacifica/HyperLiquid shapes.
- **`CachedExchangeAdapter`** decorates any `ExchangeReadAdapter` (Redis read-through, fail-open) —
  lifted from doc 18 §4. Caching is opt-in (no `REDIS_URL` ⇒ direct passthrough).
- **`ExchangeConnection` (DB table)** records which exchange each user trades on → real
  multi-provider. `forUser()` is the only thing that needs it; until there are 2+ exchanges it can
  default to HyperLiquid.
- **HyperLiquid first**, Pacifica second — porting Pacifica as the *second* adapter is the
  proof that the abstraction actually generalizes.

---

## 6. Migration path (bottom-up, per the doc-set README order)

1. **`exchange-core`** — lift doc 18's `ExchangeAdapter`/types/`CachedExchangeAdapter`/provider into
   a framework-agnostic package; add the `signer` + `stream` faces. Unit-tested, no UI.
2. **`exchange-hyperliquid`** — implement read + stream + EIP-712 signer; verify against HL testnet
   with package tests.
3. **Scaffold `apps/terminal`** — Next 14 + Tailwind (docs 02–03), UI primitives (doc 10),
   layout (doc 04). Wire **Privy** (auth/wallet) from the start.
4. **Port panels/hooks from TFC** (docs 04–14), stripping the fight/referral layer
   (doc 20 enumerates every entanglement). UI talks only to `exchange-core`.
5. **Read/proxy API routes** (doc 17) → `ExchangeProvider.read()`. Optional Redis caching.
6. **Deploy** `apps/terminal` → `terminal.updown.my` (isolated turbo build).
7. **`exchange-pacifica`** — port from TFC as the second adapter → validates the abstraction.
8. **`ExchangeConnection`** (per-user exchange selection) once 2+ exchanges exist.

---

## 7. Consequences

**Positive**
- Independent deploy + subdomain; trading latency/uptime isolated from the betting money-path
  (a terminal bug or exchange 429 cannot touch the pools/scheduler).
- One repo: shared Privy auth, normalized types, turbo/CI, code review, dependency management.
- Exchange integrations are reusable, individually testable packages; new exchanges are additive.
- Reuses the existing `IMarketDataProvider` work and the doc-18 design rather than reinventing.

**Negative / costs**
- A new app + several packages to set up (turbo/pnpm wiring, CI targets, deploy config).
- The terminal keeps its own Tailwind design system distinct from `apps/web`'s MUI (intentional,
  but two design systems coexist in the monorepo).
- Client signing must abstract two chains (EVM + Solana) — real complexity, see Risks.

---

## 8. Risks & open questions

1. **Multi-chain signing (top risk).** HyperLiquid is **EVM/EIP-712**; UpDown wallets are
   **Solana**. Either Privy provisions an **EVM embedded wallet** for HL (supported) or the user
   connects an EVM wallet. Must be solved in phase 2 — it is the most likely thing to derail the
   build. The `ExchangeSigner.chain` field exists precisely to make this explicit.
2. **Design system:** keep Tailwind in `apps/terminal`; do **not** force MUI. Optional later:
   extract shared tokens to `packages/ui-tokens` for visual consistency. Non-blocking.
3. **TradingView Advanced Charting Library** is a proprietary, non-npm binary (docs 11–12) — must
   be obtained separately; `lightweight-charts` is the open-source fallback.
4. **WebSocket scale:** prices/orderbook/account stream **browser → exchange directly** (no backend
   hop) for latency; watch per-exchange connection limits.
5. **`getUserAdapter`/`forUser`** is a stub only until the second exchange ships; then the
   `ExchangeConnection` table is mandatory.
6. **Package-manager parity:** TFC is `npm`; UpDown is `pnpm`. Ported code is adapted to pnpm
   workspaces (the migration docs already target "a fresh project").

---

## 9. Long-term implications

- The terminal can scale and be reasoned about independently of the betting app while still
  sharing identity and tooling. Adding providers (HyperLiquid → Pacifica → Binance → …) is a
  bounded, additive operation behind a stable UI contract.
- If the terminal ever needs to spin out into its own repo, the package boundaries
  (`exchange-*` + a self-contained `apps/terminal`) make that extraction mechanical — we are not
  locking ourselves in, only deferring that cost until (if) it's justified.

---

## 10. If I were lead architect

Build `apps/terminal` inside the UpDown monorepo with `packages/exchange-*`, reusing Privy + types
+ tooling. It is "a module inside UpDown" in what it *shares* and "a separate app" in how it
*deploys* — which is exactly the goal, without the downside of choosing only one.

**Next step (separate from this ADR):** scaffold `packages/exchange-core` (interfaces + registry +
cached decorator, no exchange logic yet) on a feature branch.
