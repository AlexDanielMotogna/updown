'use client';

import { useEffect, useState } from 'react';

interface Account {
  accountEquity: string;
  availableToSpend: string;
  marginUsed: string;
  unrealizedPnl: string;
  makerFee: string;
  takerFee: string;
  metadata?: { totalNtlPos?: string; crossMaintenanceMarginUsed?: string };
}

const usd = (n: number) => `$${(Number.isFinite(n) ? n : 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const pct = (s?: string) => `${(Number(s ?? 0) * 100).toFixed(4)}%`;

/** Collapsible account breakdown (matches TFC's "Account Info" dropdown). */
export function AccountInfo({ evmAddress }: { evmAddress?: string }) {
  const [open, setOpen] = useState(false);
  const [acct, setAcct] = useState<Account | null>(null);
  const [restingValue, setRestingValue] = useState(0);

  useEffect(() => {
    if (!evmAddress) {
      setAcct(null);
      return;
    }
    let alive = true;
    const tick = async () => {
      try {
        const [pos, ord] = await Promise.all([
          fetch(`/api/positions?address=${evmAddress}`, { cache: 'no-store' }).then((r) => r.json()),
          fetch(`/api/orders?address=${evmAddress}`, { cache: 'no-store' }).then((r) => r.json()),
        ]);
        if (!alive) return;
        if (pos.success) setAcct(pos.data.account);
        if (ord.success) {
          const rv = (ord.data as Array<{ price: string; remaining: string }>).reduce(
            (s, o) => s + Number(o.price) * Number(o.remaining),
            0
          );
          setRestingValue(rv);
        }
      } catch {/* keep */}
    };
    tick();
    const id = window.setInterval(tick, 5000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [evmAddress]);

  const equity = Number(acct?.accountEquity ?? 0);
  const ntl = Number(acct?.metadata?.totalNtlPos ?? 0);
  const upnl = Number(acct?.unrealizedPnl ?? 0);
  const crossLev = equity > 0 ? ntl / equity : 0;

  return (
    <div className="border-t border-surface-800 pt-2 text-xs">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between text-surface-400">
        <span>Account Info</span>
        <span className="flex items-center gap-1 text-surface-200">
          {usd(equity)}
          <svg width="10" height="10" viewBox="0 0 12 12" className={`text-surface-400 transition-transform ${open ? 'rotate-180' : ''}`}>
            <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
          </svg>
        </span>
      </button>

      {open && (
        <div className="mt-2 space-y-1 animate-fade-in">
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
      )}
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
