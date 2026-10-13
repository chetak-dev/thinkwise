import type { Standing } from '@thinkwise/shared';

const PLACES = [
  { medal: '🥇', height: 'h-44', bg: 'bg-[linear-gradient(180deg,#ffb627,#ff8a3d)]', delay: '600ms' },
  { medal: '🥈', height: 'h-32', bg: 'bg-[linear-gradient(180deg,#d3c8ff,#8f6dff)]', delay: '300ms' },
  { medal: '🥉', height: 'h-24', bg: 'bg-[linear-gradient(180deg,#ffa2ae,#e8425a)]', delay: '0ms' },
];

// Visual order on the podium: second, first, third.
const ORDER = [1, 0, 2];

export function Podium({ standings }: { standings: Standing[] }) {
  return (
    <div className="flex items-end justify-center gap-3 sm:gap-6">
      {ORDER.map((place) => {
        const s = standings[place];
        const style = PLACES[place]!;
        if (!s) return <div key={place} className="w-28 sm:w-40" />;
        return (
          <div
            key={s.id}
            className="flex w-28 animate-rise flex-col items-center sm:w-40"
            style={{ animationDelay: style.delay }}
          >
            <span className="text-5xl" aria-hidden="true">
              {s.avatar}
            </span>
            <span className="mt-1 max-w-full truncate text-center font-display text-lg font-bold">{s.nickname}</span>
            <span className="text-sm font-semibold text-muted tabular-nums">{s.score}</span>
            <div
              className={`mt-2 flex w-full items-start justify-center rounded-t-2xl pt-3 text-4xl shadow-lift ${style.height} ${style.bg}`}
              aria-label={`Place ${place + 1}`}
            >
              {style.medal}
            </div>
          </div>
        );
      })}
    </div>
  );
}
