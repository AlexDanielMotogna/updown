# UpDown - Parimutuel Pools Development Plan

## Project Overview

A minimal, professional Solana parimutuel pool betting MVP where users stake USDC on UP/DOWN pools and claim payouts at expiry.

**Architecture**: Single monorepo containing frontend, backend, and Solana program.

---

## Phase 1: Foundation & Infrastructure (Week 1-2)

### Sprint 1.1: Monorepo Setup

| Ticket | Priority | Description | Acceptance Criteria |
|--------|----------|-------------|---------------------|
| A1 | P0 | Create monorepo with apps (web + api), packages (shared, market-data, solana-client), and programs (parimutuel_pools) | `pnpm install` works, `pnpm build:program` compiles, folder structure complete |
| A2 | P0 | Configure Turborepo + pnpm workspaces | `pnpm dev` runs both web and api concurrently |
| A3 | P0 | Configure Anchor for programs/ folder | `pnpm test:program` runs tests successfully |
| A4 | P0 | Create ENGINEERING_STANDARDS.md | Document in /docs/, linked in README |

### Sprint 1.2: Database & Core Backend Setup

| Ticket | Priority | Description | Acceptance Criteria |
|--------|----------|-------------|---------------------|
| C1 | P0 | DB schema + migrations (pools, bets, claims, price_snapshots, event_log) | Migrations reproducible, constraints enforced |
| C3 | P0 | Market Data Adapter Layer (IMarketDataProvider + PacificaProvider) | `getSpotPrice(symbol)` works with normalized output |

---

## Phase 2: Solana Program Development (Week 2-4)

### Sprint 2.1: Core Program Accounts

| Ticket | Priority | Description | Acceptance Criteria |
|--------|----------|-------------|---------------------|
| B1 | P0 | Program accounts & PDAs (Pool, UserBet, Vault) | Anchor tests create pool/bet without failures |
| B2 | P0 | Deposit USDC to Pool (`deposit(side, amount)`) | No deposit outside JOINING window, totals correct |

### Sprint 2.2: Resolution & Claims

| Ticket | Priority | Description | Acceptance Criteria |
|--------|----------|-------------|---------------------|
| B3 | P0 | Resolve pool (backend authority) | No resolve before end_time, winner calculated correctly |
| B4 | P0 | Claim payout (proportional calculation) | Payouts exact per formula, double-claim reverts |
| B5 | P0 | Events + logs (PoolCreated, Deposited, Resolved, Claimed) | Events indexable from backend |

### Sprint 2.3: IDL Integration

| Ticket | Priority | Description | Acceptance Criteria |
|--------|----------|-------------|---------------------|
| B6 | P0 | Auto-copy IDL to packages/solana-client after build | `pnpm build:program` copies IDL automatically |
| B7 | P0 | Generate TypeScript types from IDL | solana-client exports typed instructions |

---

## Phase 3: Backend Services (Week 3-5)

### Sprint 3.1: Pool Lifecycle Management

| Ticket | Priority | Description | Acceptance Criteria |
|--------|----------|-------------|---------------------|
| C2 | P0 | Pool scheduler (create pools by allowlist + intervals) | Pools auto-generate and rotate (UPCOMING→JOINING→ACTIVE→RESOLVED→CLAIMABLE) |
| C4 | P0 | Strike/Final price capture + audit | Each pool has auditable strike/final snapshots |
| C6 | P0 | Resolve job (get final price, calculate winner, call program) | Pools end in RESOLVED, enable claims |

### Sprint 3.2: Indexing & Tracking

| Ticket | Priority | Description | Acceptance Criteria |
|--------|----------|-------------|---------------------|
| C5 | P0 | Indexer (tx verification, link deposit_tx with bet) | Bets in DB match on-chain, logs saved |
| C7 | P0 | Claims tracking (endpoint + claim_tx storage) | UI sees claimable, DB stores audit trail |

---

## Phase 4: Frontend Development (Week 4-6)

