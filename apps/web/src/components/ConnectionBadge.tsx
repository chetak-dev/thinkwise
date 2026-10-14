'use client';

import { useEffect, useState } from 'react';
import type { SocketStatus } from '@/lib/useGameSocket';

// Only a dropped connection is announced; the first connect is covered by each screen's own loading state.
const SHOW_AFTER_MS = 1000;
const WAKING_AFTER_MS = 6000;

export function ConnectionBadge({ status }: { status: SocketStatus }) {
  const [shown, setShown] = useState(false);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (status !== 'reconnecting') return;
    const show = setTimeout(() => setShown(true), SHOW_AFTER_MS);
    const waking = setTimeout(() => setSlow(true), WAKING_AFTER_MS);
    return () => {
      clearTimeout(show);
      clearTimeout(waking);
      setShown(false);
      setSlow(false);
    };
  }, [status]);

  if (status !== 'reconnecting' || !shown) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-0 top-3 z-50 mx-auto w-fit max-w-[calc(100%-1.5rem)] rounded-2xl bg-sun-500 px-4 py-1.5 text-center text-sm font-bold text-ink-900 shadow-lift"
    >
      {slow ? 'Waking up the game server — this can take up to a minute…' : 'Connection lost — reconnecting…'}
    </div>
  );
}
