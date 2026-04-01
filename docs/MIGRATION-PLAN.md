# EVM Migration Plan — Pacifica L1 Integration

> Last verified: 2026-03-30

---

## 1. Context

UpDown currently runs exclusively on Solana (Anchor/Rust program). Pacifica is launching a
Substrate-based L1 with EVM+SVM compatibility in ~1 month. We want to:

1. Prepare the app for multi-chain support (Solana + Pacifica EVM)
2. Keep Solana as fallback if Pacifica has issues
3. Write the Solidity smart contract equivalent of the Anchor program
4. **Let users switch between chains via a toggle in the UI**

Architecture decision: Dual-chain ready from day 1. Add chain column to DB, adapter factory
pattern. Start with Solana only — activate EVM when Pacifica launches.

**Bridge between chains**: Not feasible to build in-house. Cross-chain bridges require relayers,
validators, security audits, and are built by specialized protocols (Wormhole, LayerZero, etc.).
If Pacifica offers a native bridge, users can use that externally. For UpDown, pools exist on
one chain or the other — users choose where to play, no cross-chain fund movement needed.

---

## 2. What We Know About Pacifica L1

From their public documentation:

| Feature | Detail |
|---|---|
| Framework | Substrate (Rust) |
| Consensus | Fast HotStuff BFT — sub-second finality |
| VM compatibility | EVM + SVM — Solidity, Rust, or C++ |
| Critical logic | Runs in optimized WASM |
| Current state | Deposits/withdrawals on Solana (Phase 1) |
| Roadmap | Phase 2: on-chain state verifiability, Phase 3: ZK proofs |
| Token | USDC on Solana currently |

---

## 3. Questions for Pacifica (priority order)

### Must-know before coding

| # | Question | Why we need it |
|---|---|---|
| 1 | Standard EVM tooling works? (Hardhat + ethers.js + Solidity compiled with solc) | Determines entire approach |
| 2 | Which EVM version? (Shanghai, Cancun, etc.) | Determines which Solidity features/opcodes work |
| 3 | USDC availability + token standard | Our app is 100% USDC-denominated. Native or bridged? ERC-20? |
| 4 | Chain ID + Testnet RPC endpoint | Can't start without this |
| 5 | Block time + finality guarantees | Our scheduler runs 10-second cycles, pool timing depends on this |
| 6 | SVM vs EVM recommendation | Since they support both, which do they recommend for third-party apps? |

### Important but can wait

| # | Question | Why we need it |
|---|---|---|
| 7 | Gas token — own token or ETH? | Wallet config, user UX |
| 8 | Gas model — EIP-1559 style, fixed, or custom? | Fee estimation |
| 9 | Account abstraction / gas sponsorship (ERC-4337)? | Smoother UX for new users |
| 10 | Standard JSON-RPC (eth_*)? Or custom? | Backend RPC integration |
| 11 | WebSocket RPC support? | Real-time price feeds |
| 12 | MetaMask support? Just add network config? | Frontend wallet integration |
| 13 | Block explorer at launch? | We verify transactions backend-side |
| 14 | Testnet access timeline + faucet | Need 2-3 weeks before mainnet |
| 15 | Custom precompiles? | Substrate chains sometimes add chain-specific precompiles |
| 16 | Contract size limits? | Ethereum = 24KB, some L2s differ |

---

## 4. Current Architecture — Solana Touchpoints

> Line counts verified 2026-03-30 against actual codebase.

### What needs to change for EVM

| Layer | Current (Solana) | EVM equivalent |
|---|---|---|
| Smart contract | Anchor/Rust (13 instructions) | Solidity contract (13 functions) |
| Token transfers | SPL Token (USDC) | ERC-20 transferFrom() |
| Account model | PDAs (Pool, Vault, UserBet) | mapping(bytes32 => Pool) in contract storage |
| Wallet signing | Privy + Phantom/Solflare | Privy + MetaMask (Privy supports both) |
| RPC calls | @solana/web3.js | ethers.js / viem |
| Tx verification | getTransaction() + token balance diff | getTransactionReceipt() + event logs |
| Authority co-sign (claims) | Keypair partial sign | ECDSA signature verification (EIP-712) |
| Authority wallet | Solana Keypair | EVM private key (ethers.Wallet) |

### What stays the same (~70% of the app)

- PostgreSQL schema + Prisma ORM
- Pool scheduler logic (PoolCreator, PoolResolver)
- Business logic (payouts, XP, rewards, referrals, streaks)
- React frontend UI components
- Market data provider (Pacifica REST + WebSocket prices)
- Socket.io WebSocket layer
- Admin panel

### Chain-specific code by file

| File | Total lines | Chain-specific | Business logic |
|---|---|---|---|
| `packages/solana-client/src/instructions/index.ts` | 397 | 397 (100%) | 0 |
| `packages/solana-client/src/accounts/index.ts` | 58 | 58 (100%) | 0 |
| `packages/solana-client/src/types.ts` | 45 | 45 (100%) | 0 |
| `apps/api/src/utils/solana.ts` | 127 | 127 (100%) | 0 |
| `apps/api/src/scheduler/onchain-tx.ts` | 216 | 160 (74%) | 56 |
| `apps/api/src/scheduler/pool-creator.ts` | 297 | 60 (20%) | 237 |
| `apps/api/src/scheduler/pool-resolver.ts` | 322 | 30 (9%) | 292 |
| `apps/api/src/scheduler/resolve-logic.ts` | 382 | 30 (8%) | 352 |
| `apps/api/src/routes/deposits.ts` | 473 | 280 (59%) | 193 |
| `apps/api/src/routes/claims.ts` | 367 | 150 (41%) | 217 |
| `apps/api/src/routes/faucet.ts` | 123 | 80 (65%) | 43 |
| `apps/web/src/hooks/useWalletBridge.ts` | 119 | 50 (42%) | 69 |
| `apps/web/src/hooks/useTransactions.ts` | 294 | 70 (24%) | 224 |
| `apps/web/src/hooks/useUsdcBalance.ts` | 67 | 8 (12%) | 59 |
| `apps/web/src/app/providers.tsx` | 341 | 40 (12%) | 301 |
| **TOTAL** | **~3,630** | **~1,590 (44%)** | **~2,040 (56%)** |

