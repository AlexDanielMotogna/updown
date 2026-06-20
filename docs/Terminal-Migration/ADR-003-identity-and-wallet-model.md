# ADR-003 — Identity & Wallet Model (one identity, many wallets, two chains)

- **Status:** Proposed
- **Scope:** How a user logs in and how we model their wallets when the product spans **two
  chains** — Solana (UpDown betting pools) and EVM/HyperLiquid (the terminal). Covers the identity
  layer, the per-user wallet records, and HyperLiquid's **agent-wallet** signing flow.
- **Builds on:** [ADR-001 – Terminal Architecture](./ADR-001-terminal-architecture.md) (risk #1:
  multi-chain signing; `ExchangeSigner.chain`) and
  [ADR-002 – Experience, Shell & Portfolio](./ADR-002-experience-and-shell.md) (§5 dual custody).
  ADR-001 decided *where the terminal lives*; ADR-002 decided *how it feels*; **this ADR decides
  *who the user is* across both chains.** It does not change either's topology.

---

## 1. Context

UpDown today is Solana-only: identity = Privy user, money = a Solana wallet, settlement = the
Anchor program. The terminal trades on **HyperLiquid, which is EVM-only**. This breaks the implicit
assumption baked into the current app: *one user = one wallet = one chain.*

Three facts force the model:

1. **Solana and EVM addresses are not interchangeable.** Different curves (Solana = ed25519, EVM =
   secp256k1) → different addresses, different signatures. A Solana address **cannot** trade on
   HyperLiquid.
2. **"Multichain wallet" ≠ "one address."** Phantom (and others) support both ecosystems, but from
   one seed they derive **two distinct addresses** — a Solana `base58` one and an EVM `0x…` one.
   HyperLiquid only ever accepts the `0x…` one. (HL's own docs have a "withdrawing to Phantom" FAQ
   precisely because users confuse the two.) So even with a single wallet app, we manage **two
   addresses per user internally.** Phantom-multichain is a UX nicety (one extension), **not** an
   architecture shortcut.
3. **HyperLiquid is not "login" — it's signed actions.** There's no session token. Either every
   order pops the wallet (unusable for a terminal), or the user approves an **agent wallet** once
   and that hot key signs orders thereafter (the right pattern — see §4).

We already use **Privy**, which supports **both Solana and EVM** wallets on one account and can
**link multiple external wallets** plus provision **embedded wallets**. So the identity layer is not
in question — the design work is the *model* on top of it.

---

## 2. Decision

**One identity, many linked wallets, chain-aware.** The app account is the durable identity; wallet
addresses are *attributes linked to it*, never the identity itself.

- **Identity = Privy user ↔ our `User` row.** Stable across chains, wallets, and devices. Login is
  email/social/wallet via Privy — unchanged from today.
- **A user may link N wallets**, each tagged with its chain. UpDown uses the **Solana** one; the
  terminal uses the **EVM** one. Neither replaces the identity.
- **HyperLiquid uses the agent-wallet pattern (§4):** the user signs **one** `approveAgent`
  (EIP-712) with their EVM wallet; an app-generated **agent key** then signs every order. The user's
  main EVM key never reaches our backend.
- **Dual custody is shown, never blended** (ADR-002 §5): betting funds live on Solana, trading
  equity on EVM/HyperLiquid. The Portfolio presents two custody contexts side by side.

**Principle: the identity is chain-agnostic; wallets are chain-specific.** Do not let any one chain's
address *be* the user.

---

## 3. Options considered

| Dimension | A: one wallet = one user (today) | ★ One identity, N linked wallets (Privy) | B: two separate accounts (betting vs trading) |
|---|---|---|---|
| Works across Solana + EVM | ❌ single chain only | ✅ both linked to one user | ✅ but two logins |
| Unified portfolio (ADR-002) | ❌ impossible | ✅ aggregate by `userId` | ❌ no single owner to join on |
| Reuses existing Privy | ✅ | ✅ (linking + embedded wallets) | ⚠️ duplicated accounts |
| Feels like "one product" | n/a | ✅ one login, two surfaces | ❌ two logins, drifts |
| Onboarding a Solana-only user to trade | ❌ blocked | ✅ link/provision an EVM wallet | ❌ make a 2nd account |
| Migration cost | none (but dead-ends) | medium (add wallet table + chain tag) | high (two of everything) |

