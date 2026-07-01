'use client';

import { useEffect } from 'react';
import { BUILD_ID, BREAKING_VERSION } from '@/lib/version';

// localStorage key holding the BREAKING_VERSION this browser last reconciled with.
const BREAKING_KEY = 'updown-breaking-version';
const POLL_MS = 5 * 60 * 1000;

/** Clear every client-side store so the user starts the new deploy clean (logs the
 *  Privy session out — Privy persists in localStorage/IndexedDB). Only used on a
 *  breaking version bump. */
async function wipeEverything() {
  try { localStorage.clear(); } catch { /* ignore */ }
  try { sessionStorage.clear(); } catch { /* ignore */ }
  try {
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch { /* ignore */ }
  try {
    const idb = indexedDB as IDBFactory & { databases?: () => Promise<{ name?: string }[]> };
    if (idb.databases) {
      const dbs = await idb.databases();
      await Promise.all(dbs.map((d) => (d.name ? indexedDB.deleteDatabase(d.name) : undefined)));
    }
  } catch { /* ignore */ }
}

/**
 * Keeps every client on the latest deploy. There is no service worker, so without
 * this a user (especially an installed PWA) can run a stale bundle indefinitely.
 * Two mechanisms:
 *  1) Breaking-version wipe: if THIS bundle's BREAKING_VERSION differs from what
 *     the browser last stored, wipe all caches/storage/session once and reload.
 *  2) Build-id poll: if the server reports a newer deploy than this bundle, force a
 *     cache-busted reload to pull the new code.
 * Renders nothing.
 */
export function VersionGate() {
  useEffect(() => {
    let stored: string | null = null;
    try { stored = localStorage.getItem(BREAKING_KEY); } catch { /* ignore */ }

    if (stored === null) {
      // First run on this browser: just record the version, never wipe.
      try { localStorage.setItem(BREAKING_KEY, BREAKING_VERSION); } catch { /* ignore */ }
    } else if (stored !== BREAKING_VERSION) {
      // Existing user crossed a breaking bump → clean slate, then reload.
      (async () => {
        await wipeEverything();
        try { localStorage.setItem(BREAKING_KEY, BREAKING_VERSION); } catch { /* ignore */ }
        window.location.reload();
      })();
      return;
    }

    // Build-id poll (inert in local dev where BUILD_ID === 'dev').
    if (BUILD_ID === 'dev') return;
    let cancelled = false;
    const check = async () => {
      try {
        const res = await fetch('/api/version', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as { buildId?: string };
        if (!cancelled && data.buildId && data.buildId !== BUILD_ID) {
          const url = new URL(window.location.href);
          url.searchParams.set('_v', data.buildId);
          window.location.replace(url.toString());
        }
      } catch { /* offline / ignore */ }
    };
    const id = window.setInterval(check, POLL_MS);
    const onFocus = () => check();
    window.addEventListener('focus', onFocus);
    check();
    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  return null;
}
