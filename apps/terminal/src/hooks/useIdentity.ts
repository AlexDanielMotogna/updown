'use client';

import { useEffect, useRef, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { linkEvm, registerUser, resolveIdentity } from '@/lib/api';

export interface Identity {
  ready: boolean;
  authenticated: boolean;
  /** UpDown identity = the Solana wallet (from the shared Privy session). */
  walletAddress?: string;
  /** The connected EVM wallet — the user's HyperLiquid account address. */
  evmAddress?: string;
  /** True once we have a usable identity (no manual linking needed). */
  linked: boolean;
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
  const accounts = (user?.linkedAccounts ?? []) as LinkedAccount[];
  const sessionSolana = accounts.find((a) => a.type === 'wallet' && a.chainType === 'solana')?.address;
  // Prefer an EXTERNAL EVM wallet (MetaMask/Rabby — where the user's funds are)
  // over Privy's auto-created embedded wallet, which is empty. Picking the first
  // ethereum account blindly often selected the embedded one → wrong HL account.
  const evmWallets = accounts.filter((a) => a.type === 'wallet' && a.chainType === 'ethereum');
  const evmAddress = (evmWallets.find((a) => a.walletClientType && a.walletClientType !== 'privy') ?? evmWallets[0])?.address;

  // EVM-only session → try to resolve a previously-linked identity.
  const [resolved, setResolved] = useState<string>();
  useEffect(() => {
    if (sessionSolana || !evmAddress) {
      setResolved(undefined);
      return;
    }
    let alive = true;
    resolveIdentity(evmAddress).then((w) => alive && setResolved(w ?? undefined));
    return () => {
      alive = false;
    };
  }, [sessionSolana, evmAddress]);

  const walletAddress = sessionSolana ?? resolved;

  // Auto-link the EVM wallet to the Solana identity once (when both are known
  // from the session). Ensures the User exists first.
  const linkedOnce = useRef<string>();
  useEffect(() => {
    if (!sessionSolana || !evmAddress) return;
    const key = `${sessionSolana}:${evmAddress}`;
    if (linkedOnce.current === key) return;
    linkedOnce.current = key;
    registerUser(sessionSolana).then(() => linkEvm(sessionSolana, evmAddress, 'privy'));
  }, [sessionSolana, evmAddress]);

  return { ready, authenticated, walletAddress, evmAddress, linked: !!walletAddress };
}
