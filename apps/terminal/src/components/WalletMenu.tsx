'use client';

import { useEffect, useRef, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useIdentity } from '@/hooks/useIdentity';
import { useAccountStream } from '@/hooks/useAccountStream';
import { fetchProfile, getConnection, IS_TESTNET, type UserProfile } from '@/lib/api';
import { fetchSpotUsdc } from '@/lib/hlBalances';

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const UP_COINS_DIVISOR = 100;

const short = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '');
const usd = (n: number) => `$${(Number.isFinite(n) ? n : 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

/** Connected-wallet chip + dropdown (UpDown app pattern, terminal-adapted). */
export function WalletMenu() {
  const { logout } = usePrivy();
  const { walletAddress, evmAddress } = useIdentity();
  const { account } = useAccountStream(evmAddress);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [spot, setSpot] = useState<number | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [tradingActive, setTradingActive] = useState<boolean | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const perps = account ? Number(account.accountEquity) : 0;
  const initials = (evmAddress ?? '').slice(2, 4).toUpperCase();

  useEffect(() => {
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // Load spot balance, UpDown profile + trading status when the menu opens.
  useEffect(() => {
    if (!open) return;
    if (evmAddress) fetchSpotUsdc(evmAddress).then(setSpot);
    if (walletAddress) {
      fetchProfile(walletAddress).then(setProfile);
      getConnection(walletAddress).then((c) => setTradingActive(!!c?.active));
    }
  }, [open, evmAddress, walletAddress]);

  function copy() {
    if (!evmAddress) return;
    navigator.clipboard?.writeText(evmAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-md bg-white/[0.06] px-2 py-1.5 text-sm text-surface-100 transition-colors hover:bg-white/[0.1]"
      >
        <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-brand/20 text-2xs font-bold text-brand">
          {initials || '◈'}
        </span>
        <span className="hidden tabular sm:inline">{short(evmAddress) || 'Account'}</span>
        <svg width="11" height="11" viewBox="0 0 12 12" className={`text-surface-400 transition-transform ${open ? 'rotate-180' : ''}`}>
          <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-[110] mt-2 w-72 max-w-[92vw] card-elevated animate-fade-in p-3 text-sm">
          {/* Identity */}
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand/20 text-xs font-bold text-brand">{initials || '◈'}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium text-surface-100">{profile?.displayName ?? short(evmAddress)}</div>
              <div className="flex items-center gap-1.5 text-2xs text-surface-400">
                <span className="font-mono">{short(evmAddress)}</span>
                <span className="rounded bg-surface-700 px-1 py-0.5 uppercase">{IS_TESTNET ? 'Testnet' : 'Mainnet'}</span>
              </div>
            </div>
            <button onClick={copy} className="rounded border border-surface-700 px-2 py-1 text-2xs text-surface-300 hover:bg-surface-800">
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>

          {/* Level / XP / UP coins — only if a UpDown profile exists */}
          {profile && (
            <div className="mt-3 rounded bg-white/[0.03] p-2.5">
              <div className="flex items-center justify-between text-2xs">
                <span className="font-semibold text-surface-100">LVL {profile.level} · {profile.title}</span>
                <span className="tabular text-surface-400">{(Number(profile.coinsBalance) / UP_COINS_DIVISOR).toLocaleString(undefined, { maximumFractionDigits: 2 })} UP</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-700">
                <div className="h-full bg-brand" style={{ width: `${Math.round((profile.xpProgress ?? 0) * 100)}%` }} />
              </div>
            </div>
          )}

          {/* HL account */}
          <div className="mt-3 space-y-1.5 text-xs">
            <div className="text-2xs uppercase tracking-wide text-surface-500">HyperLiquid</div>
            <Row label="Perps equity" value={usd(perps)} />
            <Row label="Spot" value={spot == null ? '…' : usd(spot)} />
            <Row
              label="Trading"
              value={tradingActive == null ? '…' : tradingActive ? 'Enabled' : 'Not enabled'}
              cls={tradingActive ? 'text-win-500' : 'text-surface-300'}
            />
          </div>

          {/* Links + disconnect */}
          <div className="mt-3 space-y-1 border-t border-white/[0.06] pt-3">
            <a href={`${APP_URL}/profile`} className="block rounded px-2 py-1.5 text-surface-200 hover:bg-white/[0.04]">Profile ↗</a>
            <a href={`${APP_URL}/`} className="block rounded px-2 py-1.5 text-surface-200 hover:bg-white/[0.04]">Markets ↗</a>
            <button onClick={() => { setOpen(false); logout(); }} className="block w-full rounded px-2 py-1.5 text-left text-loss-500 hover:bg-loss-500/10">
              Disconnect
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-surface-400">{label}</span>
      <span className={`tabular ${cls ?? 'text-surface-100'}`}>{value}</span>
    </div>
  );
}