---

## 5. Dual-Chain Architecture

### How it works

```
Frontend:
  User connects wallet → chain toggle in header
  Toggle: SOLANA | PACIFICA
  Switching chain:
    → reconnects wallet (Solana or EVM)
    → filters pools by selected chain
    → shows correct balance (SPL USDC or ERC-20 USDC)

Backend:
  ACTIVE_CHAINS=SOLANA,EVM

  Scheduler:
    for each activeChain:
      PoolCreator(chain) → creates pools on that chain
      PoolResolver(chain) → resolves pools on that chain

  Routes:
    POST /deposit → looks up pool.chain → uses correct adapter

  Adapter Factory:
    getChainAdapter('SOLANA') → SolanaChainAdapter
    getChainAdapter('EVM')    → EvmChainAdapter (future)

Database:
  Pool       { ..., chain: 'SOLANA' | 'EVM' }
  Bet        { ..., chain: 'SOLANA' | 'EVM' }
  Tournament { ..., chain: 'SOLANA' | 'EVM' }

User identity:
  Phase 1: separate users per chain (Option A)
    → Solana wallet = User A, EVM wallet = User B
    → XP, coins, streaks, referrals are per-chain
    → No schema changes to User model
  Phase 3 (optional): unified identity via Privy ID
    → Add privyUserId to User, link multiple wallets
    → Merge XP/rewards across chains
```

### What changes for dual-chain vs single-chain

| Component | Single-chain | Dual-chain (extra work) |
|---|---|---|
| DB schema | No changes | +chain column on Pool, Bet, Tournament |
| User identity | 1 wallet = 1 user | Separate users per chain (Phase 1) |
| Backend | 1 adapter singleton | Adapter factory (map chain → adapter) |
| Scheduler | 1 loop | Iterates over active chains |
| Routes | Adapter fixed | Looks up pool.chain to pick adapter |
| Frontend | 1 wallet type | Privy configured for Solana + EVM, chain toggle |
| ENV vars | 1 set of RPCs | 2 sets + ACTIVE_CHAINS var |
| Authority | 1 Solana keypair | + 1 EVM private key |

Extra effort: ~2 hours (chain column + factory pattern)

---

## 6. Chain Toggle — User-Facing Blockchain Switch

### UX Design

A toggle/selector in the app header, next to the wallet button:

```
┌──────────────────────────────────────────────────────┐
│  [🔗 Solana ▾]   [Connect Wallet]                    │
│                                                      │
│  Dropdown options:                                   │
│  ● Solana  (devnet)                                  │
│  ○ Pacifica (coming soon — disabled until launch)    │
└──────────────────────────────────────────────────────┘
```

### Behavior when switching chains

| Step | What happens |
|---|---|
| 1. User clicks toggle | Show chain options |
| 2. User selects other chain | Disconnect current wallet |
| 3. Privy reconnects | Prompt for correct wallet type (Phantom for Solana, MetaMask for EVM) |
| 4. Pool list refreshes | `GET /pools?chain=EVM` — only shows pools on selected chain |
| 5. Balance updates | Fetches USDC balance on new chain |
| 6. Deposit/Claim flows | Use correct adapter automatically (pool.chain determines adapter) |

### Frontend implementation

#### New: `useChainSelector` hook

```typescript
// apps/web/src/hooks/useChainSelector.ts
type Chain = 'SOLANA' | 'EVM';

function useChainSelector() {
  const [chain, setChain] = useState<Chain>(() => {
    return (localStorage.getItem('selectedChain') as Chain) || 'SOLANA';
  });

  const switchChain = (newChain: Chain) => {
    localStorage.setItem('selectedChain', newChain);
    setChain(newChain);
    // Privy handles wallet reconnection automatically
    // when walletChainType changes
  };

  return { chain, switchChain, isSolana: chain === 'SOLANA', isEvm: chain === 'EVM' };
}
```

#### Modified: `providers.tsx` — Privy config becomes dynamic

```typescript
// Current (hardcoded):
walletChainType: 'solana-only'

// New (dynamic):
walletChainType: chain === 'SOLANA' ? 'solana-only' : 'ethereum-only'
// Note: Privy also supports 'ethereum-and-solana' for showing both
```

#### Modified: `useWalletBridge.ts` — chain-aware

```typescript
// Returns different wallet types depending on selected chain
// Solana: PublicKey, sendTransaction via Solana adapter
// EVM: address (0x...), sendTransaction via ethers/viem
```

#### Modified: Pool fetching — filter by chain

```typescript
// Current:
GET /pools

// New:
GET /pools?chain=SOLANA   // or chain=EVM
```

#### New: `ChainSelector` component

```typescript
// apps/web/src/components/header/ChainSelector.tsx
// Renders dropdown in header
// Shows chain icon + name
// Disabled options for chains not yet active
// Persists selection in localStorage
```

### Why NOT a bridge

| Approach | Complexity | Risk | UX |
|---|---|---|---|
| **Bridge (cross-chain transfers)** | Extreme — custom relayers, validators, audits | High — bridges are #1 hack target in crypto | Complex — users must bridge, wait, pay fees |
| **Toggle (chain selector)** | Low — filter pools by chain, switch wallet | Low — each chain is independent | Simple — one click, instant switch |

A bridge would let users move USDC between Solana and Pacifica. But:
- Bridges are the **most exploited** component in crypto (~$2.5B stolen from bridges 2022-2024)
- Building one requires massive security investment
- Users can use Pacifica's own bridge (or Wormhole/Portal) if they need to move funds
- For UpDown, pools are **independent per chain** — no need to move funds between them
- Users simply deposit USDC on whichever chain they choose to play on

The toggle approach is strictly better: simpler, safer, and the UX is actually smoother.

---

## 7. Implementation Plan

### Phase 1 — Chain Adapter Abstraction

#### Step 1.0: Database migration

Add `Chain` enum + `chain` field to models that have on-chain state:

