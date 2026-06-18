'use client';

import { useEffect, useState } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { resolveIdentity } from '@/lib/api';

export interface Identity {
  ready: boolean;
  authenticated: boolean;
  /** The connected EVM wallet — this is the user's HyperLiquid account address. */
  evmAddress?: string;
  /** The resolved Solana identity (walletAddress) — undefined if EVM not linked. */
  walletAddress?: string;
  linked: boolean;
}

/**
 * Terminal identity: the Privy EVM wallet is the HL account; we resolve it to the
 * UpDown User (Solana identity) via /api/exchange/resolve (ADR-003 link model).
 */
export function useIdentity(): Identity {
  const { ready, authenticated } = usePrivy();
  const { wallets } = useWallets();
  const evmAddress = wallets.find((w) => w.address?.startsWith('0x'))?.address;
  const [walletAddress, setWalletAddress] = useState<string>();

  useEffect(() => {
    if (!evmAddress) {
      setWalletAddress(undefined);
      return;
    }
    let alive = true;
    resolveIdentity(evmAddress).then((w) => {
      if (alive) setWalletAddress(w ?? undefined);
    });
    return () => {
      alive = false;
    };
  }, [evmAddress]);

  return { ready, authenticated, evmAddress, walletAddress, linked: !!walletAddress };
}