A dead-ends the moment a second chain appears; B destroys the unified-portfolio goal by removing the
single owner to join on. ★ is the only model that keeps one owner across both chains.

---

## 4. HyperLiquid auth — the agent-wallet flow (the crux)

HyperLiquid signs **EIP-712 actions**, with two schemes (`sign_l1_action` for L1 actions like
orders/cancels, `sign_user_signed_action` for user actions like transfers/withdrawals). A terminal
must **not** prompt the wallet per order. Instead:

```
                         ┌─ user's EVM wallet (Phantom/Rabby/MetaMask) ── stays in the browser
 1. Connect EVM wallet ──┤
                         └─ we read the REAL address (0x…) → store as user's evmAddress

 2. approveAgent (ONE EIP-712 signature with the main wallet):
      { type: "approveAgent", hyperliquidChain, signatureChainId,
        agentAddress: 0x… (a key WE generate), agentName?, nonce }
    → authorizes the agent key to sign on the user's behalf

 3. Agent key signs every order/cancel thereafter — no wallet popups.
      • the agent ONLY signs; ALL queries (positions, balances, fills)
        use the user's REAL address, never the agent address  ← documented pitfall #1
```

Mechanics that shape our storage/signing code (from HL "Nonces and API wallets"):

- **Agent key custody.** The agent is a fresh secp256k1 keypair *we* create. For a hands-on terminal
  it can be a **browser-side session key** (best: private key never leaves the client); for
  server-side automation it'd be an encrypted-at-rest backend key. **Default to client-side for
  Phase 1** — smallest blast radius, matches ADR-001's "writes are client-signed."
- **Sign vs query split.** Store both: `evmAddress` (real, for *all* reads) and `agentAddress` (for
  signing). Querying with the agent address returns empty — a guaranteed bug if conflated.
- **Don't reuse agent addresses.** Deregistered/expired agents can have nonce state pruned →
  replay risk. **Generate a new agent key** on re-approval rather than reusing one.
- **Nonces per signer.** The 100 highest nonces are tracked per *signing key* (the agent). One agent
  per trading session/process; nonce = current ms within `(T−2d, T+1d)`.
- **Pruning triggers:** new unnamed `approveAgent` deregisters the old unnamed one; named agents
  collide by name (1 unnamed + 3 named per account); an account with no funds loses its agents.

> Implementation note: this maps onto ADR-001's `ExchangeSigner` (`chain: 'evm'`). HyperLiquid's
> `buildOrder`/`signAndSubmit` use the **agent** key; account reads go through `ExchangeReadAdapter`
> keyed by the **real** `evmAddress`.

---

## 5. Data model

```
User (identity — exists today, Privy-backed)
 ├─ id                       // join key for the unified portfolio (ADR-002 §5)
 ├─ privyId
 └─ … profile

WalletLink (NEW — N per user)
 ├─ userId      → User.id
 ├─ chain       'solana' | 'evm'
 ├─ address     // base58 (solana) or 0x… (evm), lowercased for evm before storing
 ├─ source      'phantom' | 'rabby' | 'metamask' | 'privy-embedded' | …
 └─ isPrimary   // primary per chain

HyperliquidAgent (NEW — the signing credential, 0..1 active per user)
 ├─ userId         → User.id
 ├─ evmAddress     // the user's REAL address this agent acts for (for queries)
 ├─ agentAddress   // the agent pubkey (for signing / nonce tracking)
 ├─ agentName?     // null = the single unnamed slot
 ├─ approvedAt / expiresAt
 └─ (agent private key: client-side session key in Phase 1; NOT a DB column)
```

- **One owner, two custody contexts.** `WalletLink` rows give the Portfolio aggregator the Solana
  address (betting) and the EVM address (trading) under a single `userId`.
- **Lowercase EVM addresses** before storing/signing (HL signing pitfall — case mismatches recover a
  different signer).
- **The agent private key is deliberately not a durable DB field** in Phase 1 — it's a client
  session key. If/when server-side automation is added, that becomes an encrypted backend secret,
  decided in its own ADR.

