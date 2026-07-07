'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useWalletBridge } from './useWalletBridge';
import { subscribePush, unsubscribePush } from '@/lib/api';

/**
 * Web Push opt-in for the web app.
 *
 * State machine:
 *  - 'unsupported'  → browser has no SW/Push API (or push disabled: no VAPID key)
 *  - 'needs-install'→ iOS Safari NOT installed as a PWA (push only works once the
 *                     user does Add-to-Home-Screen, iOS 16.4+)
 *  - 'prompt'       → supported, not yet subscribed → call enable()
 *  - 'denied'       → user blocked notifications in the browser
 *  - 'subscribed'   → active subscription registered with the API
 *  - 'loading'      → transient (enabling/disabling)
 */
export type PushState =
  | 'unsupported'
  | 'needs-install'
  | 'prompt'
  | 'denied'
  | 'subscribed'
  | 'loading';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';

function urlBase64ToArrayBuffer(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  // Build over an explicit ArrayBuffer so the type is ArrayBuffer (not the
  // ArrayBufferLike a bare `new Uint8Array(len)` infers, which TS rejects for
  // applicationServerKey since it could be a SharedArrayBuffer).
  const buffer = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return buffer;
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  // iOS exposes navigator.standalone; other platforms use the display-mode media query.
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function usePushNotifications() {
  const { walletAddress } = useWalletBridge();
  const [state, setState] = useState<PushState>('loading');
  const walletRef = useRef<string | null | undefined>(walletAddress);
  walletRef.current = walletAddress;

  const computeInitialState = useCallback(async (): Promise<PushState> => {
    if (typeof window === 'undefined') return 'unsupported';
    if (!VAPID_PUBLIC_KEY) return 'unsupported';
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      // iOS in a non-installed Safari tab lands here (no PushManager) — steer the
      // user to install rather than showing a dead "unsupported" state.
      if (isIos() && !isStandalone()) return 'needs-install';
      return 'unsupported';
    }
    if (isIos() && !isStandalone()) return 'needs-install';

    if (Notification.permission === 'denied') return 'denied';
    if (Notification.permission === 'granted') {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        const existing = await reg?.pushManager.getSubscription();
        return existing ? 'subscribed' : 'prompt';
      } catch {
        return 'prompt';
      }
    }
    return 'prompt';
  }, []);

  useEffect(() => {
    let cancelled = false;
    computeInitialState().then((s) => {
      if (!cancelled) setState(s);
    });
    return () => {
      cancelled = true;
    };
  }, [computeInitialState]);

  const enable = useCallback(async () => {
    if (!VAPID_PUBLIC_KEY) return;
    setState('loading');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'prompt');
        return;
      }

      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToArrayBuffer(VAPID_PUBLIC_KEY),
        });
      }

      const wallet = walletRef.current;
      if (wallet) {
        await subscribePush(wallet, sub.toJSON(), navigator.userAgent);
      }
      setState('subscribed');
    } catch (err) {
      console.error('[Push] enable failed:', err);
      setState('prompt');
    }
  }, []);

  const disable = useCallback(async () => {
    setState('loading');
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await unsubscribePush(sub.endpoint).catch(() => {});
        await sub.unsubscribe().catch(() => {});
      }
      setState('prompt');
    } catch (err) {
      console.error('[Push] disable failed:', err);
      setState('subscribed');
    }
  }, []);

  // When the wallet changes while already subscribed, re-associate the existing
  // subscription to the new wallet (upsert by endpoint on the server).
  useEffect(() => {
    if (state !== 'subscribed' || !walletAddress) return;
    let cancelled = false;
    (async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = await reg?.pushManager.getSubscription();
        if (!cancelled && sub) {
          await subscribePush(walletAddress, sub.toJSON(), navigator.userAgent);
        }
      } catch {
        /* best-effort */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [walletAddress, state]);

  return {
    state,
    supported: state !== 'unsupported',
    enable,
    disable,
  };
}