### Sprint 4.1: Foundation & Wallet

| Ticket | Priority | Description | Acceptance Criteria |
|--------|----------|-------------|---------------------|
| D1 | P0 | MUI Theme + design tokens (dark minimal) | UI consistent, components reusable |
| D2 | P0 | Wallet connect (Phantom/Solflare) | Connect/disconnect stable, no unnecessary signatures |

### Sprint 4.2: Core Pages

| Ticket | Priority | Description | Acceptance Criteria |
|--------|----------|-------------|---------------------|
| D3 | P0 | Markets page (list + filters by asset/interval/status) | Filters work without full reload |
| D4 | P0 | Pool detail page (countdown, strike rule, totals, UP/DOWN selector, stake input) | Can initiate deposit tx correctly |

### Sprint 4.3: Transactions & User Dashboard

| Ticket | Priority | Description | Acceptance Criteria |
|--------|----------|-------------|---------------------|
| D5 | P0 | Transaction modals (confirm→pending→success/fail + explorer link) | Flow clear, no user confusion |
| D6 | P0 | My Bets page (active/resolved/claimable + claim button) | Claim executes tx, state reflects correctly |

---

## Phase 5: Observability & Security (Week 6-7)

| Ticket | Priority | Description | Acceptance Criteria |
|--------|----------|-------------|---------------------|
| E1 | P1 | Error handling + monitoring (structured logs, clean UI errors) | Errors don't break UX |
| E2 | P1 | Rate limits + validation (zod schemas, basic rate limiting) | Endpoints protected against spam |
| E3 | P1 | Admin config (allowlist, fee_bps, intervals) | Configurable via env/config |

---

## Phase 6: Polish & Launch Prep (Week 7-8)

| Ticket | Priority | Description | Acceptance Criteria |
|--------|----------|-------------|---------------------|
| F1 | P2 | "How it works" page | Clear explanation for users |
| F2 | P2 | Skeleton loaders | Loading states feel professional |
| F3 | P2 | Basic SEO + meta tags | Pages indexable, proper previews |
| F4 | P2 | Analytics events (no PII) | Key events tracked |

---

## Monorepo Architecture

```
parimutuel-pools/
├── apps/
│   ├── web/                    # Next.js + MUI Frontend
│   └── api/                    # Node.js Backend + Scheduler
│
├── packages/
│   ├── shared/                 # Types, validation, utils
│   ├── market-data/            # Price feed providers
│   └── solana-client/          # Program SDK + IDL
│
├── programs/
│   └── parimutuel_pools/       # Anchor/Rust Solana program
│
├── tests/                      # Anchor program tests
├── docs/                       # Documentation
│
├── Anchor.toml                 # Anchor config
├── Cargo.toml                  # Rust workspace
├── package.json                # Root scripts
├── pnpm-workspace.yaml         # Workspaces
└── turbo.json                  # Turborepo
```

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND                             │
│  Next.js + MUI → Markets, Pool Detail, My Bets              │
└─────────────────────────────────────────────────────────────┘
            │ API                          │ Wallet
            ▼                              ▼
┌───────────────────────────┐   ┌─────────────────────────────┐
│         BACKEND           │   │      SOLANA PROGRAM         │
│  ┌─────────────────────┐  │   │  ┌───────────────────────┐  │
│  │  API + Scheduler    │  │   │  │  parimutuel_pools     │  │
│  │  - Pool lifecycle   │  │   │  │  - Pool PDA           │  │
│  │  - Price capture    │◄─┼───┼─►│  - UserBet PDA        │  │
│  │  - Resolution       │  │   │  │  - Vault PDA          │  │
│  └──────────┬──────────┘  │   │  └───────────────────────┘  │
│             │             │   └─────────────────────────────┘
│  ┌──────────▼──────────┐  │
│  │    PostgreSQL       │  │   ┌─────────────────────────────┐
│  │  pools, bets,       │  │   │    MARKET DATA PROVIDER     │
│  │  claims, snapshots  │◄─┼───│  Pacifica → Normalized      │
│  └─────────────────────┘  │   └─────────────────────────────┘
└───────────────────────────┘
```

---

## Pool Lifecycle States

```
UPCOMING → JOINING → ACTIVE → RESOLVED → CLAIMABLE
    │          │         │         │           │
    │          │         │         │           └── Users can claim payouts
    │          │         │         └── Winner determined, final price stored
    │          │         └── Deposits locked, strike price stored
    │          └── Users can deposit USDC (UP/DOWN)
    └── Pool created, waiting for join window
