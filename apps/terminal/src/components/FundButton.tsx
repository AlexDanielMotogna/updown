'use client';

import { useState } from 'react';
import { useIdentity } from '@/hooks/useIdentity';
import { BridgeFundModal } from './BridgeFundModal';

/**
 * Always-visible entry point to fund the trading account (bridge Solana USDC →
 * HyperLiquid). Two looks: `navbar` (a brand pill in the header) and `cta` (a
 * full-width button for the empty-balance prompt in the order panel).
 */
export function FundButton({ variant = 'navbar', label }: { variant?: 'navbar' | 'cta'; label?: string }) {
  const { walletAddress, evmAddress } = useIdentity();
  const [open, setOpen] = useState(false);

  // Only meaningful once the user has an identity (the Connect button covers the
  // logged-out state).
  if (!walletAddress) return null;

  const cls =
    variant === 'navbar'
      ? 'inline-flex h-[38px] shrink-0 items-center justify-center gap-1 rounded-md bg-brand px-3 text-[0.75rem] font-semibold leading-none text-surface-950 transition-colors hover:bg-brand-600'
      : 'w-full rounded-lg bg-brand py-2.5 text-sm font-semibold text-surface-950 transition-colors hover:bg-brand-600';

  return (
    <>
      <button onClick={() => setOpen(true)} className={cls}>
        <span className={variant === 'navbar' ? 'text-sm leading-none' : 'text-base leading-none'}>⇄</span>
        <span className={`leading-none ${variant === 'navbar' ? 'hidden sm:inline' : ''}`}>{label ?? 'Transfer'}</span>
      </button>
      <BridgeFundModal open={open} onClose={() => setOpen(false)} solanaAddress={walletAddress} evmAddress={evmAddress} />
    </>
  );
}
