'use client';

import { usePrivy } from '@privy-io/react-auth';

function short(addr?: string) {
  return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : '';
}

function PrivyConnect() {
  const { ready, authenticated, login, logout, user } = usePrivy();
  if (!ready) return <span className="text-xs text-surface-400">…</span>;

  // Disconnected — UpDown's cyan-tinted connect button.
  if (!authenticated) {
    return (
      <button
        onClick={login}
        className="rounded bg-brand/[0.06] px-4 py-2 text-sm font-medium text-brand transition-colors hover:bg-brand/10"
      >
        Connect
      </button>
    );
  }

  const addr = user?.wallet?.address;
  const initials = (addr ?? '').slice(2, 4).toUpperCase();
  return (
    <button
      onClick={logout}
      className="flex items-center gap-2 rounded-md bg-white/[0.06] px-2 py-1.5 text-sm text-surface-100 transition-colors hover:bg-white/[0.1]"
      title="Disconnect"
    >
      <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-brand/20 text-2xs font-bold text-brand">
        {initials || '◈'}
      </span>
      <span className="hidden tabular sm:inline">{short(addr) || 'Connected'}</span>
    </button>
  );
}

export function ConnectButton() {
  // Rendered before any Privy hook so the UI works without Privy configured.
  if (!process.env.NEXT_PUBLIC_PRIVY_APP_ID) {
    return <span className="text-xs text-surface-400">Privy not configured</span>;
  }
  return <PrivyConnect />;
}