```prisma
enum Chain {
  SOLANA
  EVM
}

model Pool {
  // ... existing fields ...
  chain  Chain  @default(SOLANA)

  // Update index for chain-filtered queries:
  @@index([chain, asset, interval, status])  // replaces @@index([asset, interval, status])
  @@index([chain, poolType])                 // replaces @@index([poolType])
}

model Bet {
  // ... existing fields ...
  chain  Chain  @default(SOLANA)
}

model Tournament {
  // ... existing fields ...
  chain  Chain  @default(SOLANA)
}
```

All existing data auto-tagged as SOLANA via `@default(SOLANA)`.

**User identity decision: separate per chain (Option A)**

Each chain has independent users. A Solana wallet and an EVM wallet
are two different `User` records. XP, coins, streaks, and referrals
do NOT carry over between chains. No changes to the User model.

Rationale: avoids refactoring 30+ files that reference `walletAddress`.
Unified identity (linking Solana + EVM wallets via Privy ID) deferred to Phase 3.

**Models that do NOT need `chain` — and why:**

| Model | Reason |
|---|---|
| `User` | Phase 1: separate users per chain, no changes needed |
| `TournamentParticipant` | Inherits chain from its Tournament |
| `PriceSnapshot` | Price data, chain-agnostic |
| `SportsFixtureCache`, `LiveScore` | Sports data, no blockchain |
| `PoolCategory`, `EmissionConfig` | Configuration, shared across chains |
| `Squad`, `SquadMember`, `SquadMessage` | Social features, not on-chain |
| `Notification`, `RewardLog` | Keyed by walletAddress, which is already chain-specific |
| `Referral`, `ReferralEarning`, `ReferralPayout` | Keyed by wallet, chain-specific by nature |
| `EventLog`, `UptimeCheck` | Observability, chain-agnostic |

**Tx hash fields (no schema change, code awareness needed):**

Fields like `Bet.depositTx`, `Bet.claimTx`, `ReferralPayout.txSignature`,
`Tournament.prizeClaimedTx` are all `String?` — they accept both Solana
signatures (base58) and EVM tx hashes (0x hex). No type change needed,
but the routes that process them must use the correct chain adapter.

#### Step 1.1: Create `packages/chain-adapter/`

New package with chain-agnostic interface:

```
packages/chain-adapter/
  package.json
  tsconfig.json
  src/
    index.ts          # re-exports
    types.ts          # Side, PoolStatus, TxResult, InitPoolParams, etc.
    adapter.ts        # IChainAdapter interface
    solana/
      index.ts        # re-exports
      rpc.ts          # RpcConnectionManager (moved from utils/solana.ts)
      adapter.ts      # SolanaChainAdapter implements IChainAdapter
```

IChainAdapter interface:

```typescript
interface IChainAdapter {
  readonly chain: ChainType;

  // Pool lifecycle (server-signed by authority)
  initializePool(params: InitPoolParams): Promise<InitPoolResult>;
  resolvePool(poolUuid: string, strikePrice: bigint, finalPrice: bigint): Promise<TxResult>;
  resolvePoolWithWinner(poolUuid: string, winner: Side): Promise<TxResult>;
  closePool(poolUuid: string): Promise<TxResult>;
  refundBet(poolUuid: string, walletAddress: string): Promise<TxResult>;

  // Deposit flow
  getDepositInfo(poolUuid: string, walletAddress: string): Promise<DepositInfo>;
  verifyDeposit(txHash: string, poolUuid: string, walletAddress: string): Promise<DepositVerification>;

  // Claim flow
  buildClaimTransaction(poolUuid: string, walletAddress: string, feeBps: number): Promise<PreparedClaimTx>;
  verifyClaim(txHash: string, walletAddress: string): Promise<ClaimVerification>;

  // Queries
  getVaultBalance(poolUuid: string): Promise<bigint>;
  isPoolAccountClosed(poolUuid: string): Promise<boolean>;
  getTokenBalance(walletAddress: string): Promise<bigint>;

  // Tournament lifecycle (server-signed by authority)
  initializeTournament(params: InitTournamentParams): Promise<InitTournamentResult>;

  // Authority transfers (referral payouts, etc.)
  transferToken(to: string, amount: bigint): Promise<TxResult>;

  // Infrastructure
  reportRpcFailure(): void;
  getRpcStats(): RpcEndpointStats[];
}
```

#### Step 1.2: Implement SolanaChainAdapter

Move all Solana-specific server logic from:
- `apps/api/src/utils/solana.ts` → `chain-adapter/src/solana/rpc.ts`
- `apps/api/src/scheduler/onchain-tx.ts` → `chain-adapter/src/solana/adapter.ts`
- Chain-specific parts of `deposits.ts` and `claims.ts` → `chain-adapter/src/solana/adapter.ts`

Each method maps to existing code:

| Adapter method | Source |
|---|---|
| `initializePool()` | `pool-creator.ts:initializePoolOnChain()` |
| `resolvePool()` | `onchain-tx.ts:resolvePoolOnChain()` |
| `closePool()` | `onchain-tx.ts:closePoolOnChain()` |
| `refundBet()` | `onchain-tx.ts:refundBetOnChain()` |
| `getDepositInfo()` | `deposits.ts` lines 141-167 (PDA derivation) |
| `verifyDeposit()` | `deposits.ts` lines 283-382 (tx parsing) |
| `buildClaimTransaction()` | `claims.ts` lines 116-163 (build + authority sign) |
| `verifyClaim()` | `claims.ts` lines 276-300 (balance parsing) |
| `getVaultBalance()` | `pool-resolver.ts` lines 145-156 |
| `isPoolAccountClosed()` | `onchain-tx.ts` line 93-96 |
| `initializeTournament()` | `tournament.ts` lines 79-115 (PDA derivation + init tx) |
| `transferToken()` | `referrals.ts` lines 337-366 (authority SPL transfer) |

#### Step 1.3: Create adapter factory

`apps/api/src/chain.ts` — registry with lazy initialization:

```typescript
const adapters: Partial<Record<ChainType, IChainAdapter>> = {};

function getChainAdapter(chain: ChainType): IChainAdapter {
  if (!adapters[chain]) {
    switch (chain) {
      case 'SOLANA': adapters[chain] = new SolanaChainAdapter(); break;
      case 'EVM': throw new Error('EVM adapter not yet implemented');
    }
  }
  return adapters[chain]!;
}

function getActiveChains(): ChainType[] {
  return (process.env.ACTIVE_CHAINS || 'SOLANA').split(',') as ChainType[];
}
```

