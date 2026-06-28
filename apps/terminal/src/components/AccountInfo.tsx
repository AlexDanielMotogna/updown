'use client';

import { useEffect, useState } from 'react';
import { useAccountStream } from '@/hooks/useAccountStream';
import { fetchSpotUsdc, fetchSpotAccountValue, fetchUserFees } from '@/lib/hlBalances';

const usd = (n: number) => `$${(Number.isFinite(n) ? n : 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const signedUsd = (n: number) => `${n >= 0 ? '+' : '-'}$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const pct = (n: number) => `${(n * 100).toFixed(4)}%`;

/** Account breakdown — always expanded, live over the WS account stream. `spot`
 * selects the spot fee schedule (HL charges different maker/taker for spot). */
export function AccountInfo({ evmAddress, spot: spotKind = false }: { evmAddress?: string; spot?: boolean }) {
  const { account: acct, orders } = useAccountStream(evmAddress);
  const restingValue = orders.reduce((s, o) => s + Number(o.price) * Number(o.remaining), 0);
  const [spotUsdc, setSpotUsdc] = useState<number | null>(null);
  const [spotValue, setSpotValue] = useState<number | null>(null);
  const [fees, setFees] = useState<{ maker: number; taker: number; spotMaker: number; spotTaker: number } | null>(null);

  // Spot balances + fee rates aren't in the perps clearinghouseState — poll the
  // info endpoints. All live (10s), per-account, never hardcoded.
  useEffect(() => {
    if (!evmAddress) { setSpotUsdc(null); setSpotValue(null); setFees(null); return; }
    let alive = true;
    const load = () => {
      fetchSpotUsdc(evmAddress).then((v) => alive && setSpotUsdc(v));
      fetchSpotAccountValue(evmAddress).then((v) => alive && setSpotValue(v));
      fetchUserFees(evmAddress).then((v) => alive && v && setFees(v));
    };
    load();
    const id = window.setInterval(load, 10000);
    return () => { alive = false; window.clearInterval(id); };
  }, [evmAddress]);

  const meta = (acct?.metadata ?? {}) as { totalNtlPos?: string; crossMaintenanceMarginUsed?: string };
  const equity = Number(acct?.accountEquity ?? 0); // perps account value (incl. uPnL)
  const ntl = Number(meta.totalNtlPos ?? 0);
  const upnl = Number(acct?.unrealizedPnl ?? 0);
  const balance = equity - upnl; // realized margin balance (HL "Balance")
  const maint = Number(meta.crossMaintenanceMarginUsed ?? 0);
  const crossLev = equity > 0 ? ntl / equity : 0;
  const crossMarginRatio = equity > 0 ? (maint / equity) * 100 : 0;
  // Spot equity = full value (USDC + tokens); fall back to USDC-only until it loads.
  const spotEquity = spotValue ?? spotUsdc;
  const holdingsValue = spotValue != null && spotUsdc != null ? Math.max(0, spotValue - spotUsdc) : null;
  const total = (spotEquity ?? 0) + equity;
  const feeMaker = fees ? (spotKind ? fees.spotMaker : fees.maker) : null;
  const feeTaker = fees ? (spotKind ? fees.spotTaker : fees.taker) : null;

  return (
    <div className="pt-2 text-xs">
      <div className="flex w-full items-center justify-between text-surface-400">
        <span>Account Info</span>
        <span className="text-surface-200">{usd(total)}</span>
      </div>

      <div className="mt-3 space-y-3">
        <Section title="Account Equity">
          <Row label="Spot" value={spotEquity == null ? '…' : usd(spotEquity)} />
          <Row label="Perps" value={usd(equity)} />
        </Section>

        {spotKind ? (
          <Section title="Spot Overview">
            <Row label="Account Value" value={spotValue == null ? '…' : usd(spotValue)} />
            <Row label="Available (USDC)" value={spotUsdc == null ? '…' : usd(spotUsdc)} />
            <Row label="Holdings Value" value={holdingsValue == null ? '…' : usd(holdingsValue)} />
            <Row label="Fees (maker/taker)" value={fees ? `${pct(feeMaker!)} / ${pct(feeTaker!)}` : '…'} />
          </Section>
        ) : (
          <Section title="Perps Overview">
            <Row label="Balance" value={usd(balance)} />
            <Row label="Unrealized PnL" value={signedUsd(upnl)} cls={upnl >= 0 ? 'text-win-500' : 'text-loss-500'} />
            <Row
              label="Cross Margin Ratio"
              value={`${crossMarginRatio.toFixed(2)}%`}
              cls={crossMarginRatio >= 80 ? 'text-loss-500' : crossMarginRatio >= 50 ? 'text-warning' : 'text-win-500'}
            />
            <Row label="Maintenance Margin" value={usd(maint)} />
            <Row label="Cross Account Leverage" value={`${crossLev.toFixed(2)}x`} />
            <Row label="Idle Balance" value={usd(Number(acct?.availableToSpend ?? 0))} />
            <Row label="Resting Order Value" value={usd(restingValue)} />
            <Row label="Fees (maker/taker)" value={fees ? `${pct(feeMaker!)} / ${pct(feeTaker!)}` : '…'} />
          </Section>
        )}

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
      <span className={`tabular ${cls ?? 'text-surface-200'}`}>{value}</span>
    </div>
  );
}
