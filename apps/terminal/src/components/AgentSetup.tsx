'use client';

import { useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useIdentity } from '@/hooks/useIdentity';
import { useTrading } from '@/hooks/useTrading';
import { linkEvm } from '@/lib/api';

/**
 * Trading prerequisites + status (ADR-003 agent-wallet, ADR-002 SSO). The actual
 * "Enable Trading" action lives on the order button (so it's visible where you
 * trade); this card only handles the prerequisites — sign in, connect an EVM
 * wallet, link the UpDown identity — and shows the enabled status.
 */
function Setup() {
  const { ready, authenticated, login, linkWallet } = usePrivy();
  const { walletAddress, evmAddress } = useIdentity();
  const { conn, enabled } = useTrading(walletAddress, evmAddress);
  const [solInput, setSolInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (!ready) return <Card>…</Card>;

  if (!authenticated) {
    return (
      <Card>
        <p className="mb-2 text-surface-400">Sign in to trade on HyperLiquid.</p>
        <button onClick={login} className="rounded bg-surface-100 px-3 py-1.5 font-semibold text-surface-900 hover:bg-surface-200">Sign in</button>
      </Card>
    );
  }

  // No EVM wallet in the session yet → connect/link one (Privy handles it).
  if (!evmAddress) {
    return (
      <Card>
        <p className="mb-2 text-surface-400">Connect an EVM wallet for HyperLiquid.</p>
        <button onClick={linkWallet} className="rounded bg-surface-100 px-3 py-1.5 font-semibold text-surface-900 hover:bg-surface-200">Connect EVM wallet</button>
      </Card>
    );
  }

  // EVM connected but no UpDown identity resolved (EVM-only session never linked)
  // → last-resort manual link. The common case (Solana in session) skips this.
  if (!walletAddress) {
    return (
      <Card>
        <p className="mb-2 text-surface-400">Link this EVM wallet ({short(evmAddress)}) to your UpDown account.</p>
        <div className="flex gap-2">
          <input
            value={solInput}
            onChange={(e) => setSolInput(e.target.value)}
            placeholder="Your UpDown (Solana) wallet"
            className="flex-1 rounded border border-surface-700 bg-[#1c1c23] px-2 py-1.5 outline-none focus:border-surface-500"
          />
          <button
            disabled={!solInput || busy}
            onClick={async () => {
              setBusy(true);
              const res = await linkEvm(solInput.trim(), evmAddress, 'privy');
              setBusy(false);
              setMsg(res.success ? { ok: true, text: 'Linked — reload to continue' } : { ok: false, text: res.error?.message ?? 'Link failed' });
            }}
            className="rounded bg-surface-100 px-3 py-1.5 font-semibold text-surface-900 hover:bg-surface-200 disabled:opacity-40"
          >
            Link
          </button>
        </div>
        {msg && <p className={`mt-2 text-xs ${msg.ok ? 'text-win-500' : 'text-loss-500'}`}>{msg.text}</p>}
      </Card>
    );
  }

  if (enabled) {
    return (
      <Card>
        <p className="text-win-500">✓ Trading enabled</p>
        <p className="mt-1 text-xs text-surface-400">agent {short(conn?.agentAddress)} · {conn?.isTestnet ? 'testnet' : 'mainnet'}</p>
      </Card>
    );
  }

  // Prerequisites met but not yet enabled → the order button shows "Enable Trading".
  return null;
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="card p-3 text-sm">{children}</div>;
}
function short(a?: string) {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '';
}

export function AgentSetup() {
  if (!process.env.NEXT_PUBLIC_PRIVY_APP_ID) {
    return <Card>Privy not configured — set NEXT_PUBLIC_PRIVY_APP_ID.</Card>;
  }
  return <Setup />;
}
