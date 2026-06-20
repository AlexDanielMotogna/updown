'use client';

import { useAccountStream } from '@/hooks/useAccountStream';

const usd = (n: number) => `$${(Number.isFinite(n) ? n : 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const pct = (s?: string) => `${(Number(s ?? 0) * 100).toFixed(4)}%`;

/** Account breakdown — always expanded, live over the WS account stream. */
export function AccountInfo({ evmAddress }: { evmAddress?: string }) {
  const { account: acct, orders } = useAccountStream(evmAddress);
  const restingValue = orders.reduce((s, o) => s + Number(o.price) * Number(o.remaining), 0);

  const equity = Number(acct?.accountEquity ?? 0);
  const ntl = Number((acct?.metadata as { totalNtlPos?: string } | undefined)?.totalNtlPos ?? 0);
  const upnl = Number(acct?.unrealizedPnl ?? 0);
  const crossLev = equity > 0 ? ntl / equity : 0;

  return (
    <div className="pt-2 text-xs">
      <div className="flex w-full items-center justify-between text-surface-400">
        <span>Account Info</span>
        <span className="text-surface-200">{usd(equity)}</span>
      </div>

      <div className="mt-2 space-y-1">
          <Row label="Account Equity" value={usd(equity)} />
          <Row label="Idle Balance" value={usd(Number(acct?.availableToSpend ?? 0))} />
          <Row label="Resting Order Value" value={usd(restingValue)} />
          <Row label="Fees (maker/taker)" value={`${pct(acct?.makerFee)} / ${pct(acct?.takerFee)}`} />
          <Row label="Unrealized PnL" value={`${upnl >= 0 ? '+' : ''}${usd(upnl)}`} cls={upnl >= 0 ? 'text-win-500' : 'text-loss-500'} />
          <Row label="Cross Account Leverage" value={`${crossLev.toFixed(2)}x`} />
          <Row label="Maintenance Margin" value={usd(Number(acct?.metadata?.crossMaintenanceMarginUsed ?? 0))} />
          <Row
            label="Real-time Updates"
            value={
              <span className="flex items-center gap-1 text-win-500">
                <span className="h-1.5 w-1.5 rounded-full bg-win-500" /> Live
              </span>
            }
          />
      </div>
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
