# Parimutuel Pools

Minimal, professional Solana parimutuel pool betting platform.
Users stake USDC on UP/DOWN pools and claim payouts at expiry.

**Single monorepo** containing frontend, backend, and Solana program.

---

## Monorepo Structure

```
parimutuel-pools/
├── apps/
│   ├── web/                    # Next.js + MUI Frontend
│   │   └── src/
│   │       ├── app/            # App router pages
│   │       ├── components/     # React components
│   │       ├── hooks/          # Custom hooks
│   │       ├── services/       # API client
│   │       ├── stores/         # Zustand state
│   │       └── styles/         # MUI theme
│   │
│   └── api/                    # Node.js Backend
│       └── src/
│           ├── controllers/    # HTTP handlers
│           ├── services/       # Business logic
│           ├── jobs/           # Scheduled tasks
│           ├── db/             # Database layer
│           └── middleware/     # Auth, validation
│
├── packages/
│   ├── shared/                 # Shared types, validation, utils
│   ├── market-data/            # Price feed providers
│   └── solana-client/          # Solana program SDK + IDL
│
├── programs/
│   └── parimutuel_pools/       # Anchor/Rust Solana program
│       └── src/
│           ├── lib.rs          # Program entrypoint
│           ├── instructions/   # deposit, resolve, claim
│           ├── state/          # Pool, UserBet accounts
│           ├── errors.rs       # Custom errors
│           ├── events.rs       # On-chain events
│           └── constants.rs    # Program constants
│
├── tests/                      # Anchor program tests
├── docs/                       # Documentation
│
├── Anchor.toml                 # Anchor configuration
├── Cargo.toml                  # Rust workspace
├── package.json                # Root scripts
├── pnpm-workspace.yaml         # pnpm workspaces
└── turbo.json                  # Turborepo config
```

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14 + TypeScript + MUI v5 |
| Backend | Node.js + TypeScript + Express |
| Database | PostgreSQL + Prisma |
| Blockchain | Solana + Anchor (Rust) |
| Wallet | Solana Wallet Adapter (Phantom/Solflare) |
| Market Data | Adapter pattern (Pacifica initial) |
| Monorepo | pnpm workspaces + Turborepo |

---

## Prerequisites

- **Node.js** >= 18.0.0
- **pnpm** >= 8.0.0
- **Rust** >= 1.70.0
- **Solana CLI** >= 1.17.0
- **Anchor CLI** >= 0.29.0
- **PostgreSQL** >= 14

---

## Quick Start

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Build Solana Program

```bash
# Build the Anchor program
pnpm build:program

# IDL is automatically copied to packages/solana-client/src/idl/
```

### 3. Run Program Tests

```bash
# Test Solana program (starts local validator)
pnpm test:program

# Test without starting validator (if already running)
pnpm test:program:local
```

### 4. Setup Database

```bash
# Start PostgreSQL (Docker)
docker run -d --name parimutuel-db \
  -e POSTGRES_USER=dev \
  -e POSTGRES_PASSWORD=dev \
  -e POSTGRES_DB=parimutuel \
  -p 5432:5432 postgres:14

# Run migrations
pnpm db:migrate
```

### 5. Configure Environment

```bash
# Copy example env files
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# Edit with your values (RPC URL, Program ID, etc.)
```

### 6. Start Development

```bash
# Run everything (web + api)
pnpm dev

# Or run individually
pnpm dev:web   # Frontend on http://localhost:3000
pnpm dev:api   # Backend on http://localhost:4000
```

---

## Scripts Reference

### Development

| Script | Description |
|--------|-------------|
| `pnpm dev` | Start all apps in development mode |
| `pnpm dev:web` | Start frontend only |
| `pnpm dev:api` | Start backend only |
| `pnpm build` | Build all apps |

### Solana Program

| Script | Description |
|--------|-------------|
| `pnpm build:program` | Build Solana program + copy IDL |
| `pnpm test:program` | Run Anchor tests (starts validator) |
| `pnpm test:program:local` | Run tests (validator already running) |
| `pnpm lint:program` | Lint Rust code with clippy |
| `pnpm fmt:program` | Format Rust code |
| `pnpm deploy:devnet` | Deploy program to devnet |
| `pnpm deploy:mainnet` | Deploy program to mainnet |

### Database

| Script | Description |
|--------|-------------|
| `pnpm db:migrate` | Run database migrations |
| `pnpm db:generate` | Generate Prisma client |
| `pnpm db:studio` | Open Prisma Studio |

### Quality

