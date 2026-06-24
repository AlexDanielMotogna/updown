'use client';

import { Modal } from '../Modal';
import { SimpleTradePanel } from './SimpleTradePanel';
import { useIdentity } from '@/hooks/useIdentity';
import type { OrderSide } from '@/lib/types';

/**
 * Kalshi-style trade modal (PLAN-SIMPLE-MODE §4.2). Opened from the markets list's
 * LONG/SHORT buttons — trade without leaving the list. Identity from Privy with dev
 * fallbacks (mirrors OrderPanel).
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
  const base = symbol.replace('-USD', '');
  return (
    <Modal open={open} onClose={onClose} title={`${base} PERP`} size="md">
      <Body symbol={symbol} initialSide={initialSide} devWallet={devWallet} devEvm={devEvm} onClose={onClose} />
    </Modal>
  );
}

function Body({ symbol, initialSide, devWallet, devEvm, onClose }: { symbol: string; initialSide?: OrderSide; devWallet?: string; devEvm?: string; onClose: () => void }) {
  // useIdentity is a no-op-safe hook; when Privy isn't configured it returns
  // undefined and the dev fallbacks apply.
  const id = useIdentity();
  return (
    <SimpleTradePanel
      symbol={symbol}
      walletAddress={id.walletAddress ?? devWallet}
      evmAddress={id.evmAddress ?? devEvm}
      initialSide={initialSide}
      onClose={onClose}
      hideHeader
    />
  );
}
