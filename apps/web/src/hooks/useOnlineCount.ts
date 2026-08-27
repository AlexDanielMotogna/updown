'use client';

import { useEffect, useState } from 'react';

import { getSocket, connectSocket } from '@/lib/socket';

/**
 * Live count of sockets currently connected to the API.
 *
 * The server pushes `presence` on every connect/disconnect (throttled to one
 * emit per second) and sends the current value to each socket the moment it
 * connects, so there is no polling and no initial request.
 *
 * NOTE: this counts CONNECTIONS, not people. One user with three tabs counts
 * three. It is a liveness signal for the UI, not an analytics metric — the real
 * user numbers live in the admin Growth tab.
 *
 * Returns `null` until the first value arrives so the caller can render nothing
 * instead of flashing a misleading "0".
 */
export function useOnlineCount(): number | null {
  const [online, setOnline] = useState<number | null>(null);

  useEffect(() => {
    const socket = getSocket();
    connectSocket();

    const onPresence = (data: { online?: number }) => {
      const n = data?.online;
      if (typeof n === 'number' && Number.isFinite(n) && n >= 0) {
        setOnline(n);
      }
    };

    socket.on('presence', onPresence);
    return () => {
      socket.off('presence', onPresence);
    };
  }, []);

  return online;
}
