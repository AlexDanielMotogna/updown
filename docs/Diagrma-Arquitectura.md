# Arquitectura - Parimutuel Pools (Monorepo)

## 1. Estructura del Monorepo

```
parimutuel-pools/
├── apps/
│   ├── web/                    # Next.js + MUI Frontend
│   └── api/                    # Node.js Backend + Scheduler
├── packages/
│   ├── shared/                 # Types, validation, utils
│   ├── market-data/            # Price providers (Pacifica)
│   └── solana-client/          # Program SDK + IDL
├── programs/
│   └── parimutuel_pools/       # Anchor/Rust Solana program
├── tests/                      # Program tests
├── Anchor.toml
├── Cargo.toml
├── package.json
└── turbo.json
```

---

## 2. Diagrama de Arquitectura (High-level)

```
flowchart TB
    U[User] -->|Browser| W[Web App (Next.js + MUI)]
    W -->|Wallet Connect| SW[Solana Wallet (Phantom/Solflare)]
    W -->|HTTPS| API[Backend API]
    W <-->|WebSocket| WS[Socket.io Server]
    API --> DB[(PostgreSQL)]
    API --> MQ[Scheduler/Workers]
    MQ --> API
    MQ -->|Events| WS

    W -->|Read only| MD[Market Data Service]
    API -->|Read only| MD
    MD -->|Price Stream| WS

    SW -->|Sign & send tx| RPC[Solana RPC]
    RPC --> SC[Solana Program: Parimutuel Pools]
    SC -->|Events/State| RPC

    API -->|Index/Verify| RPC
    API -->|Store tx/pool state| DB
```

---

## 3. Diagrama de Componentes (Monorepo)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              MONOREPO                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                        apps/web/                                 │   │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐    │   │
│  │  │   Pages   │  │Components │  │   Hooks   │  │ Services  │    │   │
│  │  │  Markets  │  │  PoolCard │  │  usePools │  │ apiClient │    │   │
│  │  │   Pool    │  │  BetForm  │  │  useBets  │  │           │    │   │
│  │  │  MyBets   │  │  Wallet   │  │ useWallet │  │           │    │   │
│  │  └───────────┘  └───────────┘  └───────────┘  └───────────┘    │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│         │                                          │                    │
│         │ imports                                  │ imports            │
│         ▼                                          ▼                    │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                        packages/                                  │  │
│  │  ┌──────────────┐  ┌────────────────┐  ┌─────────────────────┐   │  │
│  │  │   shared/    │  │  market-data/  │  │   solana-client/    │   │  │
│  │  │  - types     │  │  - interface   │  │  - idl/ (auto-copy) │   │  │
│  │  │  - schemas   │  │  - pacifica    │  │  - instructions     │   │  │
│  │  │  - utils     │  │  - normalized  │  │  - accounts         │   │  │
│  │  └──────────────┘  └────────────────┘  └─────────────────────┘   │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│         │                                          ▲                    │
│         │ imports                                  │ IDL copy           │
│         ▼                                          │                    │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                        apps/api/                                 │   │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐    │   │
│  │  │Controllers│  │ Services  │  │   Jobs    │  │    DB     │    │   │
│  │  │  pools    │  │  pool     │  │ scheduler │  │  prisma   │    │   │
│  │  │  bets     │  │  indexer  │  │ resolver  │  │  repos    │    │   │
│  │  │  claims   │  │  resolver │  │ capture   │  │           │    │   │
│  │  └───────────┘  └───────────┘  └───────────┘  └───────────┘    │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                    │                    │
│                                                    │ anchor build       │
│                                                    │                    │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                     programs/parimutuel_pools/                   │   │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐    │   │
│  │  │   lib.rs  │  │instructions│  │   state   │  │  events   │    │   │
│  │  │ entrypoint│  │  deposit   │  │   Pool    │  │ Deposited │    │   │
│  │  │           │  │  resolve   │  │  UserBet  │  │ Resolved  │    │   │
│  │  │           │  │   claim    │  │           │  │  Claimed  │    │   │
│  │  └───────────┘  └───────────┘  └───────────┘  └───────────┘    │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Data Flow (Pool Lifecycle)

```
sequenceDiagram
    autonumber
    participant BE as Backend (API + Scheduler)
    participant MD as MarketDataProvider (Adapter)
    participant DB as Database (Audit)
    participant SC as Solana Program
    participant UI as Web UI
    participant W as Wallet

    BE->>DB: Create Pool (UPCOMING)
    UI->>BE: Fetch pools list
    UI->>MD: Subscribe prices (WS) / Poll (REST)

    UI->>W: User chooses UP/DOWN + stake
    W->>SC: Deposit USDC to Pool PDA (tx)
    BE->>DB: Save bet + deposit_tx (indexed later)

    BE->>MD: At start_time => getSpotPrice(symbol)
    BE->>DB: Store strike_price + timestamp + source + raw_hash
    BE->>DB: Pool status = ACTIVE (lock deposits)

    BE->>MD: At end_time => getSpotPrice(symbol)
    BE->>DB: Store final_price + timestamp + source + raw_hash
    BE->>DB: Pool status = RESOLVED + winner side

    UI->>BE: My Bets / Claimable pools
    UI->>W: Claim payout
    W->>SC: Claim tx
    BE->>DB: Store claim_tx + payout amount + status
```

---

