'use client';

import { useState } from 'react';
import { Footprints, Loader2, Presentation } from 'lucide-react';
import { Modal } from '@/components/Modal';
import { Switch } from '@/components/Switch';

export function StartSessionDialog({
  open,
  onClose,
  onStart,
  pending,
}: {
  open: boolean;
  onClose: () => void;
  onStart: (options: { autoAdvance: boolean }) => void;
  pending: boolean;
}) {
  const [autoAdvance, setAutoAdvance] = useState(false);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Start a session"
      description="Players join from any phone with the PIN, QR code or link. They don’t need an account, and there’s no cap on numbers."
    >
      <div className="space-y-4">
        <div role="radiogroup" aria-label="Game mode" className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            role="radio"
            aria-checked="true"
            className="rounded-2xl border-2 border-nova-500 bg-nova-50 p-4 text-left transition dark:bg-nova-900/40"
          >
            <Presentation className="mb-2 size-5 text-nova-600 dark:text-nova-300" aria-hidden="true" />
            <p className="font-semibold">Live (host-paced)</p>
            <p className="mt-1 text-xs text-muted">You move the room through each question together. Ideal for classes and events.</p>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked="false"
            aria-disabled="true"
            disabled
            className="cursor-not-allowed rounded-2xl border-2 border-app p-4 text-left opacity-60"
          >
            <span className="mb-2 flex items-center justify-between">
              <Footprints className="size-5 text-muted" aria-hidden="true" />
              <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted">Soon</span>
            </span>
            <p className="font-semibold">Self-paced</p>
            <p className="mt-1 text-xs text-muted">Everyone works through the quiz at their own speed while you follow along.</p>
          </button>
        </div>
        <Switch
          checked={autoAdvance}
          onChange={setAutoAdvance}
          label="Auto-advance"
          description="Step through the reveal and leaderboard on its own, 5 s each"
        />
        <button
          type="button"
          disabled={pending}
          onClick={() => onStart({ autoAdvance })}
          className="inline-flex h-12 w-full select-none items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-[linear-gradient(100deg,#6d4aff,#ff5d73)] px-6 text-base font-semibold text-white shadow-[0_10px_30px_-10px_rgb(255_93_115/0.7)] transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50"
        >
          {pending && <Loader2 className="size-5 animate-spin" aria-hidden="true" />}
          Open lobby
        </button>
      </div>
    </Modal>
  );
}
