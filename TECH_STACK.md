# UpDown - Parimutuel Pools Platform

## Tech Stack Documentation

---

## 1. Project Structure (Monorepo)

```
parimutuel-pools-build/
├── apps/
│   ├── web/                 # Next.js frontend
│   └── api/                 # Express backend
├── packages/
│   ├── solana-client/       # Anchor client library
│   ├── shared/              # Shared types & utilities
│   └── market-data/         # Pacifica market data provider
├── programs/
│   └── parimutuel_pools/    # Solana smart contract (Anchor/Rust)
├── turbo.json               # Build orchestration
├── pnpm-workspace.yaml      # Workspace config
└── Anchor.toml              # Solana program config
```

**Build Tools:**
- **Package Manager**: pnpm 8.10.0 (workspaces)
- **Build Orchestrator**: Turborepo 1.11.0
- **Node Version**: >=18.0.0

---

## 2. Frontend (`apps/web`)

### Core Framework
| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js | 14.0.0 | React framework with App Router |
| React | 18.2.0 | UI library |
| TypeScript | 5.3.0 | Type safety |

### UI & Styling
| Technology | Version | Purpose |
|------------|---------|---------|
| Material-UI (MUI) | 5.14.0 | Component library |
| Emotion | 11.11.0 | CSS-in-JS styling |
| Hanken Grotesk | - | Primary font (Google Fonts) |

### State Management & Data
| Technology | Version | Purpose |
|------------|---------|---------|
| Zustand | 4.4.0 | Lightweight state store |
| TanStack Query | 5.0.0 | Server state & caching |
| Socket.io Client | 4.8.3 | Real-time WebSocket |

### Solana Integration
| Technology | Version | Purpose |
|------------|---------|---------|
| @solana/web3.js | 1.87.0 | Solana SDK |
| @solana/wallet-adapter | 0.15.35 | Wallet connection |
| @solana/spl-token | 0.3.9 | SPL token transfers |

**Supported Wallets**: Phantom, Solflare

### Directory Structure
```
apps/web/src/
├── app/           # Next.js App Router pages
├── components/    # React components (PoolCard, BetForm, etc.)
├── hooks/         # Custom hooks (usePools, useBets, usePriceStream)
├── lib/           # API client, socket connection
├── stores/        # Zustand stores
└── types/         # TypeScript definitions
```

### Key Hooks
- `usePools()` - Fetch and filter pools with React Query
- `useBets(wallet)` - User bet history
- `usePriceStream(assets)` - Real-time price subscriptions
- `useTransactions()` - Deposit and claim operations

---

## 3. Backend (`apps/api`)

### Core Framework
| Technology | Version | Purpose |
|------------|---------|---------|
| Express | 4.18.0 | HTTP server framework |
| TypeScript | 5.3.0 | Type safety |
| Socket.io | 4.8.3 | WebSocket server |
| node-cron | 3.0.0 | Task scheduling |

### Database
| Technology | Version | Purpose |
|------------|---------|---------|
| PostgreSQL | 15 | Relational database |
| Prisma | 5.7.0 | ORM & migrations |
| Docker | - | Database containerization |

### Prisma Schema

```prisma
model Pool {
  id          String   @id @default(uuid())
  poolId      String   @unique          // On-chain pool ID
  asset       String                     // BTC, ETH, SOL
  status      PoolStatus                 // UPCOMING, JOINING, ACTIVE, RESOLVED, CLAIMABLE
  startTime   DateTime
  endTime     DateTime
  lockTime    DateTime
  strikePrice Decimal?
  finalPrice  Decimal?
  totalUp     BigInt   @default(0)
  totalDown   BigInt   @default(0)
  totalPool   BigInt   @default(0)
  winner      Side?
  bets        Bet[]
  snapshots   PriceSnapshot[]
}

model Bet {
  id            String   @id @default(uuid())
  poolId        String
  walletAddress String
  side          Side                     // UP or DOWN
  amount        BigInt
  depositTx     String?
  claimed       Boolean  @default(false)
  claimTx       String?
  payoutAmount  BigInt?
  isWinner      Boolean?
  pool          Pool     @relation(...)

  @@unique([poolId, walletAddress])     // One bet per wallet per pool
}

model PriceSnapshot {
  id        String   @id @default(uuid())
  poolId    String
  type      String                       // STRIKE or FINAL
  price     Decimal
  timestamp DateTime
  source    String                       // pacifica
}
```

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/pools` | GET | List pools with filters |
| `/api/pools/:id` | GET | Pool details |
| `/api/bets` | GET | User bet history |
| `/api/bets/claimable` | GET | Claimable bets |
| `/api/transactions/deposit` | POST | Prepare deposit |
| `/api/transactions/confirm-deposit` | POST | Confirm deposit (verifies on-chain) |
| `/api/transactions/claim` | POST | Prepare claim |
| `/api/transactions/confirm-claim` | POST | Confirm claim |

### Scheduler Jobs
- **Pool Creation**: Hourly (BTC, ETH pools)
- **Status Transitions**: Every minute
- **Pool Resolution**: Every minute (checks ended pools)

---

## 4. Blockchain (`programs/parimutuel_pools`)

### Smart Contract
| Technology | Version | Purpose |
|------------|---------|---------|
| Rust | 2021 Edition | Programming language |
| Anchor | 0.31.1 | Solana framework |
| anchor-spl | 0.31.1 | SPL token integration |

**Program ID (Devnet)**: `HnqB6ahdTEGwJ624D6kaeoSxUS2YwNoq1Cn5Kt9KQBTD`

### Instructions

#### `initialize_pool`
Creates a new parimutuel pool with timing parameters and token vault.

#### `deposit`
User deposits USDC choosing UP or DOWN side.

#### `resolve`
Authority resolves pool with strike and final prices.

#### `claim`
Winners claim their USDC payout.

### Account PDAs

| Account | Seeds | Purpose |
|---------|-------|---------|
| Pool | `["pool", pool_id]` | Pool state |
| Vault | `["vault", pool_id]` | USDC token vault |
| UserBet | `["bet", pool, user]` | Individual bet |

### Token Configuration
- **USDC Mint (Devnet)**: `By87mHK9Meinfv4AEqTx9qyYmGDLUcwiywpkkCWwGUVz`
- **Decimals**: 6

---

## 5. Market Data (`packages/market-data`)

### Pacifica Integration
| Endpoint | Purpose |
|----------|---------|
| `https://api.pacifica.fi` | REST API for prices |
| `wss://ws.pacifica.fi/ws` | WebSocket for real-time |

