'use client';

import { useState } from 'react';
import { placeOrder } from '@/lib/api';
import type { OrderSide, OrderType } from '@/lib/types';

/**
 * Order-entry panel. Submits to the API (apps/api), which signs with the user's
 * server-held agent key (ADR-003). `walletAddress` is the Solana identity; until
 * the unified Privy session/SSO lands (ADR-002 Phase 2) it's injected as a prop
 * (e.g. from NEXT_PUBLIC_DEV_WALLET) — without it the panel prompts to connect.
 */
export function OrderEntry({ symbol, walletAddress }: { symbol: string; walletAddress?: string }) {
  const [side, setSide] = useState<OrderSide>('BUY');
  const [type, setType] = useState<OrderType>('LIMIT');
  const [amount, setAmount] = useState('');
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const canSubmit = !!walletAddress && !!amount && (type === 'MARKET' || !!price) && !busy;

  async function submit() {
    if (!walletAddress) return;
    setBusy(true);
    setMsg(null);
    const res = await placeOrder({
      walletAddress,
      symbol,
      side,
      type,
      amount,
      price: type === 'LIMIT' ? price : undefined,
      timeInForce: 'GTC',
    });
    setBusy(false);
    setMsg(
      res.success
        ? { ok: true, text: `Order ${res.data?.status} · id ${res.data?.orderId}` }
        : { ok: false, text: res.error?.message ?? 'Order failed' }
    );
  }

  return (
    <div className="rounded border border-border bg-bg-surface p-3 text-sm">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-semibold">Order</span>
        <span className="text-muted text-xs">{symbol}</span>
      </div>

      <div className="mb-2 grid grid-cols-2 gap-1">
        {(['BUY', 'SELL'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSide(s)}
            className={`rounded px-2 py-1.5 text-sm font-semibold ${
              side === s
                ? s === 'BUY'
                  ? 'bg-up text-black'
                  : 'bg-down text-black'
                : 'border border-border text-muted hover:bg-bg-elevated'
            }`}
          >
            {s === 'BUY' ? 'Buy / Long' : 'Sell / Short'}
          </button>
        ))}
      </div>

      <div className="mb-2 flex gap-1">
        {(['LIMIT', 'MARKET'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={`rounded px-2 py-1 text-xs ${
              type === t ? 'bg-bg-elevated text-white' : 'text-muted hover:text-white'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <label className="mb-2 block">
        <span className="text-muted text-xs">Size</span>
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          placeholder="0.0"
          className="mt-0.5 w-full rounded border border-border bg-bg-app px-2 py-1.5 tabular-nums outline-none focus:border-strong"
        />
      </label>

      {type === 'LIMIT' && (
        <label className="mb-2 block">
          <span className="text-muted text-xs">Price</span>
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            inputMode="decimal"
            placeholder="0.0"
            className="mt-0.5 w-full rounded border border-border bg-bg-app px-2 py-1.5 tabular-nums outline-none focus:border-strong"
          />
        </label>
      )}

      <button
        onClick={submit}
        disabled={!canSubmit}
        className={`mt-1 w-full rounded px-2 py-2 font-semibold ${
          side === 'BUY' ? 'bg-up text-black' : 'bg-down text-black'
        } disabled:cursor-not-allowed disabled:opacity-40`}
      >
        {busy ? 'Placing…' : !walletAddress ? 'Connect to trade' : `${side === 'BUY' ? 'Buy' : 'Sell'} ${symbol}`}
      </button>

      {msg && (
        <div className={`mt-2 text-xs ${msg.ok ? 'text-up' : 'text-down'}`}>{msg.text}</div>
      )}
    </div>
  );
}
