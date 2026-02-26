'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getSocket,
  connectSocket,
  subscribePrices,
  unsubscribePrices,
} from '@/lib/socket';

interface PriceTick {
  asset: string;
  price: string;
  timestamp: number;
}

interface UsePriceStreamOptions {
  enabled?: boolean;
}

/**
 * Hook to subscribe to real-time price updates via WebSocket
 */
export function usePriceStream(
  assets: string[],
  options: UsePriceStreamOptions = {}
) {
  const { enabled = true } = options;
  const [prices, setPrices] = useState<Record<string, PriceTick>>({});
  const [isConnected, setIsConnected] = useState(false);

  // Use ref to store assets to avoid dependency issues
  const assetsRef = useRef(assets);
  assetsRef.current = assets;

  // Memoize the assets key for dependency comparison
  const assetsKey = assets.sort().join(',');

  useEffect(() => {
    if (!enabled || assets.length === 0) return;

    // Ensure we're in browser
    if (typeof window === 'undefined') return;

    const socket = getSocket();

    // Handle connection status
    const onConnect = () => {
      console.log('[usePriceStream] Socket connected');
      setIsConnected(true);
      // Subscribe to prices after connection
      subscribePrices(assetsRef.current);
    };

    const onDisconnect = () => {
      console.log('[usePriceStream] Socket disconnected');
      setIsConnected(false);
    };

    const onConnectError = (err: Error) => {
      console.error('[usePriceStream] Connection error:', err.message);
    };

    // Handle price updates
    const onPriceTick = (tick: PriceTick) => {
      if (assetsRef.current.includes(tick.asset)) {
        setPrices((prev) => ({
          ...prev,
          [tick.asset]: tick,
        }));
      }
    };

    // Set up listeners
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.on('price:tick', onPriceTick);

    console.log('[usePriceStream] Setting up socket listeners for assets:', assetsRef.current);

    // Connect if not already
    connectSocket();

    // If already connected, subscribe immediately
    if (socket.connected) {
      console.log('[usePriceStream] Already connected, subscribing immediately');
      setIsConnected(true);
      subscribePrices(assets);
    }

    // Cleanup
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.off('price:tick', onPriceTick);
      unsubscribePrices(assetsRef.current);
    };
  }, [assetsKey, enabled]);

  const getPrice = useCallback(
    (asset: string): string | null => {
      return prices[asset]?.price || null;
    },
    [prices]
  );

  return {
    prices,
    getPrice,
    isConnected,
  };
}
