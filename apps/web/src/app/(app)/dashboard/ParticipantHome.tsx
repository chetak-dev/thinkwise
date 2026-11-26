import Link from 'next/link';
import { ArrowRight, History } from 'lucide-react';
import { getDb, participantHistory, type PublicUser } from '@thinkwise/db';
import { Greeting } from '@/components/Greeting';
import { HeroPinForm } from '@/components/HeroPinForm';
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
      <section className="grid gap-6 lg:grid-cols-[1fr_minmax(0,380px)] lg:items-center">
        <div className="min-w-0">
          <Greeting />
          <h1 className="mt-1 font-display text-3xl font-bold sm:text-4xl">{firstName}</h1>
          <p className="mt-2 max-w-xl text-muted">Enter the PIN your organiser shared, or open their link, to join a quiz.</p>
        </div>
        <div className="rounded-3xl border border-app bg-surface p-5 shadow-soft">
          <HeroPinForm label="Join a quiz" hint="6-digit live game or 7-digit self-paced PIN" />
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