#### Step 1.4: Refactor scheduler

`resolver-types.ts`: Replace `Connection` + `Keypair` with `IChainAdapter`:
```typescript
interface ResolverDeps {
  prisma: PrismaClient;
  chain: IChainAdapter;    // was: connection + wallet
  priceProvider: PacificaProvider;
}
```

`onchain-tx.ts`: Becomes thin wrappers delegating to `deps.chain.*`

`pool-creator.ts`: Remove `initializePoolOnChain()`, call `deps.chain.initializePool()` directly

`pool-resolver.ts`: Replace PDA derivation + vault balance checks with adapter methods

`pool-scheduler.ts`: Create adapter via factory, pass to deps

`sports-scheduler.ts`: Same refactor as pool-creator/pool-resolver — replace
`getPoolPDA`, `buildInitializePoolIx`, `buildResolveWithWinnerIx`, `getConnection`,
`getAuthorityKeypair` with adapter methods. Heavy Solana usage (lines 167-325).

`orphan-recovery.ts`: Replace `PROGRAM_ID`, `buildResolveIx`, `buildResolveWithWinnerIx`,
`buildClosePoolIx`, `buildForceClosePoolIx`, `getConnection` with adapter methods.
Heavy Solana usage (lines 24-251). Add `forceClosePool()` to IChainAdapter if not covered.

`admin-actions.ts`: Replace `getConnection()` with adapter RPC method. Light (1 import).

#### Step 1.5: Refactor routes

`deposits.ts`: Replace PDA derivation + tx parsing with `adapter.getDepositInfo()` and `adapter.verifyDeposit()`

`claims.ts`: Replace instruction building + tx parsing with `adapter.buildClaimTransaction()` and `adapter.verifyClaim()`

`faucet.ts`: Keep as-is (Solana/devnet-only)

`tournament-actions.ts`: Heavy Solana usage via dynamic imports (lines 41-97, 202-263).
Replace `getTournamentPDA`, `getTournamentVaultPDA`, `getTournamentParticipantPDA`,
`buildRegisterParticipantIx`, `buildClaimTournamentPrizeIx`, `getAssociatedTokenAddress`,
`createTransferInstruction` with adapter methods. Add tournament claim/register to IChainAdapter.

`health.ts`: Replace `getConnection()` with adapter. Light (1 import, slot monitoring).

`admin/health.ts`: Replace dynamic `@solana/web3.js` import + `getConnection()` with adapter.
Light (RPC health + authority balance check).

`admin/finance.ts`: Replace `getAssociatedTokenAddress` + `getConnection()` + `getAuthorityKeypair()`
with `adapter.getTokenBalance()`. Light (authority ATA balance query).

#### Step 1.5b: Refactor services

`services/tournament.ts` (Solana imports):
- `Transaction` from `@solana/web3.js`
- `getTournamentPDA`, `getTournamentVaultPDA`, `buildInitializeTournamentIx` from `solana-client`
- `deriveTournamentSeed`, `getUsdcMint`, `getConnection`, `getAuthorityKeypair` from `utils/solana`

→ Replace with `adapter.initializeTournament()` (add to IChainAdapter)

`services/squad-pools.ts` (Solana imports):
- `PublicKey`, `Transaction` from `@solana/web3.js`
- `getPoolPDA`, `getVaultPDA`, `buildInitializePoolIx`, `buildResolveIx`, `buildClosePoolIx` from `solana-client`
- `getUsdcMint`, `getAuthorityKeypair`, `derivePoolSeed`, `getConnection`, `rotateConnection` from `utils/solana`

→ Replace with adapter methods: `initializePool()`, `resolvePool()`, `closePool()`,
`getDepositInfo()`, `verifyDeposit()` (already defined in IChainAdapter)

#### Step 1.5c: Refactor referrals

`referrals.ts` currently imports `@solana/web3.js`, `@solana/spl-token`, and
`utils/solana.ts` directly — all for `claimReferralPayout()` (lines 321-402).

**What changes:**

`claimReferralPayout(walletAddress)` → `claimReferralPayout(walletAddress, chain)`

```typescript
// Before (Solana-only):
const connection = getConnection();
const authority = getAuthorityKeypair();
const usdcMint = getUsdcMint();
const authorityAta = await getAssociatedTokenAddress(usdcMint, authority.publicKey);
const userAta = await getAssociatedTokenAddress(usdcMint, userPubkey);
const ix = createTransferInstruction(authorityAta, userAta, authority.publicKey, amount);
// ... build tx, sign, send ...

// After (chain-agnostic):
const adapter = getChainAdapter(chain);
const { txHash } = await adapter.transferToken(walletAddress, amount);
```

Removes all `@solana/*` imports from `referrals.ts`.

**Block cross-chain referrals:**

Add validation in `acceptReferral()` to prevent a Solana referral code
from being used by an EVM user (and vice versa):

```typescript
export async function acceptReferral(
  referredWallet: string,
  referralCode: string,
): Promise<{ success: boolean; error?: string }> {
  const referrer = await prisma.user.findFirst({
    where: { referralCode: referralCode },
    select: { walletAddress: true },
  });

  if (!referrer) return { success: false, error: 'Invalid referral code' };

  // Block cross-chain referrals
  const referrerIsEvm = referrer.walletAddress.startsWith('0x');
  const referredIsEvm = referredWallet.startsWith('0x');
  if (referrerIsEvm !== referredIsEvm) {
    return { success: false, error: 'Cross-chain referrals not supported' };
  }

  // ... rest unchanged ...
}
```

**Why this matters:** Without this check, `recordReferralCommissions` (called at
pool resolution) would credit earnings to a wallet on a different chain. The
referrer would then try to claim on their chain, paying out from commissions
earned on the other chain — resulting in an accounting mismatch.

`recordReferralCommissions`: No changes needed. Called from `resolvePool` which
is already chain-specific. With cross-chain referrals blocked, `user.referredBy`
always points to a same-chain wallet.

