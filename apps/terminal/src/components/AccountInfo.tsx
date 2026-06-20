'use client';

import { useEffect, useState } from 'react';
import { useAccountStream } from '@/hooks/useAccountStream';
import { fetchSpotUsdc } from '@/lib/hlBalances';

const usd = (n: number) => `$${(Number.isFinite(n) ? n : 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const pct = (s?: string) => `${(Number(s ?? 0) * 100).toFixed(4)}%`;

/** Account breakdown — always expanded, live over the WS account stream. */
export function AccountInfo({ evmAddress }: { evmAddress?: string }) {
  const { account: acct, orders } = useAccountStream(evmAddress);
  const restingValue = orders.reduce((s, o) => s + Number(o.price) * Number(o.remaining), 0);
  const [spot, setSpot] = useState<number | null>(null);

  // Spot balance isn't in clearinghouseState (perps) — poll spotClearinghouseState.
  useEffect(() => {
    if (!evmAddress) { setSpot(null); return; }
    let alive = true;
    const load = () => fetchSpotUsdc(evmAddress).then((v) => alive && setSpot(v));
    load();
    const id = window.setInterval(load, 10000);
    return () => { alive = false; window.clearInterval(id); };
  }, [evmAddress]);

  const meta = (acct?.metadata ?? {}) as { totalNtlPos?: string; crossMaintenanceMarginUsed?: string };
  const equity = Number(acct?.accountEquity ?? 0); // perps account value
  const balance = Number(acct?.balance ?? 0); // perps USDC balance
  const ntl = Number(meta.totalNtlPos ?? 0);
  const upnl = Number(acct?.unrealizedPnl ?? 0);
  const maint = Number(meta.crossMaintenanceMarginUsed ?? 0);
  const crossLev = equity > 0 ? ntl / equity : 0;
  const crossMarginRatio = equity > 0 ? (maint / equity) * 100 : 0;
  const total = (spot ?? 0) + equity;

  return (
    <div className="pt-2 text-xs">
      <div className="flex w-full items-center justify-between text-surface-400">
        <span>Account Info</span>
        <span className="text-surface-200">{usd(total)}</span>
      </div>

      <div className="mt-3 space-y-3">
        <Section title="Account Equity">
          <Row label="Spot" value={spot == null ? '…' : usd(spot)} />
          <Row label="Perps" value={usd(equity)} />
        </Section>

        <Section title="Perps Overview">
          <Row label="Balance" value={usd(balance)} />
          <Row label="Unrealized PnL" value={`${upnl >= 0 ? '+' : ''}${usd(upnl)}`} cls={upnl >= 0 ? 'text-win-500' : 'text-loss-500'} />
          <Row label="Cross Margin Ratio" value={`${crossMarginRatio.toFixed(2)}%`} />
          <Row label="Maintenance Margin" value={usd(maint)} />
          <Row label="Cross Account Leverage" value={`${crossLev.toFixed(2)}x`} />
          <Row label="Idle Balance" value={usd(Number(acct?.availableToSpend ?? 0))} />
          <Row label="Resting Order Value" value={usd(restingValue)} />
          <Row label="Fees (maker/taker)" value={`${pct(acct?.makerFee)} / ${pct(acct?.takerFee)}`} />
        </Section>

        <div className="flex items-center gap-1 text-2xs text-win-500">
          <span className="h-1.5 w-1.5 rounded-full bg-win-500" /> Real-time updates
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-2xs uppercase tracking-wide text-surface-500">{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Row({ label, value, cls }: { label: string; value: React.ReactNode; cls?: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-surface-400">{label}</span>
      <span className={`tabular text-surface-200 ${cls ?? ''}`}>{value}</span>
    </div>
  );
}
