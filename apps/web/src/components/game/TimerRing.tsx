'use client';

import { useEffect, useRef, useState } from 'react';
import type { TimerState } from '@thinkwise/shared';

export interface ClockedTimer extends TimerState {
  /** serverNow - Date.now() at the moment the timer was received. */
  offsetMs: number;
}

export function clockTimer(timer: TimerState): ClockedTimer {
  return { ...timer, offsetMs: timer.serverNow - Date.now() };
}

export function remainingOf(timer: ClockedTimer | null) {
  if (!timer) return 0;
  if (timer.paused || timer.endsAt === null) return timer.remainingMs;
  return Math.max(0, timer.endsAt - (Date.now() + timer.offsetMs));
}

export function useRemainingMs(timer: ClockedTimer | null) {
  const [remaining, setRemaining] = useState(() => remainingOf(timer));
  useEffect(() => {
    setRemaining(remainingOf(timer));
    if (!timer || timer.paused) return;
    const id = setInterval(() => setRemaining(remainingOf(timer)), 200);
    return () => clearInterval(id);
  }, [timer]);
  return remaining;
}

/** Calls onTick once per second during the final `from` seconds of a running timer. */
export function useCountdownTicks(timer: ClockedTimer | null, active: boolean, onTick: () => void, from = 5) {
  const remaining = useRemainingMs(timer);
  const seconds = Math.ceil(remaining / 1000);
  const lastRef = useRef<number | null>(null);
  const tickRef = useRef(onTick);
  useEffect(() => {
    tickRef.current = onTick;
  });
  useEffect(() => {
    if (!active || !timer || timer.paused || seconds <= 0 || seconds > from) return;
    if (lastRef.current === seconds) return;
    lastRef.current = seconds;
    tickRef.current();
  }, [active, timer, seconds, from]);
}

export function TimerRing({ timer, size = 56 }: { timer: ClockedTimer | null; size?: number }) {
  const remaining = useRemainingMs(timer);
  const seconds = Math.ceil(remaining / 1000);
  const stroke = 4;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const fraction = timer && timer.durationMs > 0 ? remaining / timer.durationMs : 0;
  const urgent = seconds <= 5;

  return (
    <div
      role="timer"
      aria-label={timer?.paused ? `Paused, ${seconds} seconds left` : `${seconds} seconds left`}
      className="relative"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={urgent ? '#e8425a' : '#6d4aff'}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - Math.min(1, Math.max(0, fraction)))}
          className="transition-[stroke-dashoffset] duration-200 ease-linear"
        />
      </svg>
      <span
        className={`absolute inset-0 flex items-center justify-center font-display font-bold tabular-nums ${
          urgent ? 'text-coral-600' : ''
        }`}
      >
        {seconds}
      </span>
    </div>
  );
}