---

## 6. Login & onboarding flow

```
Returning user            → Privy resolves identity (email/social/wallet). Done.

First time in the terminal:
  has linked EVM wallet?   no → "Connect or create an EVM wallet"
                                 (link Phantom-EVM / Rabby / MetaMask, OR provision a
                                  Privy EVM embedded wallet) → store WalletLink(chain:evm)
                           yes ↓
  has an active HL agent?   no → approveAgent (one signature) → store HyperliquidAgent
                           yes ↓
  → trade with no further popups
```

Three onboarding personas this must serve:

1. **Existing UpDown user (Solana-only)** → has identity + Solana wallet; we add an EVM wallet +
   agent on first terminal visit. Identity is untouched.
2. **Phantom-multichain user** → one extension yields both addresses; we link both. Still two
   `WalletLink` rows, still an agent for HL.
3. **EVM-native trader (Rabby/MetaMask, no Solana)** → links EVM + agent; can trade immediately;
   gets a Solana wallet only if/when they want to bet.

---

## 7. Consequences

**Positive**
- One identity joins both chains → the unified Portfolio (ADR-002 §5) is *possible at all*.
- The main EVM key never touches our backend; trading is popup-free via the agent key; the grant is
  revocable and replaceable (generate a new agent).
- Reuses Privy's multi-chain + wallet-linking instead of building auth; additive to today's schema
  (two new tables, identity unchanged).
- Phantom-multichain "just works" as one onboarding path without us depending on it.

**Negative / costs**
- Two new tables + a per-chain "primary wallet" concept to maintain.
- Agent-wallet lifecycle (expiry, pruning, no-reuse, re-approval UX) is real surface area to get
  right — replay risk if mishandled.
- The Portfolio must clearly show **two custody contexts**; blending them is a correctness/UX bug.

---

## 8. Risks & open questions

1. **Agent key custody (top risk).** Client session key (Phase 1, smallest blast radius) vs an
   encrypted backend key (needed for server-side automation later). Decide per-feature; default
   client-side. **Never reuse an agent address** across re-approvals.
2. **Privy EVM provisioning** — confirm Privy can provision/link an EVM wallet for a Solana-origin
   user in the terminal's first phase (ADR-001 risk #1, ADR-002 Phase 1 DoD).
3. **Sign-vs-query split** — querying with the agent address returns empty. Enforce in the adapter:
   reads always use the real `evmAddress`.
4. **EIP-712 correctness** — lowercase addresses, no trailing zeroes on numbers, correct scheme
   (`sign_l1_action` vs `sign_user_signed_action`), msgpack field order. Prefer a vetted TS SDK
   (`nktkas/hyperliquid` or `nomeida/hyperliquid`) over hand-rolling signatures.
5. **Agent expiry/pruning UX** — detect a dead agent and re-run `approveAgent` transparently;
   surface "trading session expired, re-approve" rather than failing silently.
6. **Account linking abuse** — rules for linking/unlinking wallets and which is primary per chain
   (one identity must not silently absorb another's funds).

---

## 9. Long-term implications

- The identity layer generalizes to any future chain (Base, more EVM L2s, more Solana programs) by
  adding `WalletLink` rows — no identity rework.
- The agent-wallet abstraction is the template for any exchange needing delegated signing; it sits
  behind `ExchangeSigner` so the UI never sees it.
- If automated/server-side strategies are added, only the **agent key custody** decision changes
  (client → encrypted backend) — the identity and wallet model already accommodate it.

---

## 10. If I were lead architect

Keep the Privy user as the one true identity and treat every address — Solana or EVM — as a linked
attribute, never the identity. For HyperLiquid, adopt the **agent-wallet pattern from day one**
(one `approveAgent`, client-side agent key, real address for reads), and show **dual custody**
explicitly in the Portfolio. This is the concrete answer to ADR-001's risk #1 and the precondition
for ADR-002's unified portfolio.

**Next step (separate from this ADR):** scaffold `packages/exchange-core` (per ADR-001 §6 step 1),
then add the `WalletLink` + `HyperliquidAgent` tables when wiring Privy in `apps/terminal` Phase 1.
