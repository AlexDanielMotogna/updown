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
      className="rounded border border-strong px-3 py-1.5 text-sm hover:bg-bg-elevated"
      title="Disconnect"
    >
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
