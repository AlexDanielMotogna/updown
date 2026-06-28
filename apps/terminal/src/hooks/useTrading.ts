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

/** Query the max builder fee the user has approved for `builder`. Returns the
 * number (0 = none), or `null` when the check itself couldn't run (network / !ok)
 * — callers must treat null as "unknown" (fail-open), NOT as "not approved". */
async function fetchMaxBuilderFee(user: string, builder: string): Promise<number | null> {
  try {
    const r = await fetch(`${HL_API}/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'maxBuilderFee', user, builder }),
    });
    if (!r.ok) return null;
    const v = await r.json();
    return typeof v === 'number' ? v : Number.isFinite(Number(v)) ? Number(v) : null;
  } catch {
    return null;
  }
}

/** Remember a confirmed builder-fee approval locally so a later flaky check can't
 * re-nag on every refresh (the order path self-heals if it's ever truly missing). */
function builderOkKey(user: string) {
  return `updown-builder-ok:${IS_TESTNET ? 't' : 'm'}:${user.toLowerCase()}`;
}
function getBuilderOk(user: string): boolean {
  try { return localStorage.getItem(builderOkKey(user)) === '1'; } catch { return false; }
}
function setBuilderOk(user: string) {
  try { localStorage.setItem(builderOkKey(user), '1'); } catch { /* ignore */ }
}

/**
 * Is `agent` currently an approved API/agent wallet for `account` on HL? The DB
 * can hold a STALE agent — HL identifies agents by name, so approving a new agent
 * (e.g. on another device/env with the same account) revokes the old one while the
 * DB still points at it, and every order then fails "User or API Wallet … does not
 * exist". We verify on-chain and re-prompt Enable Trading when it's gone.
 * Fail-OPEN (returns true) on a network hiccup so we don't nag spuriously.
 */
async function isAgentApproved(account: string, agent: string): Promise<boolean> {
  try {
    const r = await fetch(`${HL_API}/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'extraAgents', user: account }),
    });
    if (!r.ok) return true;
    const agents = (await r.json()) as Array<{ address?: string }> | null;
    if (!Array.isArray(agents)) return true;
    return agents.some((a) => a?.address?.toLowerCase() === agent.toLowerCase());
  } catch {
    return true;
  }
}

/**
 * Per-environment agent name. HL keys agents by NAME, so the same name + same
 * account means approving in one place revokes the agent elsewhere. Suffix dev
 * envs so local testing never revokes the deployed terminal's agent (and vice
 * versa). localhost → "updown-terminal-dev"; deployed → "updown-terminal".
 */
function agentName(): string {
  // HyperLiquid caps the agent name at 16 chars: "updown-terminal" (15) for prod,
  // a distinct ≤16-char "updown-term-dev" (15) for local so they don't collide.
  if (typeof window !== 'undefined') {
    const h = window.location.hostname;
    if (h === 'localhost' || h === '127.0.0.1' || h.endsWith('.local')) return 'updown-term-dev';
  }
  return 'updown-terminal';
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
  // null = unknown/checking (fail-open), false = confirmed NOT approved on-chain.
  const [agentLive, setAgentLive] = useState<boolean | null>(null);

  const refresh = useCallback(() => {
    if (walletAddress) getConnection(walletAddress).then(setConn);
    else setConn(null);
  }, [walletAddress]);

  useEffect(() => { refresh(); }, [refresh]);

  // Verify the stored agent is still approved on-chain (catches a revoked/stale
  // agent so we re-prompt Enable Trading instead of failing every order).
  useEffect(() => {
    if (!conn?.active || !conn.agentAddress || !evmAddress) { setAgentLive(null); return; }
    let alive = true;
    setAgentLive(null);
    isAgentApproved(evmAddress, conn.agentAddress).then((ok) => { if (alive) setAgentLive(ok); });
    return () => { alive = false; };
  }, [conn?.active, conn?.agentAddress, evmAddress]);

  // Check whether the builder fee is approved once the agent connection is active.
  // Fail-OPEN: once approved (remembered locally) we trust it and never re-nag, and
  // a check that couldn't run (null) never downgrades to "not approved" — otherwise
  // the burst of HL calls on each refresh occasionally returns 0/errs and re-prompts.
  const refreshBuilder = useCallback(async () => {
    if (!evmAddress || !BUILDER_ADDRESS || !conn?.active) { setBuilderApproved(null); return; }
    if (getBuilderOk(evmAddress)) { setBuilderApproved(true); return; }
    const max = await fetchMaxBuilderFee(evmAddress, BUILDER_ADDRESS);
    if (max == null) return; // couldn't check — leave as-is (no false "not approved")
    if (max > 0) { setBuilderOk(evmAddress); setBuilderApproved(true); }
    else setBuilderApproved(false);
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
      await client.approveAgent({ agentAddress: gen.data.agentAddress, agentName: agentName() });
      // 2) Approve the builder fee so builder-coded orders aren't rejected.
      if (BUILDER_ADDRESS) {
        await client.approveBuilderFee({ maxFeeRate: BUILDER_MAX_FEE, builder: BUILDER_ADDRESS });
        setBuilderOk(evmAddress);
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
    setBuilderOk(evmAddress);
    setBuilderApproved(true); // optimistic; remembered locally so it won't re-nag
    return true;
  }, [evmAddress, wallets]);

  // Enabled only if the connection is active AND the agent hasn't been confirmed
  // revoked on-chain (agentLive === false). null/true → treat as enabled (fail-open).
  return { conn, enabled: !!conn?.active && agentLive !== false, builderApproved, busy, enableTrading, approveBuilder, refresh };
}
