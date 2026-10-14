'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

type Phase = 'idle' | 'start' | 'grow' | 'done';

const WIDTH: Record<Phase, string> = { idle: '0%', start: '0%', grow: '85%', done: '100%' };
const TRANSITION: Record<Phase, string> = {
  idle: 'none',
  start: 'none',
  grow: 'width 8s cubic-bezier(.1,.7,.2,1)',
  done: 'width .2s ease-out, opacity .3s ease .2s',
};

/** Thin bar at the top that starts the moment an internal link is clicked and finishes when the new page arrives. */
export function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [phase, setPhase] = useState<Phase>('idle');
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const clear = () => {
      timers.current.forEach(window.clearTimeout);
      timers.current = [];
    };
    const start = () => {
      clear();
      setPhase('start');
      timers.current.push(window.setTimeout(() => setPhase('grow'), 20));
      // Navigations that never change the URL (cancelled, failed) shouldn't leave the bar running.
      timers.current.push(window.setTimeout(() => setPhase('done'), 15_000));
    };
    // Capture phase: Next's <Link> cancels the native event before it would bubble here.
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href]');
      if (!(a instanceof HTMLAnchorElement) || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      start();
    };
    const onSubmit = (e: SubmitEvent) => {
      if (e.target instanceof HTMLFormElement && e.target.hasAttribute('data-navigates')) start();
    };
    document.addEventListener('click', onClick, true);
    document.addEventListener('submit', onSubmit, true);
    return () => {
      clear();
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('submit', onSubmit, true);
    };
  }, []);

  useEffect(() => {
    setPhase((p) => (p === 'idle' ? p : 'done'));
  }, [pathname, search]);

  useEffect(() => {
    if (phase !== 'done') return;
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
    const t = window.setTimeout(() => setPhase('idle'), 500);
    return () => window.clearTimeout(t);
  }, [phase]);

  if (phase === 'idle') return null;
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-[200] h-[3px]">
      <div
        className="h-full rounded-r-full bg-[linear-gradient(90deg,#6d4aff,#ff5d73,#14c9b8)] shadow-[0_0_12px_rgba(109,74,255,.7)]"
        style={{ width: WIDTH[phase], opacity: phase === 'done' ? 0 : 1, transition: TRANSITION[phase] }}
      />
    </div>
  );
}
