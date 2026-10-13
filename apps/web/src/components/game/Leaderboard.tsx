import { Trophy } from 'lucide-react';
import type { Standing } from '@thinkwise/shared';

export function Leaderboard({
  title,
  top,
  me,
  meId,
  compact = false,
  large = false,
}: {
  title: string;
  top: Standing[];
  me?: { rank: number; score: number; nickname?: string; avatar?: string } | null;
  meId?: string | null;
  compact?: boolean;
  large?: boolean;
}) {
  const meListed = !meId || top.some((s) => s.id === meId);

  return (
    <div className={compact ? 'space-y-4' : 'mx-auto w-full max-w-3xl space-y-6'}>
      <h2
        className={`flex items-center justify-center gap-2 text-center font-display font-bold ${
          compact ? 'text-2xl' : 'text-3xl'
        }`}
      >
        <Trophy className={`${compact ? 'size-6' : 'size-8'} text-sun-500`} aria-hidden="true" />
        {title}
      </h2>
      <ol className="space-y-2">
        {top.map((s, i) => (
          <li
            key={s.id}
            style={{ animationDelay: `${i * 60}ms` }}
            className={`flex animate-rise items-center gap-3 rounded-2xl bg-surface text-app shadow-soft ${
              large ? 'px-6 py-4 text-2xl' : 'px-4 py-3'
            } ${s.id === meId ? 'ring-2 ring-nova-500' : ''}`}
          >
            <span
              className={`text-center font-display font-bold ${compact ? 'w-6 text-muted' : 'w-8 text-sun-500'}`}
            >
              {s.rank}
            </span>
            <span className={compact ? 'text-2xl' : ''} aria-hidden="true">
              {s.avatar}
            </span>
            <span className="min-w-0 flex-1 truncate font-semibold">{s.nickname}</span>
            <span className="font-bold tabular-nums">{s.score}</span>
          </li>
        ))}
        {!meListed && me && (
          <li className="flex items-center gap-3 rounded-2xl bg-surface px-4 py-3 shadow-soft ring-2 ring-nova-500">
            <span className="w-6 text-center font-display font-bold text-muted">{me.rank}</span>
            {me.avatar && (
              <span className="text-2xl" aria-hidden="true">
                {me.avatar}
              </span>
            )}
            <span className="min-w-0 flex-1 truncate font-semibold">{me.nickname ?? ''}</span>
            <span className="font-bold tabular-nums">{me.score}</span>
          </li>
        )}
      </ol>
    </div>
  );
}
