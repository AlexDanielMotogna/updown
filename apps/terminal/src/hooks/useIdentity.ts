'use client';

import { useEffect, useState } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { linkEvm, registerUser, resolveIdentity } from '@/lib/api';

// Module-level guard so register+link fires ONCE per identity across all the
// components that call useIdentity (not once per hook instance). Deleted on
// failure (e.g. API down) so a later mount can retry.
const linkInFlight = new Set<string>();

export interface Identity {
  ready: boolean;
  authenticated: boolean;
  /** UpDown identity = the Solana wallet (from the shared Privy session). */
  walletAddress?: string;
  /** The connected EVM wallet — the user's HyperLiquid account address. */
  evmAddress?: string;
  /** True once we have a usable identity (no manual linking needed). */
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
 * Terminal identity via the shared Privy session (ADR-002 SSO). With Solana +
 * Ethereum enabled on the same Privy app, one account carries both wallets:
 * the Solana wallet IS the UpDown identity; the EVM wallet is the HL account.
 * We read both from the session (no pasting). For an EVM-only session we fall
 * back to /resolve (a previously-linked identity). When both are present we
 * auto-link them server-side.
 */
export function useIdentity(): Identity {
  const { ready, authenticated, user } = usePrivy();
  const { wallets } = useWallets(); // actually-connected EVM wallets
  const accounts = (user?.linkedAccounts ?? []) as LinkedAccount[];
  const sessionSolana = accounts.find((a) => a.type === 'wallet' && a.chainType === 'solana')?.address;
  // The HL account = the EXTERNAL connected EVM wallet (MetaMask/Rabby — where the
  // funds are), NOT Privy's empty embedded wallet. Read from useWallets (a wallet
  // can be connected for txns without being a "linked account"); prefer a non-Privy
  // wallet, then any connected wallet, then a linked ethereum account.
  const linkedEvm = accounts.find((a) => a.type === 'wallet' && a.chainType === 'ethereum')?.address;
  const evmAddress =
    (wallets.find((w) => w.walletClientType !== 'privy') ?? wallets[0])?.address ?? linkedEvm;

  // EVM-only session → try to resolve a previously-linked identity. `resolveDone`
  // distinguishes "still checking" (undefined) from "checked, none found" (null).
  const [resolved, setResolved] = useState<string | null>(null);
  const [resolveDone, setResolveDone] = useState(false);
  useEffect(() => {
    if (sessionSolana || !evmAddress) {
      setResolved(null);
      setResolveDone(false);
      return;
    }
    let alive = true;
    setResolveDone(false);
    resolveIdentity(evmAddress).then((w) => {
      if (alive) { setResolved(w ?? null); setResolveDone(true); }
    });
    return () => { alive = false; };
  }, [sessionSolana, evmAddress]);

  // Identity = Solana wallet → a previously-linked identity → the EVM wallet
  // itself. The last fallback means an EVM-only user (e.g. just MetaMask) gets an
  // account automatically, with no manual linking; undefined only while resolving.
  const walletAddress = sessionSolana ?? resolved ?? (resolveDone ? evmAddress : undefined);

  // The connected EVM wallet is already bound to a different UpDown account
  // (server rejects the re-link, bind-once). One HL account ↔ one UpDown account.
  const [linkConflict, setLinkConflict] = useState(false);

  // Auto-register + link once (deduped across hook instances). With a Solana
  // wallet, the Solana address is the identity and the EVM wallet links to it.
  // EVM-only → the EVM wallet is its own identity (persists via /resolve).
  useEffect(() => {
    // A new EVM wallet starts conflict-free; the link below re-flags if needed.
    setLinkConflict(false);
    if (!evmAddress) return;
    const [identity, key] = sessionSolana
      ? [sessionSolana, `sol:${sessionSolana}:${evmAddress}`]
      : resolveDone && !resolved
        ? [evmAddress, `evm:${evmAddress}`]
        : [undefined, ''];
    if (!identity || linkInFlight.has(key)) return;
    linkInFlight.add(key);
    // registerUser/linkEvm resolve to { success } (no throw on network errors).
    // Release the guard on a TRANSIENT failure (API down) so a later mount can
    // retry; a WALLET_LINKED_ELSEWHERE conflict is permanent → keep the guard and
    // surface it via linkConflict.
    registerUser(identity)
      .then(async (r) => {
        if (!r.success) return { ok: false as const };
        const link = await linkEvm(identity, evmAddress, 'privy');
        return { ok: link.success, code: link.error?.code };
      })
      .then((res) => {
        if (res.ok) return;
        if (res.code === 'WALLET_LINKED_ELSEWHERE') { setLinkConflict(true); return; }
        linkInFlight.delete(key);
      })
      .catch(() => linkInFlight.delete(key));
  }, [sessionSolana, evmAddress, resolveDone, resolved]);

  return { ready, authenticated, walletAddress, evmAddress, linked: !!walletAddress, linkConflict };
}
