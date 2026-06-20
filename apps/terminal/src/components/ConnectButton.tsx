'use client';

import { usePrivy } from '@privy-io/react-auth';
import { WalletMenu } from './WalletMenu';

function PrivyConnect() {
  const { ready, authenticated, login } = usePrivy();
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

  // Connected — account dropdown (address, balances, level, links, disconnect).
  return <WalletMenu />;
}

export function ConnectButton() {
  // Rendered before any Privy hook so the UI works without Privy configured.
  if (!process.env.NEXT_PUBLIC_PRIVY_APP_ID) {
    return <span className="text-xs text-surface-400">Privy not configured</span>;
  }
  return <PrivyConnect />;
}