#### Step 1.6: Frontend — chain toggle + chain-aware hooks

**New files:**
1. `useChainSelector` hook (returns `'SOLANA'` only for now, Pacifica as "coming soon")
2. `ChainSelector` component in header

**Files that need refactoring (all have `@solana` imports):**

| File | Solana imports | What changes |
|---|---|---|
| `providers.tsx` | `Connection`, `clusterApiUrl`, `toSolanaWalletConnectors`, Privy `walletChainType: 'solana-only'` | Dynamic chain config: `walletChainType` based on selected chain, add EVM cluster config |
| `useWalletBridge.ts` | `Transaction`, `PublicKey`, `bs58`, Privy Solana adapters | Return chain-appropriate wallet (Solana PublicKey vs EVM address) |
| `useTransactions.ts` | `Transaction`, `PublicKey`, `Connection`, `buildDepositIx` | Use chain adapter for tx building, chain-aware confirmation |
| `useUsdcBalance.ts` | `PublicKey`, `getAssociatedTokenAddress` | Solana: ATA lookup, EVM: `balanceOf()` — abstract behind chain check |
| `useTournamentRegister.ts` | `Transaction`, `PublicKey`, `createTransferInstruction`, `buildRegisterParticipantIx` | Use chain adapter for tournament registration tx |
| `useSquads.ts` | Dynamic `import('@solana/web3.js')` at line 202 | Use chain adapter for squad pool operations |
| `constants.ts` | `USDC_MINT_ADDRESS`, `EXPLORER_URL = 'https://explorer.solana.com'`, `SOLANA_CLUSTER = 'devnet'` | Make chain-dependent: different USDC address, explorer URL, and cluster per chain |
| `lib/format.ts` | `getExplorerTxUrl()` uses `SOLANA_CLUSTER` to build explorer links (line 58) | Make chain-aware: accept chain param or read from context. All components using this helper auto-fix |
| `TournamentPrizes.tsx` | Hardcodes `explorer.solana.com` (lines 139, 190) — bypasses `getExplorerTxUrl()` | Switch to `getExplorerTxUrl()` helper |
| `TournamentHeader.tsx` | Hardcodes `explorer.solana.com` (line 122) — bypasses helper | Switch to `getExplorerTxUrl()` helper |
| `FinancialOverview.tsx` | Hardcodes `explorer.solana.com` (line 188) — bypasses helper | Switch to `getExplorerTxUrl()` helper |
| `components/profile/BetRow.tsx` | Uses `getExplorerTxUrl()` | Auto-fixed when format.ts updated |
| `components/referral/PayoutsTab.tsx` | Uses `getExplorerTxUrl()` | Auto-fixed when format.ts updated |
| `components/TransactionModal.tsx` | Uses `getExplorerTxUrl()` | Auto-fixed when format.ts updated |
| `components/BetCard.tsx` | Uses `getExplorerTxUrl()` | Auto-fixed when format.ts updated |
| `EarningsTab.tsx` | Tooltip "Solana Explorer" (line 62) + uses `getExplorerTxUrl()` | Chain-aware tooltip text, explorer auto-fixed |
| `PoolsBetTable.tsx` | Tooltip "Solana Explorer" (line 17) | Chain-aware tooltip text |
| `ProfileHeader.tsx` | Tooltip "USDC balance on Solana" (line 241) | Chain-aware tooltip text |
| `docs/page.tsx` | 8+ hardcoded "Solana" in docs copy (lines 388, 392, 751, 757, 868, 875, 892) | Dynamic chain name or generic ("on-chain") |
| `privacy/page.tsx` | 6+ hardcoded "Solana" in legal copy (lines 48, 51, 54, 100, 101, 117) | Dynamic chain name or generic |
| `faucet/page.tsx` | "Solana devnet/wallet/Explorer" (lines 63, 75, 153, 198) | Keep devnet-only but use chain-aware text where applicable |

Full frontend multi-chain activation in Phase 3 when Pacifica provides chain details.
Privy already supports custom EVM chains via `additionalChains`.

#### Step 1.7: Update config & env files

| File | Change |
|---|---|
| `apps/api/.env.example` | Add `EVM_RPC_URL`, `EVM_CHAIN_ID`, `EVM_AUTHORITY_PRIVATE_KEY`, `EVM_CONTRACT_ADDRESS`, `ACTIVE_CHAINS` |
| `apps/web/.env.example` | Add `NEXT_PUBLIC_EVM_RPC_URL`, `NEXT_PUBLIC_EVM_CHAIN_ID`, `NEXT_PUBLIC_EVM_CONTRACT_ADDRESS` |
| `apps/web/next.config.js` | Add `chain-adapter` to `transpilePackages` (currently only `['shared', 'solana-client']`) |
| Root `package.json` | Add EVM build/deploy scripts alongside existing Anchor scripts |

#### Step 1.8: Delete `apps/api/src/utils/solana.ts`

Fully replaced by `chain-adapter/src/solana/rpc.ts`.

#### Files that stay Solana-only (no migration needed)

| File | Reason |
|---|---|
| `routes/faucet.ts` | Devnet-only tool — mints test USDC + SOL |
| `scripts/mint-usdc.mjs` | Devnet utility script |
| `tests/parimutuel_pools.ts` | Anchor program integration tests (Solana program stays) |
| `routes/transactions.test.ts` | Mocks `@solana/web3.js` — update mocks when adapter lands |
| `packages/solana-client/` | Solana-specific SDK — stays as dependency of `SolanaChainAdapter` |
| `Anchor.toml` | Solana program config — stays |
| `programs/parimutuel_pools/` | Rust smart contract — stays |

---

### Phase 2 — Solidity Smart Contract

#### Step 2.1: Project setup with Foundry

```
contracts/
  foundry.toml
  src/
    ParimutuelPool.sol
    interfaces/IERC20.sol
  test/
    ParimutuelPool.t.sol
  script/
    Deploy.s.sol
```

#### Step 2.2: `ParimutuelPool.sol` (~250 lines)

Translates Anchor instructions to Solidity:

