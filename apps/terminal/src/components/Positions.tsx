'use client';

import { useCallback, useEffect, useState } from 'react';
import { cancelOrder, placeOrder } from '@/lib/api';
import { Modal } from './Modal';

type CloseMode = 'market' | 'limit' | 'reverse';

type Tab = 'positions' | 'orders' | 'trades' | 'funding' | 'orderhistory';
const TABS: { key: Tab; label: string }[] = [
  { key: 'positions', label: 'Positions' },
  { key: 'orders', label: 'Open Orders' },
  { key: 'trades', label: 'Trade History' },
  { key: 'funding', label: 'Funding History' },
  { key: 'orderhistory', label: 'Order History' },
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
interface FundingItem { symbol: string; usdc: string; rate: string; time: number }
interface OrderHistItem { orderId: string | number; symbol: string; side: 'BUY' | 'SELL'; price: string; amount: string; status: string; time: number }

export function Positions({ address, walletAddress }: { address?: string; walletAddress?: string }) {
  const [tab, setTab] = useState<Tab>('positions');
  const [positions, setPositions] = useState<Position[]>([]);
  const [orders, setOrders] = useState<OpenOrder[]>([]);
  const [trades, setTrades] = useState<Fill[]>([]);
  const [funding, setFunding] = useState<FundingItem[]>([]);
  const [orderHist, setOrderHist] = useState<OrderHistItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [closeTarget, setCloseTarget] = useState<{ p: Position; mode: CloseMode } | null>(null);

  const refresh = useCallback(async () => {
    if (!address) return;
    const get = async (path: string) => (await fetch(`${path}?address=${address}`, { cache: 'no-store' })).json();
    try {
      if (tab === 'positions') {
        const r = await get('/api/positions');
        if (r.success) setPositions(r.data.positions);
      } else if (tab === 'orders') {
        const r = await get('/api/orders');
        if (r.success) setOrders(r.data);
      } else if (tab === 'trades') {
        const r = await get('/api/trades');
        if (r.success) setTrades(r.data);
      } else if (tab === 'funding') {
        const r = await get('/api/funding');
        if (r.success) setFunding(r.data);
      } else {
        const r = await get('/api/orderhistory');
        if (r.success) setOrderHist(r.data);
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

  async function onClose(p: Position, mode: CloseMode, opts?: { size?: string; limitPrice?: string }) {
    if (!walletAddress) return;
    const opp = p.side === 'LONG' ? 'SELL' : 'BUY';
    const size = opts?.size && Number(opts.size) > 0 ? opts.size : p.amount;
    if (mode === 'reverse') {
      // Flip the entire position: market opposite for 2× size.
      await placeOrder({ walletAddress, symbol: p.symbol, side: opp, type: 'MARKET', amount: String(Number(p.amount) * 2) });
    } else if (mode === 'limit') {
      if (!opts?.limitPrice) return;
      await placeOrder({ walletAddress, symbol: p.symbol, side: opp, type: 'LIMIT', amount: size, price: opts.limitPrice, reduceOnly: true, timeInForce: 'GTC' });
    } else {
      await placeOrder({ walletAddress, symbol: p.symbol, side: opp, type: 'MARKET', amount: size, reduceOnly: true });
    }
    refresh();
  }

  async function onCloseAll() {
    if (!walletAddress) return;
    await Promise.all(positions.map((p) => onClose(p, 'market')));
  }

  const counts: Record<Tab, number> = {
    positions: positions.length,
    orders: orders.length,
    trades: trades.length,
    funding: funding.length,
    orderhistory: orderHist.length,
  };

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
            <Table head={['Coin', 'Size', 'Pos. Value', 'Entry', 'Mark', 'PnL (ROE %)', 'Liq. Price', 'Margin', 'Funding',
              <button key="closeall" onClick={onCloseAll} disabled={!walletAddress} className="font-semibold text-surface-300 hover:text-surface-100 disabled:opacity-40">Close All</button>,
              'TP/SL']}>
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
                        <span className="font-medium text-surface-100">{base}</span>
                        <span className={`rounded px-1 text-2xs ${long ? 'bg-win-500/15 text-win-500' : 'bg-loss-500/15 text-loss-500'}`}>{p.leverage}x</span>
                      </span>
                    </Td>
                    <Td className="text-surface-400">{n(p.amount, 4)} {base}</Td>
                    <Td className="text-surface-100">${n(p.metadata?.positionValue ?? '0')}</Td>
                    <Td className="text-surface-100">{n(p.entryPrice)}</Td>
                    <Td className="text-surface-100">{n(p.markPrice)}</Td>
                    <Td className={pnl >= 0 ? 'text-win-500' : 'text-loss-500'}>
                      {pnl >= 0 ? '+' : ''}${n(pnl)} ({roe.toFixed(1)}%)
                    </Td>
                    <Td className="text-surface-100">{Number(p.liquidationPrice) > 0 ? n(p.liquidationPrice) : 'N/A'}</Td>
                    <Td className="text-surface-100">
                      ${n(p.margin)} <span className="text-2xs capitalize text-surface-400">({p.metadata?.leverageType ?? 'cross'})</span>
                    </Td>
                    <Td className={fund >= 0 ? 'text-win-500' : 'text-loss-500'}>{fund >= 0 ? '' : '-'}${n(Math.abs(fund))}</Td>
                    <Td>
                      <div className="flex gap-1">
                        {(['limit', 'market', 'reverse'] as const).map((m) => (
                          <button
                            key={m}
                            onClick={() => setCloseTarget({ p, mode: m })}
                            disabled={!walletAddress}
                            className="rounded border border-surface-700 px-1.5 py-0.5 text-2xs capitalize text-surface-300 hover:bg-surface-800 disabled:opacity-40"
                          >
                            {m}
                          </button>
                        ))}
                      </div>
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
        ) : tab === 'trades' ? (
          trades.length === 0 ? <Empty>No trades yet.</Empty> : (
            <Table head={['Time', 'Market', 'Side', 'Size', 'Price', 'PnL']}>
              {trades.map((f) => (
                <tr key={f.historyId} className="border-b border-surface-800/60 tabular">
                  <Td className="text-surface-400">{new Date(f.executedAt).toLocaleTimeString()}</Td>
                  <Td className="font-medium text-surface-100">{f.symbol}</Td>
                  <Td className={f.side === 'BUY' ? 'text-win-500' : 'text-loss-500'}>{f.side}</Td>
                  <Td className="text-surface-100">{n(f.amount, 4)}</Td>
                  <Td className="text-surface-100">{n(f.price)}</Td>
                  <Td className={f.pnl != null && Number(f.pnl) >= 0 ? 'text-win-500' : 'text-loss-500'}>{f.pnl != null ? n(f.pnl) : '—'}</Td>
                </tr>
              ))}
            </Table>
          )
        ) : tab === 'funding' ? (
          funding.length === 0 ? <Empty>No funding payments.</Empty> : (
            <Table head={['Time', 'Market', 'Rate', 'Payment']}>
              {funding.map((f, i) => {
                const pay = Number(f.usdc);
                return (
                  <tr key={i} className="border-b border-surface-800/60 tabular">
                    <Td className="text-surface-400">{new Date(f.time).toLocaleString()}</Td>
                    <Td className="font-medium text-surface-100">{f.symbol}</Td>
                    <Td className="text-surface-100">{(Number(f.rate) * 100).toFixed(4)}%</Td>
                    <Td className={pay >= 0 ? 'text-win-500' : 'text-loss-500'}>{pay >= 0 ? '+' : '-'}${n(Math.abs(pay))}</Td>
                  </tr>
                );
              })}
            </Table>
          )
        ) : (
          orderHist.length === 0 ? <Empty>No order history.</Empty> : (
            <Table head={['Time', 'Market', 'Side', 'Price', 'Size', 'Status']}>
              {orderHist.map((o, i) => (
                <tr key={i} className="border-b border-surface-800/60 tabular">
                  <Td className="text-surface-400">{o.time ? new Date(o.time).toLocaleString() : '—'}</Td>
                  <Td className="font-medium text-surface-100">{o.symbol}</Td>
                  <Td className={o.side === 'BUY' ? 'text-win-500' : 'text-loss-500'}>{o.side}</Td>
                  <Td className="text-surface-100">{n(o.price)}</Td>
                  <Td className="text-surface-100">{n(o.amount, 4)}</Td>
                  <Td className="capitalize text-surface-400">{o.status}</Td>
                </tr>
              ))}
            </Table>
          )
        )}
      </div>

      {closeTarget && (
        <CloseModal
          target={closeTarget}
          onCancel={() => setCloseTarget(null)}
          onConfirm={async (opts) => {
            const { p, mode } = closeTarget;
            setCloseTarget(null);
            await onClose(p, mode, opts);
          }}
        />
      )}
    </div>
  );
}

/** Professional confirmation modal for Market / Limit / Reverse close (HL-style):
 * choose how much to close (size + % of position), set a limit price, see the
 * estimated realized PnL. Reverse always flips the whole position. */
function CloseModal({
  target,
  onConfirm,
  onCancel,
}: {
  target: { p: Position; mode: CloseMode };
  onConfirm: (opts: { size?: string; limitPrice?: string }) => void;
  onCancel: () => void;
}) {
  const { p, mode } = target;
  const base = p.symbol.replace('-USD', '');
  const full = Number(p.amount);
  const reverse = mode === 'reverse';
  const [size, setSize] = useState(p.amount);
  const [price, setPrice] = useState(p.markPrice);
  const title = reverse ? 'Reverse Position' : mode === 'limit' ? 'Limit Close' : 'Market Close';
  const opp = p.side === 'LONG' ? 'Sell' : 'Buy';

  const closeSize = reverse ? full : Math.min(Number(size) || 0, full);
  const pct = full > 0 ? (closeSize / full) * 100 : 0;
  const exit = mode === 'limit' ? Number(price) : Number(p.markPrice);
  const sign = p.side === 'LONG' ? 1 : -1;
  const estPnl = (exit - Number(p.entryPrice)) * closeSize * sign;
  const valid = reverse || closeSize > 0;

  return (
    <Modal open onClose={onCancel} title={title}>
      <div className="space-y-3 text-sm">
        <div className="space-y-1">
          <RowKV label="Market" value={p.symbol} />
          <RowKV label="Position" value={`${p.side} ${n(p.amount, 4)} ${base} · ${p.leverage}x`} />
          <RowKV label="Entry / Mark" value={`${n(p.entryPrice)} / ${n(p.markPrice)}`} />
        </div>

        {reverse ? (
          <p className="rounded border border-surface-800 bg-surface-900 p-2 text-xs text-surface-300">
            Flips the entire position: {opp} {n(full * 2, 4)} {base} at market (closes {base} {p.side} and opens the inverse).
          </p>
        ) : (
          <>
            <label className="block">
              <span className="text-xs text-surface-400">Close Size ({base})</span>
              <input value={size} onChange={(e) => setSize(e.target.value)} inputMode="decimal" className="input mt-1 tabular" />
            </label>
            <div className="grid grid-cols-4 gap-1">
              {[25, 50, 75, 100].map((q) => (
                <button
                  key={q}
                  onClick={() => setSize(String(+((full * q) / 100).toFixed(5)))}
                  className={`rounded py-1 text-2xs ${Math.abs(pct - q) < 0.5 ? 'bg-surface-700 text-surface-100' : 'bg-surface-800 text-surface-300 hover:bg-surface-700'}`}
                >
                  {q}%
                </button>
              ))}
            </div>
            {mode === 'limit' && (
              <label className="block">
                <span className="text-xs text-surface-400">Limit Price</span>
                <div className="mt-1 flex items-center gap-1">
                  <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" className="input tabular" />
                  <button onClick={() => setPrice(p.markPrice)} className="rounded border border-surface-700 px-2 py-1 text-2xs text-surface-300 hover:bg-surface-800">Mark</button>
                </div>
              </label>
            )}
            <div className="space-y-1 border-t border-surface-800 pt-2">
              <RowKV label="Closing" value={`${n(closeSize, 4)} ${base} (${pct.toFixed(0)}%)`} />
              <div className="flex justify-between">
                <span className="text-surface-400">Est. Realized PnL</span>
                <span className={`tabular ${estPnl >= 0 ? 'text-win-500' : 'text-loss-500'}`}>{estPnl >= 0 ? '+' : ''}${n(estPnl)}</span>
              </div>
            </div>
          </>
        )}

        <button
          onClick={() => onConfirm({ size: reverse ? undefined : String(closeSize), limitPrice: mode === 'limit' ? price : undefined })}
          disabled={!valid}
          className={`mt-1 w-full rounded py-2 font-semibold text-black disabled:opacity-40 ${reverse ? 'bg-info' : opp === 'Sell' ? 'bg-loss-500' : 'bg-win-500'}`}
        >
          Confirm {title}
        </button>
      </div>
    </Modal>
  );
}

function RowKV({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-surface-400">{label}</span>
      <span className="tabular text-surface-100">{value}</span>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="p-4 text-sm text-surface-400">{children}</div>;
}
function Table({ head, children }: { head: React.ReactNode[]; children: React.ReactNode }) {
  return (
    <table className="w-full text-xs">
      <thead className="sticky top-0 bg-surface-850 text-xs text-surface-300">
        <tr className="border-b border-surface-800">
          {head.map((h, i) => (
            <th key={i} className="px-3 py-2 text-left font-semibold">{h}</th>
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

