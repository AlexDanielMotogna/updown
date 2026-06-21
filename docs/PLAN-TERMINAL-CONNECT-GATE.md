# Terminal connect gate + one-HL-per-UpDown enforcement

## Context
Two terminal UX/integrity gaps:

1. **A new user landing on the terminal** sees the trading UI with no guidance that
   HyperLiquid needs an **EVM wallet** (another chain). Privy auto-connects whatever
   session exists (`shouldAutoConnect`), so the state is confusing and the user can
   be lost. → Require connecting an EVM wallet **before showing the terminal**, via a
   blocking modal (animated connection icon + clear "you need an EVM wallet" message).

2. **The same HyperLiquid (EVM) wallet can be linked to multiple UpDown accounts.**
   Today `linkWallet` upserts and **re-points** the wallet to a new `userId` on
   conflict (`apps/api/src/services/wallet-link.ts:30` `update: data`). → Bind an EVM
   wallet to **exactly one** UpDown identity; block reuse on a second account.

**Product decisions (confirmed with user):**
- The gate **blocks the whole terminal** until an EVM wallet is connected (not just
  the trading panel).
- If the HL wallet is already linked elsewhere → **block + clear message** (strict
  1:1, anti-farming).

## Backend — one HL ↔ one UpDown (bind-once)
- `apps/api/src/services/wallet-link.ts` → `linkWallet`: look up the existing
  `(chain, address)` link first.
  - exists with a **different** `userId` → return a conflict (`{ conflict: true,
    ownerUserId }`); **do NOT update**.
  - same user → idempotent no-op (return existing).
  - unlinked → create.
- `apps/api/src/routes/exchange.ts` → `POST /link` (line ~119, already calls
  `linkWallet`): on conflict respond `409`
  `{ success: false, error: { code: 'WALLET_LINKED_ELSEWHERE' } }`.
- resolve / order / agent paths unchanged — they key off the existing link, which now
  never moves once set.

## Frontend — connect gate + conflict state
- `apps/terminal/src/hooks/useIdentity.ts`:
  - Add `linkConflict: boolean` to the returned `Identity`. Set it when `linkEvm`
    returns `WALLET_LINKED_ELSEWHERE` (it already returns `ApiResult` via `post()`, so
    the code is `r.error.code`).
  - On conflict, do **not** treat the EVM as owned — drop the
    `walletAddress = ... ?? evmAddress` fallback for that case so the gate can block.
- New `apps/terminal/src/components/ConnectGate.tsx` (MUI, animated): a full overlay
  over the terminal area with a pulsing/animated connection icon. States:
  - Privy not ready → spinner.
  - **Not authenticated** → "Connect to trade" → `usePrivy().login`.
  - **Authenticated, no EVM wallet** → headline "Connect an EVM wallet", body
    explaining HyperLiquid runs on an EVM chain (MetaMask / Rabby / WalletConnect /
    Coinbase) → `usePrivy().connectWallet`. (This is the "needs another-chain wallet"
    message in requirement #1.)
  - **linkConflict** → block with "This HyperLiquid wallet is already linked to
    another UpDown account. Connect a different wallet." + Disconnect / switch action.
  - Connected + no conflict → render nothing (gate down).
- `apps/terminal/src/components/TerminalLayout.tsx`: render `<ConnectGate />` as a
  fixed overlay below the navbar, covering `<main>`, so nothing in the terminal is
  usable until connected. Keep the Navbar visible (it has the wallet menu /
  disconnect).
- Dev fallback: if `NEXT_PUBLIC_DEV_EVM_ADDRESS` is set (local dev), skip the gate.

## Files
- `apps/api/src/services/wallet-link.ts` — bind-once `linkWallet` + conflict return.
- `apps/api/src/routes/exchange.ts` — `/link` 409 on conflict.
- `apps/terminal/src/hooks/useIdentity.ts` — `linkConflict`, no auto-own on conflict.
- `apps/terminal/src/components/ConnectGate.tsx` — **new** overlay (animated, EVM msg).
- `apps/terminal/src/components/TerminalLayout.tsx` — mount the gate.
- (`apps/terminal/src/lib/api.ts` — `linkEvm` already surfaces the error code; no change.)

## Verification
- `pnpm --filter api typecheck` + `pnpm --filter terminal typecheck` clean.
- New session (no wallet): terminal shows the gate → "Connect to trade". After Privy
  login with only Solana/embedded → "Connect an EVM wallet" message. After connecting
  MetaMask → gate drops, terminal usable.
- Link conflict: connect an EVM already linked to user A from a different identity →
  gate shows "already linked to another account", trading blocked; `POST /link`
  returns `409 WALLET_LINKED_ELSEWHERE`.
- Existing single-user flow still works (same-user re-link is idempotent).
