'use client';

import { useEffect, useState } from 'react';
import type { SocketStatus } from '@/lib/useGameSocket';

// Normal connects and brief blips finish before these, so the banner only appears for real waits.
const SHOW_AFTER_MS = { connecting: 1500, reconnecting: 1000 } as const;
const WAKING_AFTER_MS = 6000;

export function ConnectionBadge({ status }: { status: SocketStatus }) {
  const [shownFor, setShownFor] = useState<SocketStatus | null>(null);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (status === 'open') return;
    const show = setTimeout(() => setShownFor(status), SHOW_AFTER_MS[status]);
    const waking = setTimeout(() => setSlow(true), WAKING_AFTER_MS);
    return () => {
      clearTimeout(show);
      clearTimeout(waking);
      setShownFor(null);
      setSlow(false);
    };
  }, [status]);

  if (status === 'open' || shownFor !== status) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-0 top-3 z-50 mx-auto w-fit max-w-[calc(100%-1.5rem)] rounded-2xl bg-sun-500 px-4 py-1.5 text-center text-sm font-bold text-ink-900 shadow-lift"
    >
      {slow
        ? 'Waking up the game server — this can take up to a minute…'
        : status === 'connecting'
          ? 'Connecting…'
          : 'Connection lost — reconnecting…'}
    </div>
  );
}
