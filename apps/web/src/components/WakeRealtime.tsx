'use client';

import { useEffect } from 'react';

const EVERY_MS = 5 * 60 * 1000;

/** The free game-server host sleeps when idle; nudging it while a host is around means games start without a cold-start wait. */
export function WakeRealtime() {
  useEffect(() => {
    const ws = process.env.NEXT_PUBLIC_WS_URL;
    if (!ws) return;
    const health = ws.replace(/^ws/, 'http').replace(/\/ws\/?$/, '/health');
    const ping = () => {
      if (document.visibilityState === 'visible') void fetch(health, { mode: 'no-cors', cache: 'no-store' }).catch(() => {});
    };
    ping();
    const id = setInterval(ping, EVERY_MS);
    return () => clearInterval(id);
  }, []);
  return null;
}
