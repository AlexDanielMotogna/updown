'use client';

import { useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useIdentity } from '@/hooks/useIdentity';
import { linkEvm } from '@/lib/api';

/**
 * The only prerequisite the order button can't handle: an EVM-only Privy session
 * with no resolved UpDown (Solana) identity → a last-resort manual link. Sign in,
 * connect wallet, enable trading and builder approval all live on the order
 * button now, so this renders nothing in the common (SSO) case.
 */
function Setup() {
  const { ready, authenticated } = usePrivy();
  const { walletAddress, evmAddress } = useIdentity();
  const [solInput, setSolInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (!ready || !authenticated || !evmAddress || walletAddress) return null;

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
