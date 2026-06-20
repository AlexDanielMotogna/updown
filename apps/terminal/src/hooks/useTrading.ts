'use client';

import { useCallback, useEffect, useState } from 'react';
import { useWallets } from '@privy-io/react-auth';
import { confirmAgent, generateAgent, getConnection, IS_TESTNET, type ConnectionStatus } from '@/lib/api';
import { useToast } from '@/components/Toast';

// Lowercased so it's byte-identical to the order's builder `b` (HL matches by
// exact address). Must match apps/api HYPERLIQUID_BUILDER_ADDRESS.
const BUILDER_ADDRESS = process.env.NEXT_PUBLIC_HYPERLIQUID_BUILDER_ADDRESS?.toLowerCase() as `0x${string}` | undefined;
// maxFeeRate is a PERCENT STRING (e.g. "0.1%"), NOT bps. 0.1% covers any perp
// order (cap), well above the API's f=50 → 0.05%.
const BUILDER_MAX_FEE = process.env.NEXT_PUBLIC_HYPERLIQUID_BUILDER_MAX_FEE ?? '0.1%';

const HL_API =
  process.env.NEXT_PUBLIC_HYPERLIQUID_API_URL ??
  (IS_TESTNET ? 'https://api.hyperliquid-testnet.xyz' : 'https://api.hyperliquid.xyz');

/** Query the max builder fee the user has approved for `builder` (0 = none). */
async function fetchMaxBuilderFee(user: string, builder: string): Promise<number> {
  try {
    const r = await fetch(`${HL_API}/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'maxBuilderFee', user, builder }),
    });
    if (!r.ok) return 0;
    const v = await r.json();
    return typeof v === 'number' ? v : Number(v) || 0;
  } catch {
    return 0;
  }
}

export interface TradingState {
  conn: ConnectionStatus | null;
  /** Agent approved + active for this network → orders can be placed. */
  enabled: boolean;
  /** Whether the builder fee is approved for our builder (null = still checking). */
  builderApproved: boolean | null;
  busy: boolean;
  /** Run the one-time setup: approve agent + builder fee, then activate. */
  enableTrading: () => Promise<void>;
  /** Approve just the builder fee (e.g. for an agent enabled before this existed).
   * Returns true on success. Throws are surfaced to the caller. */
  approveBuilder: () => Promise<boolean>;
  refresh: () => void;
}

/**
 * Trading enablement (ADR-003 agent-wallet). On first use the user signs two L1
 * approvals in their wallet — the agent (lets the server place orders) and the
 * builder fee (so the API's builder-coded orders are accepted) — then we activate
 * the connection. The HL SDK is dynamically imported so it stays out of the
 * initial bundle (loaded only when the user actually enables trading).
 */
export function useTrading(walletAddress?: string, evmAddress?: string): TradingState {
  const { wallets } = useWallets();
  const toast = useToast();
  const [conn, setConn] = useState<ConnectionStatus | null>(null);
  const [builderApproved, setBuilderApproved] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    if (walletAddress) getConnection(walletAddress).then(setConn);
    else setConn(null);
  }, [walletAddress]);

  useEffect(() => { refresh(); }, [refresh]);

  // Check whether the builder fee is approved once the agent connection is active.
  const refreshBuilder = useCallback(async () => {
    if (!evmAddress || !BUILDER_ADDRESS || !conn?.active) { setBuilderApproved(null); return; }
    const max = await fetchMaxBuilderFee(evmAddress, BUILDER_ADDRESS);
    setBuilderApproved(max > 0);
  }, [evmAddress, conn?.active]);

  useEffect(() => { refreshBuilder(); }, [refreshBuilder]);

  const enableTrading = useCallback(async () => {
    if (!walletAddress || !evmAddress) {
      toast.show('error', 'Connect a wallet first');
      return;
    }
    setBusy(true);
    const tid = toast.loading('Enabling trading — approve in your wallet…');
    try {
      const gen = await generateAgent(walletAddress, evmAddress);
      if (!gen.success || !gen.data) throw new Error(gen.error?.message ?? 'Failed to generate agent');

      const wallet = wallets.find((w) => w.address.toLowerCase() === evmAddress.toLowerCase());
      if (!wallet) throw new Error('Connected EVM wallet not found');

      const [{ ExchangeClient, HttpTransport }, { createWalletClient, custom }] = await Promise.all([
        import('@nktkas/hyperliquid'),
        import('viem'),
      ]);
      const provider = await wallet.getEthereumProvider();
      const walletClient = createWalletClient({ account: evmAddress as `0x${string}`, transport: custom(provider) });
      const client = new ExchangeClient({ transport: new HttpTransport({ isTestnet: IS_TESTNET }), wallet: walletClient });

      // 1) Approve the agent (delegated signing key the server holds).
      await client.approveAgent({ agentAddress: gen.data.agentAddress, agentName: 'updown-terminal' });
      // 2) Approve the builder fee so builder-coded orders aren't rejected.
      if (BUILDER_ADDRESS) {
        await client.approveBuilderFee({ maxFeeRate: BUILDER_MAX_FEE, builder: BUILDER_ADDRESS });
        setBuilderApproved(true);
      }

      const confirmed = await confirmAgent(walletAddress);
      if (!confirmed.success) throw new Error(confirmed.error?.message ?? 'Failed to activate');
      setConn(confirmed.data ?? null);
      toast.update(tid, 'success', 'Trading enabled');
    } catch (e) {
      toast.update(tid, 'error', (e as Error).message || 'Failed to enable trading');
    } finally {
      setBusy(false);
    }
  }, [walletAddress, evmAddress, wallets, toast]);

  const approveBuilder = useCallback(async (): Promise<boolean> => {
    if (!BUILDER_ADDRESS) throw new Error('Builder address not configured (set NEXT_PUBLIC_HYPERLIQUID_BUILDER_ADDRESS and restart)');
    if (!evmAddress) throw new Error('Connect a wallet first');
    const wallet = wallets.find((w) => w.address.toLowerCase() === evmAddress.toLowerCase());
    if (!wallet) throw new Error('Connected EVM wallet not found');
    const [{ ExchangeClient, HttpTransport }, { createWalletClient, custom }] = await Promise.all([
      import('@nktkas/hyperliquid'),
      import('viem'),
    ]);
    const provider = await wallet.getEthereumProvider();
    const walletClient = createWalletClient({ account: evmAddress as `0x${string}`, transport: custom(provider) });
    const client = new ExchangeClient({ transport: new HttpTransport({ isTestnet: IS_TESTNET }), wallet: walletClient });
    await client.approveBuilderFee({ maxFeeRate: BUILDER_MAX_FEE, builder: BUILDER_ADDRESS });
    setBuilderApproved(true); // optimistic; the next check confirms
    void refreshBuilder();
    return true;
  }, [evmAddress, wallets, refreshBuilder]);

  return { conn, enabled: !!conn?.active, builderApproved, busy, enableTrading, approveBuilder, refresh };
}
