import Link from 'next/link';
import { ArrowRight, History, KeyRound, UserRound } from 'lucide-react';
import { getDb, participantHistory, type PublicUser } from '@thinkwise/db';
import { Greeting } from '@/components/Greeting';
import { getTimeZone } from '@/lib/timeZone';
import { formatDateTime } from '@/lib/time';

const RECENT = 5;

/** Home for accounts that take quizzes but don't create or host them. */
export async function ParticipantHome({ user }: { user: PublicUser }) {
  const [rows, timeZone] = await Promise.all([participantHistory(getDb(), user.id), getTimeZone()]);
  const recent = rows.slice(0, RECENT);
  const firstName = user.name.trim().split(/\s+/)[0] ?? user.name;

  return (
    <div className="space-y-10">
      <section className="arena-sheen nova-gradient relative overflow-hidden rounded-[2rem] border border-white/10 p-6 text-white shadow-[0_30px_80px_-30px_rgba(109,74,255,.75)] sm:p-10">
        <Greeting />
        <h1 className="mt-1 font-display text-4xl font-bold sm:text-5xl">{firstName} ✨</h1>
        <p className="mt-3 max-w-xl text-white/85">
          Got a game PIN or a quiz link? Join in a few seconds and see how you score.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/play"
            className="inline-flex h-12 items-center gap-2 rounded-xl bg-white px-5 font-semibold text-ink-900 transition hover:-translate-y-0.5 hover:bg-nova-50"
          >
            <KeyRound className="size-5" aria-hidden="true" />
            Join a quiz
          </Link>
          <Link
            href="/history"
            className="inline-flex h-12 items-center gap-2 rounded-xl bg-white/15 px-5 font-semibold text-white transition hover:bg-white/25"
          >
            <History className="size-5" aria-hidden="true" />
            My quiz history
          </Link>
          <Link
            href="/profile"
            className="inline-flex h-12 items-center gap-2 rounded-xl bg-white/15 px-5 font-semibold text-white transition hover:bg-white/25"
          >
            <UserRound className="size-5" aria-hidden="true" />
            My profile
          </Link>
        </div>
      </section>

      <section aria-labelledby="recent-heading" className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id="recent-heading" className="font-display text-xl font-bold">
            Your recent quizzes
          </h2>
          {rows.length > 0 && (
            <Link href="/history" className="inline-flex items-center gap-1 text-sm font-semibold text-nova-700 hover:underline dark:text-nova-300">
              See all
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          )}
        </div>
        {recent.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-app bg-surface p-10 text-center">
            <History className="size-8 text-muted" aria-hidden="true" />
            <p className="font-semibold">No quizzes yet</p>
            <p className="text-sm text-muted">When you take a quiz, your score shows up here.</p>
          </div>
        ) : (
          <ul className="divide-y divide-[var(--border)] rounded-2xl border border-app bg-surface shadow-soft">
            {recent.map((r) => (
              <li key={`${r.mode}-${r.id}`}>
                <Link
                  href={r.mode === 'self' ? `/play/self?pin=${r.pin}` : `/history/${r.id}`}
                  className="flex items-center justify-between gap-4 px-5 py-4 transition hover:bg-surface-2"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{r.title}</p>
                    <p className="text-xs text-muted">
                      {r.mode === 'self' ? 'Self-paced' : 'Live'} · {r.status} ·{' '}
                      <time dateTime={r.startedAt.toISOString()}>{formatDateTime(r.startedAt, timeZone)}</time>
                    </p>
                  </div>
                  <span className="shrink-0 font-display text-lg font-bold tabular-nums">{r.score ?? '—'}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
