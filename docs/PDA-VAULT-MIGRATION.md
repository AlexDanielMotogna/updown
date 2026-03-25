# PDA Vault Migration: Trustless Tournaments + Referrals

## Context
Currently 3 money flows bypass on-chain vaults and go directly through authority's personal wallet:
1. **Tournament entry fees** → User ATA → Authority ATA (no escrow)
2. **Tournament prizes** → Authority ATA → Winner ATA (custodial)
3. **Referral payouts** → Authority ATA → Referrer ATA (custodial)

This creates custodial risk: if authority wallet is compromised or runs out of USDC, tournaments can't pay. Pools already work correctly with PDA vaults — we replicate that pattern for tournaments.

## Why we can't reuse pool instructions directly
Pool claim formula: `(user_bet.amount * total_pool) / total_winning_side` — proportional to bet size. Tournaments need winner-take-all: one person gets the entire prize pool. If all participants bet on the same "side", each would only get back their entry_fee. The payout model is fundamentally different, so we need tournament-specific instructions — but they follow the exact same vault/PDA/CPI patterns.

## What IS reused (80% of code)

| Existing code | Reused for |
|---|---|
| `useTransactions.ts:useClaim` (co-sign pattern) | Tournament prize claim flow |
| `confirmTransactionWithRetry()` | All tournament tx confirmations |
| `claim.rs` vault→user CPI pattern | `claim_tournament_prize` vault transfer |
| `deposit.rs` user→vault CPI pattern | `register_participant` entry_fee transfer |
| `refund.rs` authority-signed refund | `refund_participant` on cancel |
| `close_pool.rs` vault+PDA cleanup | `close_tournament` |
| `autoRefundBets()` retry logic | Tournament cancellation auto-refund |
| `derivePoolSeed()` SHA-256 pattern | `deriveTournamentSeed()` |
| `getConnection()`, `getAuthorityKeypair()`, `getUsdcMint()` | All tournament on-chain ops |
| `calculatePayout()` fee logic | Tournament fee calculation |
| `emitTournamentMatchResult()` WebSocket | Already exists for tournaments |
| Prisma Tournament/TournamentParticipant models | Extended with `onChainPda` fields |
| Admin force-resolve/refund/close patterns | Tournament admin actions |

---

## Phase 1: Tournament Vaults (Anchor Program)

### New state structs in `programs/parimutuel_pools/src/state.rs`

```
Tournament {
  tournament_id: [u8; 32],  authority, usdc_mint, vault: Pubkey,
  entry_fee: u64, max_participants: u16, participant_count: u16,
  prize_pool: u64, status: TournamentStatus, winner: Option<Pubkey>,
  bump, vault_bump
}

TournamentParticipant {
  tournament: Pubkey, user: Pubkey,
  refunded: bool, claimed: bool, bump
}
```

PDA seeds:
- Tournament: `[b"tournament", tournament_id]`
- Vault: `[b"tournament_vault", tournament_id]` (token account, authority = tournament PDA)
- Participant: `[b"participant", tournament.key(), user.key()]`

### 6 new instructions

| Instruction | What | Signer(s) | Mirrors |
|---|---|---|---|
| `initialize_tournament` | Create tournament PDA + vault token account | authority | `initialize_pool` |
| `register_participant` | User deposits entry_fee → vault. Creates Participant PDA | user | `deposit` |
| `claim_tournament_prize` | Winner claims from vault (5% fee on-chain) | user + authority | `claim` |
| `cancel_tournament` | Set status = Cancelled | authority | — |
| `refund_participant` | Refund entry_fee from vault → user (cancelled tournaments) | authority | `refund` |
| `close_tournament` | Close vault + tournament PDA, reclaim rent | authority | `close_pool` |

Key patterns (same as pools):
- Tournament PDA signs for all vault operations via `CpiContext::new_with_signer`
- `init` (not `init_if_needed`) on participant PDA prevents double-registration at Anchor level
- User + authority co-sign claims (prevents fee manipulation)
- 5% fee enforced on-chain (`TOURNAMENT_FEE_BPS = 500`)

### New errors in `errors.rs`
`TournamentNotRegistering`, `TournamentFull`, `TournamentNotCompleted`, `TournamentNotWinner`, `TournamentAlreadyClaimed`, `TournamentNotCancelled`, `TournamentAlreadyRefunded`, `TournamentVaultNotEmpty`, `AlreadyRegistered`

### New events in `events.rs`
`TournamentCreated`, `ParticipantRegistered`, `TournamentPrizeClaimed`, `TournamentCancelled`, `ParticipantRefunded`, `TournamentClosed`

---

## Phase 2: solana-client Package

### PDA derivations in `packages/solana-client/src/accounts/index.ts`
- `getTournamentPDA(tournamentId)` → `[b"tournament", id]`
- `getTournamentVaultPDA(tournamentId)` → `[b"tournament_vault", id]`
- `getTournamentParticipantPDA(tournament, user)` → `[b"participant", tournament, user]`

### 6 instruction builders in `packages/solana-client/src/instructions/index.ts`
- `buildInitializeTournamentIx(tournament, vault, usdcMint, authority, id, entryFee, maxParticipants)`
- `buildRegisterParticipantIx(tournament, participant, vault, userTokenAccount, user)`
- `buildClaimTournamentPrizeIx(tournament, participant, vault, userTokenAccount, user, authority, feeWallet)`
- `buildCancelTournamentIx(tournament, authority)`
- `buildRefundParticipantIx(tournament, participant, vault, userTokenAccount, user, authority)`
- `buildCloseTournamentIx(tournament, vault, authority)`

