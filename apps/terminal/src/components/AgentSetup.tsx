'use client';

import { useEffect, useState } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { ExchangeClient, HttpTransport } from '@nktkas/hyperliquid';
import { createWalletClient, custom } from 'viem';
import { useIdentity } from '@/hooks/useIdentity';
import { IS_TESTNET, confirmAgent, generateAgent, getConnection, linkEvm, type ConnectionStatus } from '@/lib/api';

/**
 * One-time trading setup (ADR-003 agent-wallet). Connect EVM wallet → (link to
 * UpDown identity) → generate agent → sign approveAgent in the browser → confirm.
 * After this, orders are placed by the server with the delegated agent key.
 *
 * Note: client-side approveAgent imports the HL SDK (acceptable here — setup
 * page, not the hot path) and signs with the Privy EVM wallet. Browser-verified
 * flow (needs a Privy app with EVM enabled + a funded testnet account).
 */
function Setup() {
  const { ready, authenticated, login } = usePrivy();
  const { wallets } = useWallets();
  const { evmAddress, walletAddress, linked } = useIdentity();
  const [conn, setConn] = useState<ConnectionStatus | null>(null);
  const [solInput, setSolInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (walletAddress) getConnection(walletAddress).then(setConn);
  }, [walletAddress]);

  if (!ready) return <Card>…</Card>;

  if (!authenticated) {
    return (
      <Card>
        <p className="mb-2 text-muted">Connect your EVM wallet to trade on HyperLiquid.</p>
        <button onClick={login} className="rounded bg-up px-3 py-1.5 font-semibold text-black">Connect wallet</button>
      </Card>
    );
  }

  // Authenticated but the EVM wallet isn't linked to an UpDown identity yet.
  if (!linked) {
    return (
      <Card>
        <p className="mb-2 text-muted">
          Link this EVM wallet ({short(evmAddress)}) to your UpDown account.
        </p>
        <div className="flex gap-2">
          <input
            value={solInput}
            onChange={(e) => setSolInput(e.target.value)}
            placeholder="Your UpDown (Solana) wallet"
            className="flex-1 rounded border border-border bg-bg-app px-2 py-1.5 outline-none focus:border-strong"
          />
          <button
            disabled={!solInput || !evmAddress || busy}
            onClick={async () => {
              if (!evmAddress) return;
              setBusy(true);
              const res = await linkEvm(solInput.trim(), evmAddress, 'privy');
              setBusy(false);
              setMsg(res.success ? { ok: true, text: 'Linked — reload to continue' } : { ok: false, text: res.error?.message ?? 'Link failed' });
            }}
            className="rounded bg-up px-3 py-1.5 font-semibold text-black disabled:opacity-40"
          >
            Link
          </button>
        </div>
        {msg && <p className={`mt-2 text-xs ${msg.ok ? 'text-up' : 'text-down'}`}>{msg.text}</p>}
      </Card>
    );
  }

  if (conn?.active) {
    return (
      <Card>
        <p className="text-up">✓ Trading enabled</p>
        <p className="mt-1 text-xs text-muted">agent {short(conn.agentAddress)} · {conn.isTestnet ? 'testnet' : 'mainnet'}</p>
      </Card>
    );
  }

  async function setup() {
    if (!walletAddress || !evmAddress) return;
    setBusy(true);
    setMsg(null);
    try {
      // 1) server generates a pending agent
      const gen = await generateAgent(walletAddress, evmAddress);
      if (!gen.success || !gen.data) throw new Error(gen.error?.message ?? 'generate failed');

      // 2) approve the agent on-chain, signed by the user's EVM wallet
      const wallet = wallets.find((w) => w.address === evmAddress);
      if (!wallet) throw new Error('EVM wallet not found');
      const provider = await wallet.getEthereumProvider();
      const walletClient = createWalletClient({ account: evmAddress as `0x${string}`, transport: custom(provider) });
      const client = new ExchangeClient({ transport: new HttpTransport({ isTestnet: IS_TESTNET }), wallet: walletClient });
      await client.approveAgent({ agentAddress: gen.data.agentAddress, agentName: 'updown-terminal' });

      // 3) activate the connection
      const confirmed = await confirmAgent(walletAddress);
      if (!confirmed.success) throw new Error(confirmed.error?.message ?? 'confirm failed');
      setConn(confirmed.data ?? null);
      setMsg({ ok: true, text: 'Agent approved — trading enabled' });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <p className="mb-2 text-muted">Approve a trading agent so the terminal can place orders for you.</p>
      <button onClick={setup} disabled={busy} className="rounded bg-up px-3 py-1.5 font-semibold text-black disabled:opacity-40">
        {busy ? 'Setting up…' : 'Enable trading'}
      </button>
      {msg && <p className={`mt-2 text-xs ${msg.ok ? 'text-up' : 'text-down'}`}>{msg.text}</p>}
    </Card>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded border border-border bg-bg-surface p-3 text-sm">{children}</div>;
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
