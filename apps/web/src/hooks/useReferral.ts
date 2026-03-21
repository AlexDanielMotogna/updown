'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useWalletBridge } from './useWalletBridge';
import { resolveReferralCode, acceptReferralApi } from '@/lib/api';

const STORAGE_KEY = 'updown_pending_ref';

export function useReferral() {
  const searchParams = useSearchParams();
  const { connected, walletAddress } = useWalletBridge();

  const [pendingCode, setPendingCode] = useState<string | null>(null);
  const [referrerInfo, setReferrerInfo] = useState<string | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  const [loading, setLoading] = useState(false);

  // Step 1: Capture ?ref= from URL and store in localStorage
  useEffect(() => {
    const ref = searchParams.get('ref');
    if (ref) {
      localStorage.setItem(STORAGE_KEY, ref);
      // Clean URL without reload
      const url = new URL(window.location.href);
      url.searchParams.delete('ref');
      window.history.replaceState({}, '', url.toString());
    }
  }, [searchParams]);

  // Step 2: Check localStorage for pending referral and resolve it
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      setPendingCode(null);
      setReferrerInfo(null);
      setShowBanner(false);
      setShowDialog(false);
      return;
    }

    setPendingCode(stored);

    // Resolve the code to get referrer info
    resolveReferralCode(stored).then((res) => {
      if (res.success && res.data) {
        setReferrerInfo(res.data.referrerWallet);
      } else {
        // Invalid code - clean up
        localStorage.removeItem(STORAGE_KEY);
        setPendingCode(null);
      }
    }).catch(() => {
      localStorage.removeItem(STORAGE_KEY);
      setPendingCode(null);
    });
  }, [searchParams]);

  // Step 3: Show dialog or banner based on connection state
  useEffect(() => {
    if (!pendingCode || !referrerInfo) {
      setShowDialog(false);
      setShowBanner(false);
      return;
    }

    if (connected && walletAddress) {
      setShowDialog(true);
      setShowBanner(false);
    } else {
      setShowBanner(true);
      setShowDialog(false);
    }
  }, [pendingCode, referrerInfo, connected, walletAddress]);

  const acceptReferral = useCallback(async () => {
    if (!walletAddress || !pendingCode) return;
    setLoading(true);
    try {
      const res = await acceptReferralApi(walletAddress, pendingCode);
      if (res.success) {
        localStorage.removeItem(STORAGE_KEY);
        setPendingCode(null);
        setReferrerInfo(null);
        setShowDialog(false);
      }
    } finally {
      setLoading(false);
    }
  }, [walletAddress, pendingCode]);

  const declineReferral = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setPendingCode(null);
    setReferrerInfo(null);
    setShowDialog(false);
    setShowBanner(false);
  }, []);

  return {
    pendingCode,
    referrerInfo,
    showDialog,
    showBanner,
    loading,
    acceptReferral,
    declineReferral,
  };
}
