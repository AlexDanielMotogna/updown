'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { linkEvm, registerUser, resolveIdentity } from '@/lib/api';

// ── Shared link state (module-level) ────────────────────────────────────────
// useIdentity is called by MANY components. The register+link must fire ONCE per
// (identity, evm), and its RESULT (linked / conflict) must be visible to ALL hook
// instances — otherwise the instance that wins the dedup is the only one that
// learns about a conflict, and the gate (a different instance) never blocks.
// So we keep the result in a module-level store and subscribe via
// useSyncExternalStore (survives re-renders, shared across instances).
type LinkStatus = 'linked' | 'conflict';
const linkResults = new Map<string, LinkStatus>(); // key → status
const linkInFlight = new Set<string>(); // key currently being requested
const linkSubs = new Set<() => void>();
function notifyLink() { linkSubs.forEach((fn) => fn()); }
function setLinkResult(key: string, status: LinkStatus) {
  if (linkResults.get(key) === status) return;
  linkResults.set(key, status);
  notifyLink();
}
function subscribeLink(cb: () => void) { linkSubs.add(cb); return () => { linkSubs.delete(cb); }; }

export interface Identity {
  ready: boolean;
  authenticated: boolean;
  /** UpDown identity = the Solana wallet (from the shared Privy session). */
  walletAddress?: string;
  /** The connected EVM wallet — the user's HyperLiquid account address. */
  evmAddress?: string;
  /** True once we have a usable identity (no manual linking needed). */
  linked: boolean;
  /** The connected EVM wallet is already bound to a DIFFERENT UpDown account. */
  linkConflict: boolean;
}

interface LinkedAccount {
  type: string;
  address?: string;
  chainType?: string;
  /** 'privy' = embedded wallet; anything else = an external wallet (MetaMask…). */
  walletClientType?: string;
}

/**
 * Terminal identity via the shared Privy session (ADR-002 SSO). With Solana +
 * Ethereum enabled on the same Privy app, one account carries both wallets:
 * the Solana wallet IS the UpDown identity; the EVM wallet is the HL account.
 * We read both from the session (no pasting). For an EVM-only session we fall
 * back to /resolve (a previously-linked identity). When both are present we
 * auto-link them server-side; if the EVM already belongs to ANOTHER UpDown
 * account the link is rejected (bind-once) and surfaced via `linkConflict`.
 */
export function useIdentity(): Identity {
  const { ready, authenticated, user } = usePrivy();
  const { wallets } = useWallets(); // actually-connected EVM wallets
  const accounts = (user?.linkedAccounts ?? []) as LinkedAccount[];
  const sessionSolana = accounts.find((a) => a.type === 'wallet' && a.chainType === 'solana')?.address;
  // The HL account = the user's Privy EMBEDDED EVM wallet, provisioned at login
  // (one identity, no "connect EVM wallet" prompt). A BYO external wallet is still
  // honored as a fallback when the user has no embedded one (e.g. they logged into
  // the terminal WITH MetaMask). Order: embedded → external → any → linked account.
  const linkedEvm = accounts.find((a) => a.type === 'wallet' && a.chainType === 'ethereum')?.address;
  const evmAddress =
    (wallets.find((w) => w.walletClientType === 'privy')
      ?? wallets.find((w) => w.walletClientType !== 'privy')
      ?? wallets[0])?.address ?? linkedEvm;

  // EVM-only session → try to resolve a previously-linked identity. `resolveDone`
  // distinguishes "still checking" (undefined) from "checked, none found" (null).
  const [resolved, setResolved] = useState<string | null>(null);
  const [resolveDone, setResolveDone] = useState(false);
  useEffect(() => {
    if (sessionSolana || !evmAddress) {
      setResolved(null);
      setResolveDone(false);
      return;
    }
    let alive = true;
    setResolveDone(false);
    resolveIdentity(evmAddress).then((w) => {
      if (alive) { setResolved(w ?? null); setResolveDone(true); }
    });
    return () => { alive = false; };
  }, [sessionSolana, evmAddress]);

  // Identity = Solana wallet → a previously-linked identity → the EVM wallet
  // itself. The last fallback means an EVM-only user (e.g. just MetaMask) gets an
  // account automatically, with no manual linking; undefined only while resolving.
  const walletAddress = sessionSolana ?? resolved ?? (resolveDone ? evmAddress : undefined);

  // Resolve the (identity, evm) pair → the dedup/result key. Only the Solana path
  // can conflict (EVM-only resolves to its own owner, so it links to itself).
  const linkKey = !evmAddress
    ? ''
    : sessionSolana
      ? `sol:${sessionSolana}:${evmAddress}`
      : resolveDone && !resolved
        ? `evm:${evmAddress}`
        : '';

  // Subscribe to the shared link store so EVERY instance reflects the conflict.
  const status = useSyncExternalStore(
    subscribeLink,
    () => (linkKey ? linkResults.get(linkKey) ?? null : null),
    () => null,
  );
  const linkConflict = status === 'conflict';

  // Auto-register + link once per key (deduped across all hook instances). With a
  // Solana wallet, the Solana address is the identity and the EVM links to it;
  // EVM-only → the EVM is its own identity (persists via /resolve).
  useEffect(() => {
    if (!linkKey) return;
    const identity = sessionSolana ?? evmAddress; // matches linkKey's identity
    if (!identity) return;
    if (linkInFlight.has(linkKey) || linkResults.has(linkKey)) return; // already done/doing
    linkInFlight.add(linkKey);
    // registerUser/linkEvm resolve to { success } (no throw on network errors).
    // A WALLET_LINKED_ELSEWHERE conflict is permanent → record it; a transient
    // failure (API down) just releases the in-flight guard so a later mount retries.
    registerUser(identity)
      .then(async (r) => {
        if (!r.success) return { ok: false as const };
        const link = await linkEvm(identity, evmAddress!, 'privy');
        return { ok: link.success, code: link.error?.code };
      })
      .then((res) => {
        linkInFlight.delete(linkKey);
        if (res.ok) { setLinkResult(linkKey, 'linked'); return; }
        if (res.code === 'WALLET_LINKED_ELSEWHERE') setLinkResult(linkKey, 'conflict');
      })
      .catch(() => { linkInFlight.delete(linkKey); });
  }, [linkKey, sessionSolana, evmAddress]);

  return { ready, authenticated, walletAddress, evmAddress, linked: !!walletAddress, linkConflict };
}
