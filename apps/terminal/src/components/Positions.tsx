'use client';

import { useCallback, useEffect, useState } from 'react';
import { cancelOrder, placeOrder } from '@/lib/api';

type Tab = 'positions' | 'orders' | 'trades';
const TABS: { key: Tab; label: string }[] = [
  { key: 'positions', label: 'Positions' },
  { key: 'orders', label: 'Open Orders' },
  { key: 'trades', label: 'Trade History' },
];

const n = (s: string | number, dp = 2) => Number(s).toLocaleString(undefined, { maximumFractionDigits: dp });

interface Position {
  symbol: string;
  side: 'LONG' | 'SHORT';
  amount: string;
  entryPrice: string;
  markPrice: string;
  unrealizedPnl: string;
  leverage: number;
  liquidationPrice: string;
  margin: string;
  funding: string;
  metadata?: { positionValue?: string; returnOnEquity?: string; leverageType?: string };
}
interface OpenOrder { orderId: string | number; symbol: string; side: 'BUY' | 'SELL'; type: string; price: string; amount: string; remaining: string }
interface Fill { historyId: string; symbol: string; side: 'BUY' | 'SELL'; amount: string; price: string; pnl: string | null; executedAt: number }

export function Positions({ address, walletAddress }: { address?: string; walletAddress?: string }) {
  const [tab, setTab] = useState<Tab>('positions');
  const [positions, setPositions] = useState<Position[]>([]);
  const [orders, setOrders] = useState<OpenOrder[]>([]);
  const [trades, setTrades] = useState<Fill[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    if (!address) return;
    try {
      if (tab === 'positions') {
        const r = await (await fetch(`/api/positions?address=${address}`, { cache: 'no-store' })).json();
        if (r.success) setPositions(r.data.positions);
      } else if (tab === 'orders') {
        const r = await (await fetch(`/api/orders?address=${address}`, { cache: 'no-store' })).json();
        if (r.success) setOrders(r.data);
      } else {
        const r = await (await fetch(`/api/trades?address=${address}`, { cache: 'no-store' })).json();
        if (r.success) setTrades(r.data);
      }
      setLoaded(true);
    } catch {/* keep */}
  }, [address, tab]);

  useEffect(() => {
    setLoaded(false);
    refresh();
    const id = window.setInterval(refresh, 4000);
    return () => window.clearInterval(id);
  }, [refresh]);

  async function onCancel(o: OpenOrder) {
    if (!walletAddress) return;
    await cancelOrder({ walletAddress, symbol: o.symbol, orderId: o.orderId });
    refresh();
  }

  async function onClose(p: Position) {
    if (!walletAddress) return;
    // Close = reduce-only market order on the opposite side for the full size.
    await placeOrder({
      walletAddress,
      symbol: p.symbol,
      side: p.side === 'LONG' ? 'SELL' : 'BUY',
      type: 'MARKET',
      amount: p.amount,
      reduceOnly: true,
    });
    refresh();
  }

  const counts = { positions: positions.length, orders: orders.length, trades: trades.length };

  return (
    <div className="card flex h-full flex-col">
      {/* Tabs */}
      <div className="flex border-b border-surface-800 text-xs">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2 ${tab === t.key ? 'border-surface-200 text-surface-100' : 'border-transparent text-surface-400 hover:text-surface-200'}`}
          >
            {t.label}
            {counts[t.key] > 0 && <span className="rounded bg-surface-700 px-1.5 py-0.5 text-2xs">{counts[t.key]}</span>}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {!address ? (
          <Empty>Connect to view {tab}.</Empty>
        ) : !loaded ? (
          <Empty>loading…</Empty>
        ) : tab === 'positions' ? (
          positions.length === 0 ? <Empty>No open positions.</Empty> : (
            <Table head={['Coin', 'Size', 'Pos. Value', 'Entry', 'Mark', 'PnL (ROE %)', 'Liq. Price', 'Margin', 'Funding', 'Close', 'TP/SL']}>
              {positions.map((p) => {
                const base = p.symbol.replace('-USD', '');
                const long = p.side === 'LONG';
                const pnl = Number(p.unrealizedPnl);
                const roe = Number(p.metadata?.returnOnEquity ?? 0) * 100;
                const fund = Number(p.funding);
                return (
                  <tr key={p.symbol} className="border-b border-surface-800/60 tabular">
                    <Td>
                      <span className="flex items-center gap-1.5">
                        <span className={`h-3 w-0.5 ${long ? 'bg-win-500' : 'bg-loss-500'}`} />
                        <span className="font-medium">{base}</span>
                        <span className={`rounded px-1 text-2xs ${long ? 'bg-win-500/15 text-win-500' : 'bg-loss-500/15 text-loss-500'}`}>{p.leverage}x</span>
                      </span>
                    </Td>
                    <Td className={long ? 'text-win-500' : 'text-loss-500'}>{n(p.amount, 4)} {base}</Td>
                    <Td>${n(p.metadata?.positionValue ?? '0')}</Td>
                    <Td>{n(p.entryPrice)}</Td>
                    <Td>{n(p.markPrice)}</Td>
                    <Td className={pnl >= 0 ? 'text-win-500' : 'text-loss-500'}>
                      {pnl >= 0 ? '+' : ''}${n(pnl)} ({roe.toFixed(1)}%)
                    </Td>
                    <Td className="text-surface-400">{Number(p.liquidationPrice) > 0 ? n(p.liquidationPrice) : 'N/A'}</Td>
                    <Td>
                      ${n(p.margin)} <span className="text-2xs capitalize text-surface-400">({p.metadata?.leverageType ?? 'cross'})</span>
                    </Td>
                    <Td className={fund >= 0 ? 'text-win-500' : 'text-loss-500'}>{fund >= 0 ? '' : '-'}${n(Math.abs(fund))}</Td>
                    <Td>
                      <button onClick={() => onClose(p)} disabled={!walletAddress} className="rounded border border-surface-700 px-2 py-0.5 text-2xs text-surface-300 hover:bg-surface-800 disabled:opacity-40">
                        Close
                      </button>
                    </Td>
                    <Td className="text-2xs text-surface-500">-- / --</Td>
                  </tr>
                );
              })}
            </Table>
          )
        ) : tab === 'orders' ? (
          orders.length === 0 ? <Empty>No open orders.</Empty> : (
            <Table head={['Market', 'Side', 'Type', 'Price', 'Size', '']}>
              {orders.map((o) => (
                <tr key={String(o.orderId)} className="border-b border-surface-800/60 tabular">
                  <Td className="font-medium">{o.symbol}</Td>
                  <Td className={o.side === 'BUY' ? 'text-win-500' : 'text-loss-500'}>{o.side}</Td>
                  <Td className="text-surface-400">{o.type}</Td>
                  <Td>{n(o.price)}</Td>
                  <Td>{n(o.remaining, 4)}</Td>
                  <Td>
                    <button
                      onClick={() => onCancel(o)}
                      disabled={!walletAddress}
                      className="rounded border border-surface-700 px-2 py-0.5 text-2xs text-surface-300 hover:bg-surface-800 disabled:opacity-40"
                    >
                      Cancel
                    </button>
                  </Td>
                </tr>
              ))}
            </Table>
          )
        ) : trades.length === 0 ? (
          <Empty>No trades yet.</Empty>
        ) : (
          <Table head={['Time', 'Market', 'Side', 'Size', 'Price', 'PnL']}>
            {trades.map((f) => (
              <tr key={f.historyId} className="border-b border-surface-800/60 tabular">
                <Td className="text-surface-400">{new Date(f.executedAt).toLocaleTimeString()}</Td>
                <Td className="font-medium">{f.symbol}</Td>
                <Td className={f.side === 'BUY' ? 'text-win-500' : 'text-loss-500'}>{f.side}</Td>
                <Td>{n(f.amount, 4)}</Td>
                <Td>{n(f.price)}</Td>
                <Td className={f.pnl != null && Number(f.pnl) >= 0 ? 'text-win-500' : 'text-loss-500'}>{f.pnl != null ? n(f.pnl) : '—'}</Td>
              </tr>
            ))}
          </Table>
        )}
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="p-4 text-sm text-surface-400">{children}</div>;
}
function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <table className="w-full text-xs">
      <thead className="sticky top-0 bg-surface-850 text-2xs uppercase text-surface-500">
        <tr className="border-b border-surface-800">
          {head.map((h, i) => (
            <th key={i} className={`px-3 py-1.5 font-medium ${i === 0 ? 'text-left' : 'text-left'}`}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}
function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-1.5 ${className}`}>{children}</td>;
}