**Update Frequency**: 1 second intervals

---

## 6. Real-Time Architecture

### WebSocket Events

**Server → Client:**
| Event | Payload | Description |
|-------|---------|-------------|
| `price:tick` | `{asset, price, timestamp}` | Price update |
| `pool:updated` | `{poolId, totalUp, totalDown}` | Pool totals changed |
| `pool:status` | `{poolId, status}` | Status transition |

**Client → Server:**
| Event | Payload | Description |
|-------|---------|-------------|
| `subscribe:prices` | `{assets: string[]}` | Subscribe to prices |
| `subscribe:pool` | `{poolId}` | Subscribe to pool |

---

## 7. Data Flow

### Pool Lifecycle

```
UPCOMING → JOINING → ACTIVE → RESOLVED → CLAIMABLE
```

### Deposit Flow

```
1. User selects pool and side (UP/DOWN)
2. Frontend calls prepareDeposit API
3. Frontend creates SPL token transfer instruction
4. User signs transaction with wallet
5. Frontend sends transaction to Solana
6. Frontend calls confirmDeposit with signature
7. Backend verifies transfer on-chain (amount from blockchain)
8. Backend creates Bet record in database
```

---

## 8. Environment Variables

### Backend (`.env`)
```env
DATABASE_URL="postgresql://user:pass@localhost:5434/parimutuel_pools"
PORT=3002
CORS_ORIGIN=http://localhost:3000
SOLANA_RPC_URL="https://api.devnet.solana.com"
PROGRAM_ID="HnqB6ahdTEGwJ624D6kaeoSxUS2YwNoq1Cn5Kt9KQBTD"
USDC_MINT="By87mHK9Meinfv4AEqTx9qyYmGDLUcwiywpkkCWwGUVz"
```

### Frontend (`.env.local`)
```env
NEXT_PUBLIC_API_URL=http://localhost:3002
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_SOLANA_NETWORK=devnet
NEXT_PUBLIC_PROGRAM_ID=HnqB6ahdTEGwJ624D6kaeoSxUS2YwNoq1Cn5Kt9KQBTD
NEXT_PUBLIC_USDC_MINT=By87mHK9Meinfv4AEqTx9qyYmGDLUcwiywpkkCWwGUVz
```

---

## 9. Development Commands

```bash
# Install dependencies
pnpm install

# Start database
docker-compose up -d

# Run migrations
pnpm db:migrate

# Start development (all apps)
pnpm dev

# Build Solana program
pnpm build:program

# Deploy to Devnet
pnpm deploy:devnet
```

---

## 10. Security Model

### On-Chain Verification
- **Deposits**: Backend verifies actual USDC transfer from blockchain
- **Amount**: Extracted from `preTokenBalances` / `postTokenBalances` diff
- **Never trust frontend** for monetary values

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (Next.js)                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   Zustand   │  │ React Query │  │  Wallet Adapter         │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
         │ HTTP               │ WebSocket            │ RPC
         ▼                    ▼                      ▼
┌─────────────────────────────────────────┐    ┌─────────────────┐
│            Backend (Express)             │    │  Solana Devnet  │
│  ┌─────────────┐  ┌─────────────────┐   │    │  ┌───────────┐  │
│  │   Prisma    │  │   Socket.io     │   │    │  │  Program  │  │
│  └─────────────┘  └─────────────────┘   │    │  └───────────┘  │
│  ┌─────────────┐  ┌─────────────────┐   │    │  ┌───────────┐  │
│  │  Scheduler  │  │  Pacifica WS    │   │    │  │   Vault   │  │
│  └─────────────┘  └─────────────────┘   │    │  └───────────┘  │
└─────────────────────────────────────────┘    └─────────────────┘
         │
         ▼
┌─────────────────┐
│   PostgreSQL    │
└─────────────────┘
```
