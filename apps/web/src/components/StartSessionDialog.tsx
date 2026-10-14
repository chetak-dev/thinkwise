'use client';

import { useState } from 'react';
import { Footprints, Loader2, Presentation } from 'lucide-react';
import type { GameMode } from '@thinkwise/shared';
import { Modal } from '@/components/Modal';
import { Switch } from '@/components/Switch';

const MODES: { id: GameMode; title: string; body: string; Icon: typeof Presentation }[] = [
  {
    id: 'live',
    title: 'Live (host-paced)',
    body: 'You move the room through each question together. Ideal for classes and events.',
    Icon: Presentation,
  },
  {
    id: 'self',
    title: 'Self-paced',
    body: 'Everyone works through the quiz at their own speed with instant feedback while you follow along.',
    Icon: Footprints,
  },
];

export function StartSessionDialog({
  open,
  onClose,
  onStart,
  pending,
}: {
  open: boolean;
  onClose: () => void;
  onStart: (options: { autoAdvance: boolean; mode: GameMode }) => void;
  pending: boolean;
}) {
  const [autoAdvance, setAutoAdvance] = useState(false);
  const [mode, setMode] = useState<GameMode>('live');

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Start a session"
      description="Players join from any phone with the PIN, QR code or link. They don’t need an account, and there’s no cap on numbers."
    >
      <div className="space-y-4">
        <div role="radiogroup" aria-label="Game mode" className="grid gap-3 sm:grid-cols-2">
          {MODES.map(({ id, title, body, Icon }) => {
            const active = mode === id;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setMode(id)}
                className={`rounded-2xl border-2 p-4 text-left transition ${
                  active ? 'border-nova-500 bg-nova-50 dark:bg-nova-900/40' : 'border-app hover:border-nova-300'
                }`}
              >
                <Icon className={`mb-2 size-5 ${active ? 'text-nova-600 dark:text-nova-300' : 'text-muted'}`} aria-hidden="true" />
                <p className="font-semibold">{title}</p>
                <p className="mt-1 text-xs text-muted">{body}</p>
              </button>
            );
          })}
        </div>
        {mode === 'live' && (
          <Switch
            checked={autoAdvance}
            onChange={setAutoAdvance}
            label="Auto-advance"
            description="Step through the reveal and leaderboard on its own, 5 s each"
          />
        )}
        <button
          type="button"
          disabled={pending}
          onClick={() => onStart({ autoAdvance: mode === 'live' && autoAdvance, mode })}
          className="inline-flex h-12 w-full select-none items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-[linear-gradient(100deg,#6d4aff,#ff5d73)] px-6 text-base font-semibold text-white shadow-[0_10px_30px_-10px_rgb(255_93_115/0.7)] transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50"
        >
          {pending && <Loader2 className="size-5 animate-spin" aria-hidden="true" />}
          Open lobby
        </button>
      </div>
    </Modal>
  );
}
