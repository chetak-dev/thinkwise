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
    body: 'Share a PIN that stays open for as long as you choose. Everyone answers in their own time, can go back and change answers, then submits.',
    Icon: Footprints,
  },
];

export interface StartChoice {
  autoAdvance: boolean;
  mode: GameMode;
  opensAt?: number;
  closesAt?: number;
  timeLimitMs?: number;
  shuffleEach?: boolean;
  showLeaderboard?: boolean;
  showCorrect?: boolean;
}

/** The value a datetime-local input wants, in the browser's own time zone. */
function localInput(ms: number) {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const FIELD = 'h-11 w-full rounded-xl border border-app bg-surface px-3 text-sm focus:border-nova-500 focus:outline-none';

export function StartSessionDialog({
  open,
  onClose,
  onStart,
  pending,
}: {
  open: boolean;
  onClose: () => void;
  onStart: (options: StartChoice) => void;
  pending: boolean;
}) {
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [mode, setMode] = useState<GameMode>('live');
  const [opensLater, setOpensLater] = useState(false);
  const [opensAt, setOpensAt] = useState('');
  const [closesAt, setClosesAt] = useState('');
  const [limitMin, setLimitMin] = useState('');
  const [shuffleEach, setShuffleEach] = useState(true);
  const [showLeaderboard, setShowLeaderboard] = useState(true);
  const [showCorrect, setShowCorrect] = useState(true);
  const [problem, setProblem] = useState<string | null>(null);

  const chooseMode = (next: GameMode) => {
    setMode(next);
    setProblem(null);
    if (next === 'self' && !closesAt) {
      const hour = 60 * 60_000;
      const start = Math.ceil(Date.now() / hour) * hour;
      setOpensAt(localInput(start));
      setClosesAt(localInput(start + 24 * hour));
    }
  };

  const start = () => {
    if (mode === 'live') {
      onStart({ autoAdvance, mode });
      return;
    }
    const opens = opensLater ? new Date(opensAt).getTime() : Date.now();
    const closes = new Date(closesAt).getTime();
    const minutes = limitMin.trim() ? Number(limitMin) : null;
    if (!Number.isFinite(opens) || !Number.isFinite(closes)) return setProblem('Choose when the quiz opens and closes.');
    if (closes <= Math.max(opens, Date.now())) return setProblem('The closing time must be after the opening time.');
    if (minutes !== null && (!Number.isFinite(minutes) || minutes < 1 || minutes > 1440)) {
      return setProblem('The time limit must be between 1 and 1440 minutes.');
    }
    setProblem(null);
    onStart({
      autoAdvance: false,
      mode,
      opensAt: opens,
      closesAt: closes,
      ...(minutes !== null ? { timeLimitMs: Math.round(minutes * 60_000) } : {}),
      shuffleEach,
      showLeaderboard,
      showCorrect,
    });
  };

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
                onClick={() => chooseMode(id)}
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
        {mode === 'self' && (
          <div className="space-y-3 rounded-2xl border border-app p-4">
            <Switch
              checked={opensLater}
              onChange={setOpensLater}
              label="Open later"
              description={opensLater ? 'Participants can join from the time below' : 'Participants can join straight away'}
            />
            {opensLater && (
              <label className="block text-sm font-semibold">
                Opens
                <input type="datetime-local" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} className={`${FIELD} mt-1`} />
              </label>
            )}
            <label className="block text-sm font-semibold">
              Closes
              <input type="datetime-local" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} className={`${FIELD} mt-1`} />
            </label>
            <label className="block text-sm font-semibold">
              Time limit per participant (minutes)
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={1440}
                value={limitMin}
                onChange={(e) => setLimitMin(e.target.value)}
                placeholder="Auto: all question timers added up"
                className={`${FIELD} mt-1`}
              />
            </label>
            <Switch
              checked={shuffleEach}
              onChange={setShuffleEach}
              label="Different order for each participant"
              description="Shuffles questions and answer options per person, so neighbours can’t copy"
            />
            <Switch
              checked={showLeaderboard}
              onChange={setShowLeaderboard}
              label="Show the leaderboard after closing"
              description="Participants see the top places once the quiz closes"
            />
            <Switch
              checked={showCorrect}
              onChange={setShowCorrect}
              label="Show correct answers after closing"
              description="Participants can review every question with the right answer"
            />
            <p className="text-xs text-muted">
              Each participant’s clock starts when they press Start. They can move between questions and change answers until they
              submit or their time runs out. You can change these settings later from the quiz page.
            </p>
          </div>
        )}
        {problem && (
          <p role="alert" className="text-sm font-semibold text-rose-600 dark:text-rose-300">
            {problem}
          </p>
        )}
        <button
          type="button"
          disabled={pending}
          onClick={start}
          className="inline-flex h-12 w-full select-none items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-[linear-gradient(100deg,#6d4aff,#ff5d73)] px-6 text-base font-semibold text-white shadow-[0_10px_30px_-10px_rgb(255_93_115/0.7)] transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50"
        >
          {pending && <Loader2 className="size-5 animate-spin" aria-hidden="true" />}
          {mode === 'self' ? 'Open quiz' : 'Open lobby'}
        </button>
      </div>
    </Modal>
  );
}