| Script | Description |
|--------|-------------|
| `pnpm lint` | Lint all TypeScript code |
| `pnpm typecheck` | Type check all packages |
| `pnpm test` | Run all tests |

---

## Environment Variables

### apps/api/.env

```bash
# Database
DATABASE_URL=postgres://dev:dev@localhost:5432/parimutuel

# Solana
SOLANA_RPC_URL=https://api.devnet.solana.com
PROGRAM_ID=<your_program_id>
RESOLVER_KEYPAIR_PATH=./keys/resolver.json

# Market Data
MARKET_DATA_PROVIDER=pacifica
PACIFICA_API_KEY=xxx
PACIFICA_API_URL=https://api.pacifica.example.com

# Pool Configuration
ASSET_ALLOWLIST=BTC,ETH,SOL,AVAX,MATIC,ARB,OP,DOGE
INTERVALS=15m,1h,24h
FEE_BPS=100

# Server
PORT=4000
NODE_ENV=development
```

### apps/web/.env

```bash
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_PROGRAM_ID=<your_program_id>
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_USDC_MINT=Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr
```

---

## Solana Program

### Accounts

| Account | Description |
|---------|-------------|
| **Pool** | Holds pool configuration, timing, totals, and status |
| **UserBet** | Tracks user's bet side, amount, and claim status |
| **Vault (PDA)** | Holds USDC deposits for a pool |

### Instructions

| Instruction | Description | Authority |
|-------------|-------------|-----------|
| `initialize_pool` | Create a new betting pool | Resolver |
| `deposit` | Deposit USDC to UP or DOWN side | User |
| `resolve` | Set strike/final prices, determine winner | Resolver |
| `claim` | Claim payout from resolved pool | User (winner) |

### Events

- `PoolCreated` — New pool initialized
- `Deposited` — User deposited to pool
- `PoolResolved` — Pool resolved with winner
- `PayoutClaimed` — User claimed payout

### PDA Seeds

```rust
Pool:    ["pool", pool_id]
Vault:   ["vault", pool_pubkey]
UserBet: ["bet", pool_pubkey, user_pubkey]
```

---

## Database Schema

```sql
-- Core Tables
pools           -- Pool configuration and state
bets            -- User bets linked to pools
claims          -- Claim records with tx hashes
price_snapshots -- Strike/final price audit trail
event_log       -- Append-only audit log (never overwritten)
```

See [docs/ENGINEERING_STANDARDS.md](docs/ENGINEERING_STANDARDS.md) for full schema.

---

## API Endpoints

### Pools
- `GET /api/pools` — List pools (filter: asset, interval, status)
- `GET /api/pools/:id` — Pool detail
- `GET /api/pools/:id/stats` — Real-time pool totals

### Bets
- `POST /api/bets` — Register bet intent
- `PATCH /api/bets/:id/confirm` — Confirm deposit tx
- `GET /api/bets/my` — User's bets

### Claims
- `GET /api/claims/claimable` — User's claimable pools
- `POST /api/claims/:poolId` — Register claim tx

### Prices
- `GET /api/prices/:asset` — Current price
- `WS /ws/prices` — Real-time price stream

---

## Architecture

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

## Pool Lifecycle

```
UPCOMING → JOINING → ACTIVE → RESOLVED → CLAIMABLE
    │          │         │         │           │
    │          │         │         │           └── Users claim payouts
    │          │         │         └── Winner determined (UP/DOWN)
    │          │         └── Deposits locked, strike price set
    │          └── Users deposit USDC to UP or DOWN
    └── Pool created by scheduler
```

---

## Deployment

### 1. Deploy Solana Program

```bash
# Deploy to devnet
pnpm deploy:devnet

# Note the Program ID and update .env files
```

### 2. Deploy Backend

```bash
pnpm --filter api build
# Deploy to Railway, Render, Fly.io, etc.
```

### 3. Deploy Frontend

```bash
pnpm --filter web build
# Deploy to Vercel, Netlify, etc.
```

---

## Non-Negotiable Rules

1. **No "vibe coding"** — Every decision must be intentional
2. **Layer separation** — UI / hooks / services / domain
3. **No fetch in components** — Use hooks → services
4. **No AI branding** — No Claude/ChatGPT signatures
5. **Append-only audit** — Critical events never overwritten

---

## Documentation

- [Development Plan](docs/DEVELOPMENT_PLAN.md)
- [Engineering Standards](docs/ENGINEERING_STANDARDS.md)
- [Architecture Diagram](docs/Diagrma-Arquitectura.md)

---

## License

MIT