| Anchor instruction | Solidity function | Key difference |
|---|---|---|
| `initialize_pool` | `initializePool(bytes32, ...)` | No PDA — poolId is mapping key |
| `deposit` | `deposit(bytes32, Side, uint256)` | USDC.transferFrom() + approve |
| `resolve` | `resolve(bytes32, uint256, uint256)` | Same logic |
| `resolve_with_winner` | `resolveWithWinner(bytes32, Side)` | Same logic |
| `claim` | `claim(bytes32, uint16, bytes)` | EIP-712 authority signature verification |
| `refund` | `refund(bytes32, address)` | Authority-only, direct transfer |
| `close_pool` | `closePool(bytes32)` | delete for gas refund |
| `initialize_tournament` | `initializeTournament(bytes32, ...)` | mapping key, not PDA |
| `register_participant` | `registerParticipant(bytes32)` | USDC.transferFrom() for entry fee |
| `claim_tournament_prize` | `claimTournamentPrize(bytes32)` | Similar to pool claim |
| `cancel_tournament` | `cancelTournament(bytes32)` | Authority-only |
| `refund_participant` | `refundParticipant(bytes32, address)` | Authority-only |
| `close_tournament` | `closeTournament(bytes32)` | delete for gas refund |

Key design decisions:
- Contract IS the vault (holds all USDC) — no separate vault accounts
- Pools stored in `mapping(bytes32 => Pool)` — no PDAs
- Claim fee enforcement via ECDSA signature: authority signs `(poolId, user, feeBps)`, contract verifies
- Events match Anchor events for consistent backend parsing

#### Step 2.3: Tests (~200 lines)

10 test cases covering all operations + edge cases (same side deposit, double claim rejection, etc.)

#### Step 2.4: Deploy to Sepolia

Test deployment on Ethereum Sepolia. Redeploy to Pacifica when they launch testnet.

---

## 8. File Change Summary

### New files

| File | Lines | Description |
|---|---|---|
| `packages/chain-adapter/package.json` | 20 | Package config |
| `packages/chain-adapter/tsconfig.json` | 15 | TS config |
| `packages/chain-adapter/src/index.ts` | 5 | Re-exports |
| `packages/chain-adapter/src/types.ts` | 60 | Chain-agnostic types |
| `packages/chain-adapter/src/adapter.ts` | 80 | IChainAdapter interface |
| `packages/chain-adapter/src/solana/index.ts` | 5 | Re-exports |
| `packages/chain-adapter/src/solana/rpc.ts` | 120 | RPC management (from utils/solana.ts) |
| `packages/chain-adapter/src/solana/adapter.ts` | 280 | SolanaChainAdapter |
| `apps/api/src/chain.ts` | 30 | Adapter factory |
| `apps/web/src/hooks/useChainSelector.ts` | 30 | Chain toggle hook |
| `apps/web/src/components/header/ChainSelector.tsx` | 80 | Chain selector dropdown |
| `contracts/src/ParimutuelPool.sol` | 350 | Solidity smart contract (pools + tournaments) |
| `contracts/src/interfaces/IERC20.sol` | 15 | ERC-20 interface |
| `contracts/test/ParimutuelPool.t.sol` | 200 | Forge tests |
| `contracts/script/Deploy.s.sol` | 30 | Deploy script |
| `contracts/foundry.toml` | 15 | Foundry config |

### Modified files — Backend (21 files)

| File | Change | Impact |
|---|---|---|
| `apps/api/prisma/schema.prisma` | Add Chain enum + chain field on Pool, Bet, Tournament + updated indexes | ~20 lines added |
| **Routes** | | |
| `apps/api/src/routes/deposits.ts` | Remove Solana imports, use adapter | 473→~280 lines |
| `apps/api/src/routes/claims.ts` | Remove Solana imports, use adapter | 367→~220 lines |
| `apps/api/src/routes/pools.ts` | Add `?chain=` filter param | ~5 lines |
| `apps/api/src/routes/tournament-actions.ts` | Remove dynamic `@solana/*` imports, use adapter for registration + prize claiming | ~60 lines changed |
| `apps/api/src/routes/health.ts` | Replace `getConnection()` with adapter RPC status | ~5 lines |
| `apps/api/src/routes/admin/health.ts` | Replace dynamic `@solana/web3.js` import with adapter balance/status | ~10 lines |
| `apps/api/src/routes/admin/finance.ts` | Replace `getAssociatedTokenAddress` with `adapter.getTokenBalance()` | ~10 lines |
| **Services** | | |
| `apps/api/src/services/tournament.ts` | Remove `@solana/*` imports, use `adapter.initializeTournament()` | ~20 lines changed |
| `apps/api/src/services/squad-pools.ts` | Remove `@solana/*` imports, use adapter for pool init/resolve/close | ~80 lines changed |
| `apps/api/src/services/referrals.ts` | Remove `@solana/*` imports, use `adapter.transferToken()` + block cross-chain | 403→~340 lines |
| **Scheduler** | | |
| `apps/api/src/scheduler/resolver-types.ts` | ResolverDeps uses IChainAdapter | 39→~25 lines |
| `apps/api/src/scheduler/onchain-tx.ts` | Thin wrappers to adapter | 216→~80 lines |
| `apps/api/src/scheduler/pool-creator.ts` | Uses `adapter.initializePool()` | 297→~220 lines |
| `apps/api/src/scheduler/pool-resolver.ts` | Uses adapter for vault queries | 322→~260 lines |
| `apps/api/src/scheduler/pool-scheduler.ts` | Creates adapter via factory, loops chains | ~15 lines changed |
| `apps/api/src/scheduler/sports-scheduler.ts` | Remove Solana imports, use adapter for pool init + resolve | ~40 lines changed |
| `apps/api/src/scheduler/orphan-recovery.ts` | Remove Solana imports, use adapter for resolve/close/force-close | ~50 lines changed |
| `apps/api/src/scheduler/admin-actions.ts` | Replace `getConnection()` with adapter | ~5 lines |
| **Config** | | |
| `apps/api/package.json` | Add chain-adapter dep | 1 line |
| `apps/api/.env.example` | Add EVM env vars (`EVM_RPC_URL`, `EVM_CHAIN_ID`, `EVM_AUTHORITY_PRIVATE_KEY`, `ACTIVE_CHAINS`) | ~5 lines |