Discriminators computed via `SHA256("global:<name>")[0..8]`.

---

## Phase 3: Backend API Changes

### `apps/api/src/utils/solana.ts`
Add `deriveTournamentSeed(uuid)` — SHA-256 with `tournament:` prefix to avoid seed collision with pools.

### `apps/api/prisma/schema.prisma`
Add to Tournament model:
```
onChainPda    String?  @map("on_chain_pda")
onChainVault  String?  @map("on_chain_vault")
```
Nullable for backward compat with existing tournaments.

### `apps/api/src/services/tournament.ts` — `createTournament`
After DB insert, call `buildInitializeTournamentIx` to create on-chain PDA + vault. Store PDA in `onChainPda` field.

### `apps/api/src/routes/tournament-actions.ts`

**`POST /:id/prepare-register`** (changed):
- Return tournament PDA, vault PDA, participant PDA addresses
- No longer return authority ATA
- Frontend builds `register_participant` instruction (not raw transfer)

**`POST /:id/register`** (changed):
- Verify tx calls `register_participant` on correct program
- Verify participant PDA was created on-chain
- DB: create TournamentParticipant, increment prizePool

**`POST /:id/claim-prize`** (changed):
- Build `claim_tournament_prize` instruction
- Authority pre-signs, return partially-signed tx
- User co-signs and sends (same pattern as pool claims)
- New `POST /:id/confirm-claim` to verify and record

### `apps/api/src/services/tournament.ts` — `cancelTournament`
After DB update, send `cancel_tournament` on-chain. Then auto-refund all participants via `refund_participant` instruction (retry logic from `onchain-tx.ts`).

---

## Phase 4: Frontend Changes

### `apps/web/src/hooks/useTournamentRegister.ts`
Replace `createTransferInstruction(userATA → authorityATA)` with `buildRegisterParticipantIx(tournament, participant, vault, userATA, user)`.

### `apps/web/src/hooks/useTournamentClaim.ts` (NEW, reuses `useTransactions.ts` pattern)
Reuse the co-sign pattern from `useTransactions.ts:useClaim` (lines 204-294):
1. Call `POST /claim-prize` → get partially-signed tx (reuse `confirmTransactionWithRetry`)
2. `Transaction.from(Buffer.from(base64))` → user co-signs via `wallet.sendTransaction`
3. Call `POST /confirm-claim` with tx signature
4. Status state machine: `idle → preparing → signing → confirming → success` (same as pool claims)

---

## Migration: Existing Tournaments

| Status | Action |
|---|---|
| COMPLETED + claimed | No action needed |
| COMPLETED + unclaimed | Legacy claim via old flow (check `onChainPda IS NULL`) |
| REGISTERING / ACTIVE | Complete using old flow |
| New tournaments | Use PDA vault flow (`onChainPda IS NOT NULL`) |

---

## Phase 5: Referral Payouts (secondary)

Referral commissions are funded from platform fees (pool claim `fee_wallet`). The `fee_wallet` IS the authority's ATA, which also receives pool fees on-chain. So the fund SOURCE is already on-chain revenue, not personal funds.

**Recommended:** Keep as-is for now (Option A). The authority's ATA accumulates fees from pool claims. Referral payouts draw from these earned fees. This is acceptable since the authority already must be trusted for pool resolution.

**Future (Option B):** Add a `FeeVault` PDA, modify pool `claim` to send fees there, add `claim_referral` instruction. Defer to later phase.

---

## Files to create/modify

| File | Action |
|------|--------|
| `programs/.../state.rs` | Add Tournament, TournamentParticipant, TournamentStatus |
| `programs/.../errors.rs` | Add 9 tournament errors |
| `programs/.../events.rs` | Add 6 tournament events |
| `programs/.../instructions/initialize_tournament.rs` | **NEW** |
| `programs/.../instructions/register_participant.rs` | **NEW** |
| `programs/.../instructions/claim_tournament_prize.rs` | **NEW** |
| `programs/.../instructions/cancel_tournament.rs` | **NEW** |
| `programs/.../instructions/refund_participant.rs` | **NEW** |
| `programs/.../instructions/close_tournament.rs` | **NEW** |
| `programs/.../instructions/mod.rs` | Register 6 new modules |
| `programs/.../lib.rs` | Add 6 instruction dispatchers |
| `packages/solana-client/src/accounts/index.ts` | Add 3 PDA derivers |
| `packages/solana-client/src/instructions/index.ts` | Add 6 instruction builders |
| `apps/api/prisma/schema.prisma` | Add onChainPda, onChainVault to Tournament |
| `apps/api/src/utils/solana.ts` | Add deriveTournamentSeed |
| `apps/api/src/services/tournament.ts` | On-chain init + cancel |
| `apps/api/src/routes/tournament-actions.ts` | Rewrite register + claim to use program |
| `apps/web/src/hooks/useTournamentRegister.ts` | Use program instruction |
| `apps/web/src/hooks/useTournamentClaim.ts` | **NEW** — co-sign claim pattern |

## Build & Deploy
1. `anchor build` + `anchor test`
2. `anchor deploy --provider.cluster devnet`
3. Update solana-client builders
4. Deploy API behind feature flag
5. Test end-to-end on devnet
6. Enable for new tournaments

## Verification
1. Create tournament → verify Tournament PDA + vault on-chain via `solana account`
2. Register → verify entry_fee in vault balance, Participant PDA exists
3. Complete tournament → claim prize → verify vault balance decreases, fee goes to fee_wallet
4. Cancel tournament → verify all participants refunded from vault
5. Close tournament → verify PDA + vault closed, rent reclaimed
