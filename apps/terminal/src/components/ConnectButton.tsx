'use client';

import { usePrivy } from '@privy-io/react-auth';

function short(addr?: string) {
  return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : '';
}

function PrivyConnect() {
  const { ready, authenticated, login, logout, user } = usePrivy();
  if (!ready) return <span className="text-muted text-xs">…</span>;

  if (!authenticated) {
    return (
      <button
        onClick={login}
        className="rounded bg-up/90 px-3 py-1.5 text-sm font-semibold text-black hover:bg-up"
      >
        Connect
      </button>
    );
  }

  const addr = user?.wallet?.address;
  return (
    <button
      onClick={logout}
      className="flex items-center gap-2 rounded border border-surface-700 bg-surface-850 px-2.5 py-1 text-sm hover:bg-surface-800"
      title="Disconnect"
    >
      <span className="h-4 w-4 rounded-full bg-gradient-to-br from-win-500 to-primary-500" />
      {short(addr) || 'Connected'}
    </button>
  );
}

export function ConnectButton() {
  // Rendered before any Privy hook so the UI works without Privy configured.
  if (!process.env.NEXT_PUBLIC_PRIVY_APP_ID) {
    return <span className="text-muted text-xs">Privy not configured</span>;
  }
  return <PrivyConnect />;
}