### Modified files — Frontend (14 files)

| File | Change | Impact |
|---|---|---|
| `apps/web/src/app/providers.tsx` | Dynamic Privy `walletChainType`, chain-aware cluster config | ~30 lines changed |
| `apps/web/src/hooks/useWalletBridge.ts` | Chain-aware wallet selection (Solana vs EVM) | ~30 lines changed |
| `apps/web/src/hooks/useTransactions.ts` | Use chain adapter for tx building + confirmation | ~30 lines changed |
| `apps/web/src/hooks/useUsdcBalance.ts` | Solana ATA vs EVM `balanceOf()` | ~15 lines changed |
| `apps/web/src/hooks/useTournamentRegister.ts` | Use chain adapter for tournament registration tx | ~30 lines changed |
| `apps/web/src/hooks/useSquads.ts` | Replace dynamic `@solana/web3.js` import with adapter | ~10 lines changed |
| `apps/web/src/lib/constants.ts` | Chain-dependent USDC address, explorer URL, cluster | ~15 lines changed |
| `apps/web/src/components/profile/TournamentPrizes.tsx` | Use chain-aware explorer URL (2 hardcoded links) | ~5 lines |
| `apps/web/src/components/tournament/TournamentHeader.tsx` | Hardcoded `explorer.solana.com` link (line 122) | ~3 lines |
| `apps/web/src/app/admin/components/FinancialOverview.tsx` | Hardcoded `explorer.solana.com` link (line 188) | ~3 lines |
| `apps/web/src/components/referral/EarningsTab.tsx` | Tooltip text: "Solana Explorer" (line 62) | ~3 lines |
| `apps/web/src/components/profile/PoolsBetTable.tsx` | Tooltip text: "Solana Explorer" (line 17) | ~3 lines |
| `apps/web/src/components/profile/ProfileHeader.tsx` | Tooltip text: "USDC balance on Solana" (line 241) | ~3 lines |
| `apps/web/src/app/docs/page.tsx` | 8+ hardcoded "Solana" references in docs copy | ~15 lines |
| `apps/web/src/app/privacy/page.tsx` | 6+ hardcoded "Solana" references in legal copy | ~10 lines |
| `apps/web/src/app/faucet/page.tsx` | "Solana devnet", "Solana wallet", "Solana Explorer" (stays devnet-only but text should be chain-aware) | ~10 lines |
| `apps/web/src/components/header/` | Add ChainSelector to header layout | ~5 lines |

### Modified files — Config (4 files)

| File | Change | Impact |
|---|---|---|
| `pnpm-workspace.yaml` | Add `packages/chain-adapter` | 1 line |
| `apps/web/next.config.js` | Add `chain-adapter` to `transpilePackages` | 1 line |
| `apps/web/.env.example` | Add EVM env vars | ~3 lines |
| `Dockerfile` | Add EVM build ARGs alongside `NEXT_PUBLIC_SOLANA_RPC_URL`, `NEXT_PUBLIC_SOLANA_NETWORK`, `NEXT_PUBLIC_PROGRAM_ID` | ~6 lines |

### Deleted files

| File | Reason |
|---|---|
| `apps/api/src/utils/solana.ts` | Moved to `chain-adapter/src/solana/rpc.ts` |

### Files that stay Solana-only (NO migration)

| File | Reason |
|---|---|
| `apps/api/src/routes/faucet.ts` | Devnet-only tool — mints test USDC + SOL |
| `scripts/mint-usdc.mjs` | Devnet utility script |
| `apps/api/scripts/create-pool.ts` | Dev script for manual pool creation |
| `tests/parimutuel_pools.ts` | Anchor program integration tests |
| `apps/api/src/routes/transactions.test.ts` | Update mocks when adapter lands |
| `packages/solana-client/` | Stays — used internally by `SolanaChainAdapter` |
| `Anchor.toml` | Solana program deployment config |
| `programs/parimutuel_pools/` | Rust smart contract — stays |

### Chain-agnostic files (NO changes needed)

| File | Why no change |
|---|---|
| `apps/api/src/services/rewards.ts` | Pure DB + WebSocket — XP, coins, levels, streaks. Zero Solana imports |
| `apps/api/src/services/notifications.ts` | Pure DB + WebSocket |
| `apps/api/src/services/squads.ts` | Social features, no on-chain code |
| `apps/api/src/utils/levels.ts` | XP/level math |
| `apps/api/src/utils/coins.ts` | Coin emission math |
| `apps/api/src/scheduler/resolve-logic.ts` | Business logic only — calls `onchain-tx` which calls adapter |
| All Prisma models without `chain` | See Step 1.0 for full analysis |

---

## 9. Execution Order

