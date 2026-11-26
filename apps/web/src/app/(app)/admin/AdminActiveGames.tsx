'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Square } from 'lucide-react';
import type { AdminRunningSession } from '@thinkwise/db';
import { TypeToConfirm, confirmMatches } from '@/components/TypeToConfirm';
import { endAnyGameAction } from './actions';

export function AdminActiveGames({ games }: { games: AdminRunningSession[] }) {
  const router = useRouter();
  const [ending, setEnding] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const end = (game: AdminRunningSession) => {
    if (!confirmMatches(typed, 'END')) return;
    startTransition(async () => {
      const result = await endAnyGameAction(game.id, game.mode);
      setProblem(result.ok ? null : result.error);
      if (result.ok) {
        setEnding(null);
        setTyped('');
        router.refresh();
      }
    });
  };

  if (games.length === 0) return null;
  return (
    <section aria-labelledby="active-games-title" className="space-y-3">
      <div>
        <h2 id="active-games-title" className="font-display text-xl font-bold">Active games</h2>
        <p className="text-sm text-muted">Site admins can end a live or self-paced game owned by any host.</p>
      </div>
      {problem && <p role="alert" className="text-sm font-semibold text-rose-600 dark:text-rose-300">{problem}</p>}
      <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-2xl border border-app bg-surface">
        {games.map((game) => (
          <li key={game.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold">{game.title}</p>
                <p className="mt-0.5 break-words text-xs text-muted">
                  {game.mode === 'live' ? 'Live' : 'Self-paced'} · PIN {game.pin} · {game.playerCount} players · {game.hostName} ({game.hostEmail})
                </p>
              </div>
              {ending !== game.id && (
                <button
                  type="button"
                  onClick={() => {
                    setTyped('');
                    setEnding(game.id);
                  }}
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-rose-300 px-3 text-sm font-semibold text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/40"
                >
                  <Square className="size-4" aria-hidden="true" />
                  End game
                </button>
              )}
            </div>
            {ending === game.id && (
              <div role="alertdialog" aria-label={`End ${game.title}?`} className="mt-3 max-w-lg space-y-3 rounded-xl border border-rose-300 p-3">
                <p className="text-sm">This ends the game for every player. Saved results and scores are kept.</p>
                <TypeToConfirm expected="END" value={typed} onChange={setTyped} onEnter={() => end(game)} />
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={pending || !confirmMatches(typed, 'END')}
                    onClick={() => end(game)}
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-rose-600 px-4 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                    End for everyone
                  </button>
                  <button type="button" disabled={pending} onClick={() => setEnding(null)} className="h-10 px-3 text-sm font-semibold text-muted">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
