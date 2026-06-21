'use client';

import { usePrivy } from '@privy-io/react-auth';
import { useIdentity } from '@/hooks/useIdentity';

/**
 * Blocking connect gate. The terminal trades perps on HyperLiquid, which lives on
 * an EVM chain — so a user MUST connect an EVM wallet before the workspace is
 * usable. This overlays the terminal (the navbar stays visible) until an EVM
 * wallet is connected and is not already bound to another UpDown account
 * (bind-once, one HL account ↔ one UpDown account).
 *
 * Skipped in local dev (NEXT_PUBLIC_DEV_EVM_ADDRESS) and when Privy isn't
 * configured (so market data still works without an auth flow).
 */
export function ConnectGate({ devEvm }: { devEvm?: string }) {
  if (devEvm) return null;
  if (!process.env.NEXT_PUBLIC_PRIVY_APP_ID) return null;
  return <Gate />;
}

/** Animated connection icon — pulsing concentric rings around a wallet glyph. */
function PulseIcon({ danger = false }: { danger?: boolean }) {
  const ring = danger ? 'bg-loss-500/20' : 'bg-brand/20';
  const core = danger ? 'bg-loss-500/10 text-loss-500' : 'bg-brand/10 text-brand';
  return (
    <div className="relative flex h-20 w-20 items-center justify-center">
      <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${ring} opacity-60`} />
      <span className={`absolute inline-flex h-14 w-14 animate-pulse rounded-full ${ring}`} />
      <span className={`relative inline-flex h-16 w-16 items-center justify-center rounded-full ${core}`}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2" />
          <path d="M16 12h5" />
          <circle cx="16.5" cy="12" r="1.4" fill="currentColor" stroke="none" />
        </svg>
      </span>
    </div>
  );
}

const EVM_WALLETS = ['MetaMask', 'Rabby', 'WalletConnect', 'Coinbase'];

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-surface-950/80 p-4 backdrop-blur-sm">
      <div className="animate-fade-in w-full max-w-sm rounded-xl border border-surface-700 bg-surface-850 p-7 text-center shadow-elevated">
        {children}
      </div>
    </div>
  );
}

const btnPrimary =
  'mt-6 w-full rounded-lg bg-brand py-2.5 text-sm font-semibold text-surface-950 transition-colors hover:bg-brand-600';
const btnGhost =
  'mt-3 w-full rounded-lg border border-surface-700 py-2.5 text-sm font-medium text-surface-300 transition-colors hover:bg-surface-800 hover:text-surface-100';

function Gate() {
  const { ready, authenticated, login, connectWallet, logout } = usePrivy();
  const { evmAddress, linkConflict } = useIdentity();

  // Gate down — an EVM wallet is connected and it's ours.
  if (ready && authenticated && evmAddress && !linkConflict) return null;

  if (!ready) {
    return (
      <Card>
        <div className="flex justify-center">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-surface-700 border-t-brand" />
        </div>
        <p className="mt-5 text-sm text-surface-400">Connecting…</p>
      </Card>
    );
  }

  if (!authenticated) {
    return (
      <Card>
        <div className="flex justify-center">
          <PulseIcon />
        </div>
        <h2 className="mt-5 text-lg font-bold text-surface-100">Connect to start trading</h2>
        <p className="mt-2 text-sm leading-relaxed text-surface-400">
          UpDown Terminal trades perps on HyperLiquid. Connect your wallet to access the terminal.
        </p>
        <button onClick={login} className={btnPrimary}>
          Connect wallet
        </button>
      </Card>
    );
  }

  if (linkConflict) {
    return (
      <Card>
        <div className="flex justify-center">
          <PulseIcon danger />
        </div>
        <h2 className="mt-5 text-lg font-bold text-surface-100">Wallet already linked</h2>
        <p className="mt-2 text-sm leading-relaxed text-surface-400">
          This HyperLiquid wallet is already linked to another UpDown account. Each HyperLiquid
          account can be used with only one UpDown account. Connect a different wallet to continue.
        </p>
        <button onClick={connectWallet} className={btnPrimary}>
          Connect a different wallet
        </button>
        <button onClick={logout} className={btnGhost}>
          Disconnect
        </button>
      </Card>
    );
  }

  // Authenticated but no EVM wallet (e.g. signed in with email or Solana only).
  return (
    <Card>
      <div className="flex justify-center">
        <PulseIcon />
      </div>
      <h2 className="mt-5 text-lg font-bold text-surface-100">Connect an EVM wallet</h2>
      <p className="mt-2 text-sm leading-relaxed text-surface-400">
        HyperLiquid runs on an <span className="text-surface-200">EVM chain</span>, so trading needs an
        EVM wallet — a Solana wallet alone won&apos;t work.
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-1.5">
        {EVM_WALLETS.map((w) => (
          <span key={w} className="rounded-md bg-surface-800 px-2 py-1 text-2xs font-medium text-surface-300">
            {w}
          </span>
        ))}
      </div>
      <button onClick={connectWallet} className={btnPrimary}>
        Connect EVM wallet
      </button>
      <button onClick={logout} className={btnGhost}>
        Disconnect
      </button>
    </Card>
  );
}