| # | Task | Depends on | Effort |
|---|---|---|---|
| 0 | Prisma migration: add chain column to Pool, Bet, Tournament | — | 15 min |
| 1 | Create `packages/chain-adapter/` types + interface | — | 30 min |
| 2 | Implement SolanaChainAdapter (pool + tournament + transfer methods) | 1 | 3-4 hrs |
| 3 | Create adapter factory (`chain.ts`) | 2 | 15 min |
| **Scheduler refactor** | | |
| 4 | Refactor `resolver-types.ts` + `onchain-tx.ts` | 2, 3 | 30 min |
| 5 | Refactor `pool-creator.ts` | 2, 3 | 30 min |
| 6 | Refactor `pool-resolver.ts` | 2-4 | 30 min |
| 7 | Refactor `pool-scheduler.ts` (loop over active chains) | 2-6 | 15 min |
| 8 | Refactor `sports-scheduler.ts` | 2, 3 | 30 min |
| 9 | Refactor `orphan-recovery.ts` | 2, 3 | 45 min |
| 10 | Refactor `admin-actions.ts` | 2, 3 | 10 min |
| **Route refactor** | | |
| 11 | Refactor `deposits.ts` | 2, 3 | 1 hr |
| 12 | Refactor `claims.ts` | 2, 3 | 1 hr |
| 13 | Refactor `tournament-actions.ts` | 2, 3 | 45 min |
| 14 | Refactor `health.ts` + `admin/health.ts` + `admin/finance.ts` | 2, 3 | 30 min |
| 15 | Add `?chain=` filter to `pools.ts` | 0 | 15 min |
| **Service refactor** | | |
| 16 | Refactor `tournament.ts` | 2, 3 | 30 min |
| 17 | Refactor `squad-pools.ts` | 2, 3 | 1 hr |
| 18 | Refactor `referrals.ts`: adapter + block cross-chain | 2, 3 | 45 min |
| **Frontend** | | |
| 19 | `useChainSelector` hook + `ChainSelector` component | — | 1 hr |
| 20 | Refactor `providers.tsx` (dynamic Privy config) | 19 | 30 min |
| 21 | Refactor `useWalletBridge.ts` + `useTransactions.ts` | 19 | 1.5 hr |
| 22 | Refactor `useUsdcBalance.ts` + `useTournamentRegister.ts` + `useSquads.ts` | 19 | 1 hr |
| 23 | Refactor `constants.ts` + `format.ts`: chain-aware `getExplorerTxUrl(sig, chain)` + USDC address | 19 | 30 min |
| 24 | Replace 3 hardcoded explorer URLs → use `getExplorerTxUrl()` (TournamentPrizes, TournamentHeader, FinancialOverview) + update tooltip text (EarningsTab, PoolsBetTable, ProfileHeader). 4 files using helper (BetRow, PayoutsTab, TransactionModal, BetCard) auto-fixed. | 23 | 45 min |
| 25 | Update docs/privacy/faucet page copy: "Solana" → chain-aware | 19 | 30 min |
| **Finalize** | | |
| 26 | Update config: `.env.example` files, `next.config.js`, `package.json` | 1 | 15 min |
| 27 | Delete `utils/solana.ts` | 2-18 | 1 min |
| 28 | Update `transactions.test.ts` mocks | 2-18 | 15 min |
| 29 | Build + full verify | 0-28 | 30 min |
| **Phase 2 (parallel)** | | |
| 30 | Write `ParimutuelPool.sol` (pools + tournaments) | — | 3-4 hrs |
| 31 | Write Forge tests | 30 | 1-2 hrs |
| 32 | Deploy to Sepolia | 30, 31 | 30 min |

**Total Phase 1: ~20-24 hours** (29 tasks)
**Total Phase 2: ~5-7 hours** (parallel)

---

## 10. Verification

### Phase 1 — exhaustive Solana isolation check

```bash
# Backend: ZERO @solana imports outside faucet.ts and solana-client package
grep -r "@solana" apps/api/src/routes/    # only faucet.ts
grep -r "@solana" apps/api/src/scheduler/ # 0 matches
grep -r "@solana" apps/api/src/services/  # 0 matches
grep -r "utils/solana" apps/api/src/      # 0 matches (file deleted)

# Frontend: ZERO @solana imports outside packages/solana-client
grep -r "@solana" apps/web/src/           # 0 matches
grep -r "solana-client" apps/web/src/     # 0 matches (uses chain adapter)

# Only these should still have @solana:
# - packages/solana-client/ (Solana SDK, used by SolanaChainAdapter)
# - apps/api/src/routes/faucet.ts (devnet-only)
# - apps/api/scripts/ (dev scripts)
# - tests/ (Anchor program tests)
# - scripts/ (devnet utilities)
```

### Phase 1 — functional tests

1. `pnpm build` — all packages compile, no type errors
2. Start API locally — pools create, resolve, close as before
3. Frontend deposit, claim, refund flows unchanged
4. Tournament creation + registration + prize claim works
5. Squad pool creation + resolve works
6. Referral payout flow works
7. Cross-chain referral code rejected with error
8. Orphan recovery runs successfully
9. Sports scheduler creates and resolves sports pools
10. Admin health/finance endpoints return correct data
11. Scheduler runs 5 min — full pool lifecycle works
12. Chain selector visible in header, shows "Solana" active
13. `GET /pools?chain=SOLANA` returns all existing pools
14. Explorer links point to correct chain explorer

### Phase 2

1. `forge build` — contract compiles
2. `forge test` — all tests pass
3. Deploy to Sepolia — verify with `cast` commands
4. Manual test: init pool → deposit → resolve → claim

---

## 11. Complete Solana Audit — 47 files inventoried

> Exhaustive scan performed 2026-03-30. Every file with Solana-specific code accounted for.

| Category | Files | Migration action |
|---|---|---|
| Backend routes | 8 | 7 refactored → adapter, 1 stays (faucet) |
| Backend services | 3 | All refactored → adapter |
| Backend scheduler | 8 | All refactored → adapter |
| Backend utils | 1 | Deleted (moved to chain-adapter) |
| Frontend hooks | 5 | All refactored → chain-aware |
| Frontend components | 10 | Explorer URLs + tooltip text (3 hardcoded, 4 via helper, 3 tooltips) |
| Frontend lib | 1 | `format.ts` — `getExplorerTxUrl()` chain-aware |
| Frontend pages | 3 | docs, privacy, faucet — hardcoded "Solana" text |
| Frontend config | 2 | Chain-dependent constants + Privy config |
| Solana client package | 3+1 | Stays — used by SolanaChainAdapter |
| Tests | 2 | Anchor tests stay, API test mocks updated |
| Scripts | 2 | Stay (devnet utilities) |
| Config/env | 6 | Add EVM vars alongside Solana vars |
| Docs | 2 | Update to reflect multi-chain |
| Dockerfile | 1 | Add EVM build ARGs |
| **Total** | **62** | **48 modified, 1 deleted, 13 stay as-is** |

---

## 12. Future Work (Phase 3 — when Pacifica launches)

1. Implement `EvmChainAdapter` with Pacifica's chain ID, RPC, and contract address
2. Frontend: enable Pacifica option in `ChainSelector` (remove "coming soon")
3. Update Privy config to support `'ethereum-and-solana'` mode
4. Deploy `ParimutuelPool.sol` to Pacifica testnet
5. Set `ACTIVE_CHAINS=SOLANA,EVM` to run both chains
6. If Pacifica works well, optionally make it the default chain
7. Consider using Pacifica's native bridge for cross-chain USDC if users request it
8. Optional: unified user identity via Privy ID (link Solana + EVM wallets, merge XP/rewards)