```

---

## Key Dependencies (Monorepo)

| From | To | Dependency |
|------|-----|------------|
| `programs/` | `packages/solana-client/` | IDL auto-copied after `pnpm build:program` |
| `packages/shared/` | `apps/web/`, `apps/api/` | Types, validation schemas |
| `packages/market-data/` | `apps/api/` | Price provider interface |
| `packages/solana-client/` | `apps/web/`, `apps/api/` | Program instructions, account fetchers |

**Monorepo Advantage**: All dependencies are in-sync. A single commit can update program + SDK + frontend.

---

## Scripts Quick Reference

| Command | Description |
|---------|-------------|
| `pnpm install` | Install all dependencies |
| `pnpm dev` | Start web + api in dev mode |
| `pnpm build:program` | Build Solana program + copy IDL |
| `pnpm test:program` | Run Anchor tests |
| `pnpm deploy:devnet` | Deploy program to devnet |
| `pnpm db:migrate` | Run database migrations |
| `pnpm lint` | Lint all TypeScript |
| `pnpm lint:program` | Lint Rust with clippy |

---

## Risk Mitigation

1. **Program Security**: Thorough testing before mainnet; start on devnet
2. **Price Feed Reliability**: Implement fallback providers in adapter layer
3. **Double-claim Prevention**: On-chain + off-chain validation
4. **Audit Trail**: Append-only event log for all critical operations
5. **IDL Sync**: Auto-copy ensures frontend always matches program

---

## Phase 7: Real-Time WebSocket Layer (Week 8-9)

### Overview

Implement Socket.io-based real-time updates to replace polling for a more responsive UX.

```
┌─────────────────────────────────────────────────────────────────────┐
│                     WEBSOCKET ARCHITECTURE                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────┐         ┌──────────────┐         ┌─────────────┐ │
│  │   Frontend   │◄───────►│  Socket.io   │◄───────►│  Scheduler  │ │
│  │   (React)    │   WS    │   Server     │  Events │  + Services │ │
│  └──────────────┘         └──────────────┘         └─────────────┘ │
│         │                        │                        │         │
│         │                        │                        │         │
│         ▼                        ▼                        ▼         │
│  ┌──────────────┐         ┌──────────────┐         ┌─────────────┐ │
│  │  useSocket   │         │    Rooms     │         │  EventBus   │ │
│  │    hook      │         │  pool:{id}   │         │  (internal) │ │
│  │              │         │  prices:{a}  │         │             │ │
│  └──────────────┘         └──────────────┘         └─────────────┘ │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Sprint 7.1: Server-Side WebSocket Infrastructure

| Ticket | Priority | Description | Acceptance Criteria |
|--------|----------|-------------|---------------------|
| G1 | P0 | Socket.io server integration with Express | Server starts on same port, CORS configured |
| G2 | P0 | Room management (pool:{id}, prices:{asset}) | Clients can join/leave rooms |
| G3 | P0 | Internal EventBus for cross-service communication | Services can emit events without circular deps |
| G4 | P0 | Pool event broadcasting (status, totals) | Status changes emit to room subscribers |

### Sprint 7.2: Price Stream Integration

| Ticket | Priority | Description | Acceptance Criteria |
|--------|----------|-------------|---------------------|
| G5 | P0 | Forward Pacifica WS prices to clients | Frontend receives prices via socket |
| G6 | P1 | Price aggregation (throttle to 1/sec per asset) | No flood of price updates |
| G7 | P1 | Reconnection handling + health checks | Auto-reconnect on disconnect |

