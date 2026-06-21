'use client';

import { useEffect, useState } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { linkEvm, registerUser } from '@/lib/api';

// Module-level guard so register+link fires ONCE per (identity, evm) across all
// the components that call useIdentity (not once per hook instance). Deleted on
// transient failure (e.g. API down) so a later mount can retry.
const linkInFlight = new Set<string>();

export interface Identity {
  ready: boolean;
  authenticated: boolean;
  /** UpDown identity = the Solana wallet (the UpDown account). Undefined until a
   * Solana wallet is in the session — the terminal requires a UpDown login. */
  walletAddress?: string;
  /** The connected EVM wallet — the user's HyperLiquid trading account address. */
  evmAddress?: string;
  /** True once we have a usable UpDown identity (a Solana wallet). */
  linked: boolean;
  /** The connected EVM wallet is already bound to a DIFFERENT UpDown account. */
  linkConflict: boolean;
}

interface LinkedAccount {
  type: string;
  address?: string;
  chainType?: string;
  /** 'privy' = embedded wallet; anything else = an external wallet (MetaMask…). */
  walletClientType?: string;
}

/**
 * Terminal identity via the shared Privy session (ADR-002 SSO, ADR-003).
 * **The UpDown account is the Solana wallet** — that, and only that, is the
 * identity. The EVM wallet is the linked HyperLiquid trading wallet, never an
 * identity of its own: this keeps the terminal session tied to the UpDown login
 * (you can't reach a different account by reusing the same EVM, and a fresh
 * UpDown login doesn't silently resolve to whoever owns the connected EVM).
 *
 * When both a Solana wallet and an EVM wallet are present we auto-link them
 * server-side; if that EVM already belongs to another UpDown account the link is
 * rejected (bind-once) and we surface it via `linkConflict`.
 */
export function useIdentity(): Identity {
  const { ready, authenticated, user } = usePrivy();
  const { wallets } = useWallets(); // actually-connected EVM wallets
  const accounts = (user?.linkedAccounts ?? []) as LinkedAccount[];

  // Identity = the UpDown account = the Solana wallet from the session.
  const sessionSolana = accounts.find((a) => a.type === 'wallet' && a.chainType === 'solana')?.address;
  const walletAddress = sessionSolana;

  // The HL account = the EXTERNAL connected EVM wallet (MetaMask/Rabby — where the
  // funds are), NOT Privy's empty embedded wallet. Prefer a non-Privy wallet, then
  // any connected wallet, then a linked ethereum account.
  const linkedEvm = accounts.find((a) => a.type === 'wallet' && a.chainType === 'ethereum')?.address;
  const evmAddress =
    (wallets.find((w) => w.walletClientType !== 'privy') ?? wallets[0])?.address ?? linkedEvm;

  // The connected EVM wallet is already bound to a different UpDown account
  // (server rejects the re-link, bind-once). One HL account ↔ one UpDown account.
  const [linkConflict, setLinkConflict] = useState(false);

  // Auto-register the UpDown (Solana) identity + link the EVM trading wallet to
  // it, once per (identity, evm). Runs only when BOTH are present.
  useEffect(() => {
    // A new identity/EVM pair starts conflict-free; the link below re-flags it.
    setLinkConflict(false);
    if (!sessionSolana || !evmAddress) return;
    const key = `sol:${sessionSolana}:${evmAddress}`;
    if (linkInFlight.has(key)) return;
    linkInFlight.add(key);
    // registerUser/linkEvm resolve to { success } (no throw on network errors).
    // Release the guard on a TRANSIENT failure (API down) so a later mount can
    // retry; a WALLET_LINKED_ELSEWHERE conflict is permanent → keep the guard and
    // surface it via linkConflict.
    registerUser(sessionSolana)
      .then(async (r) => {
        if (!r.success) return { ok: false as const };
        const link = await linkEvm(sessionSolana, evmAddress, 'privy');
        return { ok: link.success, code: link.error?.code };
      })
      .then((res) => {
        if (res.ok) return;
        if (res.code === 'WALLET_LINKED_ELSEWHERE') { setLinkConflict(true); return; }
        linkInFlight.delete(key);
      })
      .catch(() => linkInFlight.delete(key));
  }, [sessionSolana, evmAddress]);

  return { ready, authenticated, walletAddress, evmAddress, linked: !!walletAddress, linkConflict };
}
