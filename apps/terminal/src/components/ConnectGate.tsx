'use client';

import { usePrivy } from '@privy-io/react-auth';
import { useIdentity } from '@/hooks/useIdentity';

/**
 * Connect gate for the PLACE-ORDER panel. The terminal trades perps on
 * HyperLiquid (an EVM chain), so placing orders needs a connected EVM wallet that
 * isn't already bound to another UpDown account (bind-once). This overlays ONLY
 * the order panel — the chart and market data stay open to everyone.
 *
 * Skipped in local dev (NEXT_PUBLIC_DEV_EVM_ADDRESS) and when Privy isn't
 * configured (so the panel still renders without an auth flow).
 */
export function ConnectGate({ devEvm }: { devEvm?: string }) {
  if (devEvm) return null;
  if (!process.env.NEXT_PUBLIC_PRIVY_APP_ID) return null;
  return <Gate />;
}

/** Two nodes (wallet ↔ UpDown) with dots flowing between them — a live
 * "making the connection" animation. `danger` recolors it for the conflict state. */
function ConnectAnim({ danger = false }: { danger?: boolean }) {
  const accent = danger ? 'text-loss-500' : 'text-brand';
  const dot = danger ? 'bg-loss-500' : 'bg-brand';
  const ring = danger ? 'border-loss-500/30 bg-loss-500/10' : 'border-brand/30 bg-brand/10';
  return (
    <div className="flex items-center justify-center gap-2.5">
      <style>{`@keyframes ud-flow{0%,100%{opacity:.2;transform:scale(.7)}50%{opacity:1;transform:scale(1.1)}}`}</style>
      {/* wallet node */}
      <span className={`flex h-11 w-11 items-center justify-center rounded-xl border ${ring} ${accent}`}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2" />
          <path d="M16 12h5" />
          <circle cx="16.5" cy="12" r="1.4" fill="currentColor" stroke="none" />
        </svg>
      </span>
      {/* flowing dots */}
      <div className="flex items-center gap-1.5">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={`h-1.5 w-1.5 rounded-full ${dot}`}
            style={{ animation: 'ud-flow 1.2s ease-in-out infinite', animationDelay: `${i * 0.16}s` }}
          />
        ))}
      </div>
      {/* UpDown node */}
      <span className={`flex h-11 w-11 items-center justify-center rounded-xl border ${ring}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/updown-logos/Logo_48px_Cyan_Transparent.png" alt="UpDown" className="h-6 w-6" />
      </span>
    </div>
  );
}

const EVM_WALLETS = ['MetaMask', 'Rabby', 'WalletConnect', 'Coinbase'];

/** Clean full-panel overlay (no bordered modal) — gradient + blur, content stacked. */
function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="animate-fade-in absolute inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-gradient-to-b from-surface-950/92 to-surface-900/96 px-5 text-center backdrop-blur-md">
      {children}
    </div>
  );
}

const btnPrimary =
  'w-full rounded-lg bg-brand py-2.5 text-sm font-semibold text-surface-950 transition-colors hover:bg-brand-600';
const btnGhost =
  'w-full rounded-lg border border-surface-700 py-2 text-sm font-medium text-surface-400 transition-colors hover:bg-surface-800 hover:text-surface-100';

function Gate() {
  const { ready, authenticated, login, connectWallet, logout } = usePrivy();
  const { evmAddress, linkConflict } = useIdentity();

  // Gate down — an EVM wallet is connected and it's ours.
  if (ready && authenticated && evmAddress && !linkConflict) return null;

  if (!ready) {
    return (
      <Overlay>
        <ConnectAnim />
        <p className="text-sm text-surface-400">Connecting…</p>
      </Overlay>
    );
  }

  if (linkConflict) {
    return (
      <Overlay>
        <ConnectAnim danger />
        <div className="space-y-1.5">
          <h2 className="text-base font-bold text-surface-100">Wallet already linked</h2>
          <p className="text-xs leading-relaxed text-surface-400">
            This HyperLiquid wallet is linked to another UpDown account. Each HL account works with
            only one UpDown account.
          </p>
        </div>
        <div className="w-full max-w-[15rem] space-y-2">
          <button onClick={() => connectWallet({ walletChainType: 'ethereum-only' })} className={btnPrimary}>
            Connect a different wallet
          </button>
          <button onClick={logout} className={btnGhost}>
            Disconnect
          </button>
        </div>
      </Overlay>
    );
  }

  if (!authenticated) {
    return (
      <Overlay>
        <ConnectAnim />
        <div className="space-y-1.5">
          <h2 className="text-base font-bold text-surface-100">Connect to trade</h2>
          <p className="text-xs leading-relaxed text-surface-400">
            Charts &amp; market data are open to all. Connect a wallet to place orders.
          </p>
        </div>
        <button onClick={login} className={`${btnPrimary} max-w-[15rem]`}>
          Connect wallet
        </button>
      </Overlay>
    );
  }

  // Authenticated but no EVM wallet (e.g. signed in with email or Solana only).
  return (
    <Overlay>
      <ConnectAnim />
      <div className="space-y-1.5">
        <h2 className="text-base font-bold text-surface-100">Connect an EVM wallet</h2>
        <p className="text-xs leading-relaxed text-surface-400">
          HyperLiquid runs on an <span className="text-surface-200">EVM chain</span> — a Solana wallet
          alone won&apos;t work for trading.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-1.5">
        {EVM_WALLETS.map((w) => (
          <span key={w} className="rounded-md bg-surface-800/80 px-2 py-1 text-2xs font-medium text-surface-300">
            {w}
          </span>
        ))}
      </div>
      <div className="w-full max-w-[15rem] space-y-2">
        <button onClick={() => connectWallet({ walletChainType: 'ethereum-only' })} className={btnPrimary}>
          Connect EVM wallet
        </button>
        <button onClick={logout} className={btnGhost}>
          Disconnect
        </button>
      </div>
    </Overlay>
  );
}