### Sprint 7.3: Client-Side Integration

| Ticket | Priority | Description | Acceptance Criteria |
|--------|----------|-------------|---------------------|
| G8 | P0 | `useSocket` hook (connect, rooms, events) | Hook manages lifecycle correctly |
| G9 | P0 | `usePoolUpdates` hook (subscribe to pool changes) | Pool cards update in real-time |
| G10 | P0 | `usePriceStream` hook (subscribe to asset prices) | Price displays update live |
| G11 | P1 | Connection status indicator in UI | User sees connected/disconnected state |

### WebSocket Events Specification

#### Server → Client Events

| Event | Room | Payload | Trigger |
|-------|------|---------|---------|
| `pool:updated` | `pool:{id}` | `{ id, status, totalUp, totalDown }` | Bet placed, status change |
| `pool:status` | `pool:{id}` | `{ id, status, strikePrice?, finalPrice?, winner? }` | JOINING→ACTIVE→RESOLVED |
| `price:tick` | `prices:{asset}` | `{ asset, price, timestamp }` | Every 1s (throttled) |
| `pools:new` | `pools:all` | `{ pool }` | New pool created |

#### Client → Server Events

| Event | Payload | Action |
|-------|---------|--------|
| `subscribe:pool` | `{ poolId }` | Join room `pool:{poolId}` |
| `unsubscribe:pool` | `{ poolId }` | Leave room `pool:{poolId}` |
| `subscribe:prices` | `{ assets: string[] }` | Join rooms `prices:{asset}` for each |
| `unsubscribe:prices` | `{ assets: string[] }` | Leave price rooms |

### Files to Create/Modify

**Backend (apps/api/src/)**

| File | Description |
|------|-------------|
| `websocket/index.ts` | Socket.io server setup + export |
| `websocket/rooms.ts` | Room management utilities |
| `websocket/handlers.ts` | Event handlers for client messages |
| `services/event-bus.ts` | Internal pub/sub for services |
| `scheduler/pool-scheduler.ts` | Emit events on pool changes |
| `routes/bets.ts` | Emit events on new bets |
| `index.ts` | Initialize WebSocket with HTTP server |

**Frontend (apps/web/src/)**

| File | Description |
|------|-------------|
| `lib/socket.ts` | Socket.io client instance + config |
| `hooks/useSocket.ts` | Core socket connection hook |
| `hooks/usePoolUpdates.ts` | Subscribe to pool room |
| `hooks/usePriceStream.ts` | Subscribe to price stream |
| `components/ConnectionStatus.tsx` | Optional: show socket status |
| `app/providers.tsx` | Add SocketProvider context |

**Shared Types (packages/shared/)**

| File | Description |
|------|-------------|
| `src/websocket-events.ts` | Event names, payload types |

### Implementation Notes

1. **Layer Separation**: Socket logic stays in hooks, not components
2. **Fallback**: Keep React Query polling as fallback if WS disconnects
3. **Throttling**: Aggregate price updates server-side (1 update/sec)
4. **Validation**: Use Zod for incoming client event payloads
5. **Security**: No auth required for read-only subscriptions (MVP)
6. **Testing**: Add integration tests for socket events

### Dependencies to Add

```bash
# Backend
pnpm add socket.io --filter api

# Frontend
pnpm add socket.io-client --filter web

# Shared types
# (no new deps, just TypeScript types)
```

---

## Success Metrics for MVP

- [ ] Users can connect wallet and see available pools
- [ ] Users can deposit USDC to UP/DOWN sides
- [ ] Pools resolve automatically at expiry with correct winner
- [ ] Users can claim payouts without errors
- [ ] All transactions auditable in DB
- [ ] < 3s page load times
- [ ] Zero fund loss incidents
- [ ] `pnpm build` succeeds with no errors
- [ ] `pnpm test:program` passes all tests