## 5. Pool States

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ UPCOMING │───►│ JOINING  │───►│  ACTIVE  │───►│ RESOLVED │───►│CLAIMABLE │
└──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘
     │               │               │               │               │
     │               │               │               │               │
     ▼               ▼               ▼               ▼               ▼
  Created        Deposits        Deposits       Winner set      Payouts
  by scheduler   allowed         locked         strike/final    claimed
                                 strike set     prices stored
```

---

## 6. Monorepo Benefits

| Benefit | Description |
|---------|-------------|
| **Single Source of Truth** | All code in one place |
| **Atomic Commits** | Update program + SDK + frontend in one commit |
| **IDL Auto-Sync** | `pnpm build:program` copies IDL to solana-client |
| **Shared Types** | `packages/shared` used by all apps |
| **Unified CI/CD** | Single pipeline for all components |
| **Easier Debugging** | Step through entire stack in one workspace |

---

## 7. Key Commands

```bash
# Install dependencies
pnpm install

# Build Solana program (+ auto-copy IDL)
pnpm build:program

# Run program tests
pnpm test:program

# Start development (web + api)
pnpm dev

# Deploy to devnet
pnpm deploy:devnet

# Lint everything
pnpm lint && pnpm lint:program
```

---

## 8. External Integrations

```
┌────────────────────────────────────────────────────────────────────┐
│                        EXTERNAL SERVICES                           │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐ │
│  │   Solana RPC     │  │   Market Data    │  │    PostgreSQL    │ │
│  │                  │  │                  │  │                  │ │
│  │  - Devnet       │  │  - Pacifica API  │  │  - pools         │ │
│  │  - Mainnet      │  │  - WebSocket     │  │  - bets          │ │
│  │                  │  │  - Fallbacks     │  │  - claims        │ │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘ │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

---

## 9. WebSocket Architecture (Real-Time Layer)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     WEBSOCKET REAL-TIME LAYER                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  CLIENT (Browser)                                                       │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │  useSocket() ──► usePoolUpdates() ──► PoolCard (re-render)     │    │
│  │       │                                                         │    │
│  │       └──────► usePriceStream()  ──► PriceDisplay (re-render)  │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                              │                                          │
│                              │ Socket.io (WSS)                          │
│                              ▼                                          │
│  SERVER (API)                                                           │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │                      Socket.io Server                           │    │
│  │  ┌──────────────────────────────────────────────────────────┐  │    │
│  │  │  ROOMS                                                    │  │    │
│  │  │  ├── pool:{poolId}    → subscribers for specific pool    │  │    │
│  │  │  ├── prices:{asset}   → subscribers for BTC/ETH/SOL      │  │    │
│  │  │  └── pools:all        → subscribers for new pools        │  │    │
│  │  └──────────────────────────────────────────────────────────┘  │    │
│  │                              ▲                                  │    │
│  │                              │ EventBus                         │    │
│  │  ┌───────────────┬──────────┴────────┬───────────────────┐     │    │
│  │  │   Scheduler   │    Bet Service    │  Pacifica Stream  │     │    │
│  │  │ (pool status) │   (bet placed)    │    (prices)       │     │    │
│  │  └───────────────┴───────────────────┴───────────────────┘     │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Event Flow Examples

```
┌────────────────────────────────────────────────────────────────────────┐
│  Example 1: User places a bet                                          │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  User A                   Server                    User B (viewing)   │
│     │                       │                            │             │
│     │ POST /api/bets        │                            │             │
│     │──────────────────────►│                            │             │
│     │                       │ EventBus.emit('bet:new')   │             │
│     │                       │───────────┐                │             │
│     │                       │           │                │             │
│     │                       │◄──────────┘                │             │
│     │                       │                            │             │
│     │                       │ io.to('pool:xyz').emit()   │             │
│     │                       │───────────────────────────►│             │
│     │                       │                            │             │
│     │ 201 Created           │              pool:updated  │             │
│     │◄──────────────────────│             {totalUp: +10} │             │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│  Example 2: Pool status transition                                     │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  Scheduler                  Server                    All Clients      │
│     │                         │                            │           │
│     │ Pool lock_time reached  │                            │           │
│     │ Update DB: ACTIVE       │                            │           │
│     │                         │                            │           │
│     │ EventBus.emit           │                            │           │
│     │ ('pool:status')         │                            │           │
│     │────────────────────────►│                            │           │
│     │                         │                            │           │
│     │                         │ io.to('pool:xyz').emit()   │           │
│     │                         │───────────────────────────►│           │
│     │                         │                            │           │
│     │                         │              pool:status   │           │
│     │                         │   {status: 'ACTIVE',       │           │
│     │                         │    strikePrice: '102500'}  │           │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

### Server Events (outgoing)

| Event | Room | Payload | When |
|-------|------|---------|------|
| `pool:updated` | `pool:{id}` | `{ id, totalUp, totalDown }` | Bet placed |
| `pool:status` | `pool:{id}` | `{ id, status, strikePrice?, finalPrice?, winner? }` | Status transition |
| `price:tick` | `prices:{asset}` | `{ asset, price, timestamp }` | Every 1s |
| `pools:new` | `pools:all` | `{ pool: Pool }` | New pool created |

### Client Events (incoming)

| Event | Payload | Action |
|-------|---------|--------|
| `subscribe:pool` | `{ poolId: string }` | Join `pool:{poolId}` room |
| `unsubscribe:pool` | `{ poolId: string }` | Leave `pool:{poolId}` room |
| `subscribe:prices` | `{ assets: string[] }` | Join `prices:{asset}` rooms |
| `unsubscribe:prices` | `{ assets: string[] }` | Leave price rooms |
