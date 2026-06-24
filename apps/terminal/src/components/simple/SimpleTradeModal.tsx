'use client';

import { useEffect } from 'react';
import { SimpleTradePanel } from './SimpleTradePanel';
import { useIdentity } from '@/hooks/useIdentity';
import type { OrderSide } from '@/lib/types';

/**
 * Robinhood-style trade modal (PLAN-SIMPLE-MODE §4.2). Rounded self-contained shell
 * (the generic Modal is square + adds its own title), so the panel renders its own
 * rich header (icon + live price). Opened from the catalog's LONG/SHORT.
 */
export function SimpleTradeModal({
  open,
  onClose,
  symbol,
  initialSide,
  devWallet,
  devEvm,
}: {
  open: boolean;
  onClose: () => void;
  symbol: string;
  initialSide?: OrderSide;
  devWallet?: string;
  devEvm?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-[440px] max-w-[94vw] animate-fade-in overflow-hidden rounded-2xl border border-surface-700 bg-surface-850 shadow-card">
        <Body symbol={symbol} initialSide={initialSide} devWallet={devWallet} devEvm={devEvm} onClose={onClose} />
      </div>
    </div>
  );
}

function Body({ symbol, initialSide, devWallet, devEvm, onClose }: { symbol: string; initialSide?: OrderSide; devWallet?: string; devEvm?: string; onClose: () => void }) {
  const id = useIdentity();
  return (
    <SimpleTradePanel
      symbol={symbol}
      walletAddress={id.walletAddress ?? devWallet}
      evmAddress={id.evmAddress ?? devEvm}
      initialSide={initialSide}
      onClose={onClose}
    />
  );
}
