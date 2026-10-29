import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, BarChart3, BookOpenCheck, Globe, Library, Maximize2, Plus, Sparkles, Users } from 'lucide-react';
import { dashboardStats, getDb, getOrganisationName, listQuizzes, listRunningSessions, sessionCounts } from '@thinkwise/db';
import { requireUser } from '@/lib/session';
import { liveGameStatus, type LivePhase } from '@/lib/realtime';
import { createQuizAction } from '@/app/(app)/quiz-actions';
import { QuizCard } from '@/components/QuizCard';
import { NewQuizButton } from '@/components/NewQuizButton';
import { ResumeSessionButton } from '@/components/ResumeSessionButton';
import { SampleHostLink } from '@/components/SampleHostLink';
import { Greeting } from '@/components/Greeting';
import { MODE_LABELS, StatusBadge } from '@/components/SessionBits';
import { getTimeZone } from '@/lib/timeZone';
import { formatDateTime } from '@/lib/time';

export const metadata: Metadata = { title: 'Home · ThinkWise' };

const RECENT_SESSIONS = 8;

const PHASE_LABELS: Record<LivePhase, string> = {
  lobby: 'Waiting in the lobby',
  question: 'Question on screen',
  reveal: 'Showing the answer',
  leaderboard: 'Showing the leaderboard',
  finished: 'Finished',
};

function StatCard({ label, value, hint, Icon }: { label: string; value: number; hint: string; Icon: typeof Library }) {
  return (
    <div className="rounded-2xl border border-app bg-surface p-5 shadow-soft">
      <div className="flex items-center justify-between text-sm font-medium text-muted">
        <span>{label}</span>
        <Icon className="size-4" aria-hidden="true" />
      </div>
      <div className="mt-2 font-display text-3xl font-bold tracking-tight">{value}</div>
      <div className="mt-1 text-xs text-muted">{hint}</div>
    </div>
  );
}

export default async function DashboardPage() {
  const user = await requireUser();
  const db = getDb();
  const [orgName, recent, stats, timeZone, candidates] = await Promise.all([
    getOrganisationName(db, user.orgId),
    listQuizzes(db, user.id, { limit: 6 }),
    dashboardStats(db, user.id, RECENT_SESSIONS),
    getTimeZone(),
    listRunningSessions(db, user.id),
  ]);
  const liveCandidates = candidates.filter((s) => s.mode === 'live');
  const [counts, live] = await Promise.all([
    sessionCounts(
      db,
      user.id,
      recent.map((q) => q.id),
    ),
    liveGameStatus(liveCandidates.map((s) => s.id)),
  ]);
  const running = candidates.filter((s) => s.mode === 'self' || (live[s.id] && live[s.id]!.phase !== 'finished'));
  const total = stats.quizzes;
  const firstName = user.name.trim().split(/\s+/)[0] ?? user.name;

  return (
    <div className="space-y-10">
      <section className="arena-sheen nova-gradient relative overflow-hidden rounded-[2rem] border border-white/10 p-6 text-white shadow-[0_30px_80px_-30px_rgba(109,74,255,.75)] sm:p-10">
        <Greeting />
        <h1 className="mt-1 font-display text-4xl font-bold sm:text-5xl">{firstName} ✨</h1>
        <p className="mt-3 max-w-xl text-white/85">
          {orgName ? `${orgName} · ` : ''}Write a quiz, put the PIN on the big screen and let everyone play from their
          phones.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <form action={createQuizAction}>
            <button
              type="submit"
              className="inline-flex h-12 items-center gap-2 rounded-xl bg-white px-5 font-semibold text-ink-900 transition hover:-translate-y-0.5 hover:bg-nova-50"
            >
              <Plus className="size-5" aria-hidden="true" />
              New quiz
            </button>
          </form>
          <SampleHostLink className="inline-flex h-12 items-center gap-2 rounded-xl bg-white/15 px-5 font-semibold text-white transition hover:bg-white/25" />
          <Link
            href="/library?scope=public"
            className="inline-flex h-12 items-center gap-2 rounded-xl bg-white/15 px-5 font-semibold text-white transition hover:bg-white/25"
          >
            <Globe className="size-5" aria-hidden="true" />
            Browse public quizzes
          </Link>
        </div>
      </section>

      {running.length > 0 && (
        <section aria-labelledby="running-heading" className="space-y-3">
          <h2 id="running-heading" className="flex items-center gap-2 font-display text-xl font-bold">
            <span className="relative flex size-2.5" aria-hidden="true">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
            </span>
            Running now
          </h2>
          <ul className="grid gap-3 lg:grid-cols-2">
            {running.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-surface p-4 shadow-soft dark:border-emerald-900"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold">{s.title}</p>
                  {s.mode === 'self' ? (
                    <p className="text-sm text-muted">
                      PIN <span className="font-semibold tabular-nums text-app">{s.pin}</span> · Self-paced ·{' '}
                      {s.opensAt && s.opensAt.getTime() > Date.now()
                        ? `opens ${formatDateTime(s.opensAt, timeZone)}`
                        : `open until ${s.closesAt ? formatDateTime(s.closesAt, timeZone) : '—'}`}
                    </p>
                  ) : (
                    <p className="text-sm text-muted">
                      PIN <span className="font-semibold tabular-nums text-app">{s.pin}</span> · {PHASE_LABELS[live[s.id]!.phase]} ·{' '}
                      {live[s.id]!.players} {live[s.id]!.players === 1 ? 'player' : 'players'}
                    </p>
                  )}
                </div>
                {s.mode === 'self' ? (
                  <Link
                    href={`/self/${s.id}`}
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-700"
                  >
                    View progress
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                ) : (
                  <ResumeSessionButton sessionId={s.id} />
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label="At a glance" className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Quizzes" value={stats.quizzes} hint="In your library" Icon={Library} />
        <StatCard label="Recent sessions" value={stats.sessions.length} hint={`Last ${RECENT_SESSIONS} counted`} Icon={BarChart3} />
        <StatCard label="Participants reached" value={stats.participants} hint="Across recent sessions" Icon={Users} />
      </section>

      <section aria-labelledby="quizzes-heading" className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 id="quizzes-heading" className="font-display text-xl font-bold">
            Your quizzes {total > 0 && <span className="text-base font-semibold text-muted">· {total}</span>}
          </h2>
          {total > 0 && (
            <Link href="/library" className="inline-flex items-center gap-1 text-sm font-semibold text-nova-700 hover:underline dark:text-nova-300">
              View library
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          )}
        </div>
        {recent.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {recent.map((quiz) => (
              <QuizCard
                key={quiz.id}
                timeZone={timeZone}
                quiz={{
                  id: quiz.id,
                  title: quiz.title,
                  questionCount: quiz.questionCount,
                  status: quiz.status,
                  favourite: quiz.favourite,
                  archived: quiz.archived,
                  owned: quiz.owned,
                  authorName: quiz.authorName,
                  visibility: quiz.visibility,
                  sessions: counts.get(quiz.id) ?? 0,
                  updatedAt: quiz.updatedAt.toISOString(),
                }}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center rounded-3xl border border-dashed border-app bg-surface px-6 py-12 text-center">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-nova-100 text-nova-700 dark:bg-nova-900/60 dark:text-nova-200">
              <BookOpenCheck className="size-7" aria-hidden="true" />
            </span>
            <h3 className="mt-4 font-display text-lg font-bold">Write your first quiz</h3>
            <p className="mb-5 mt-1 max-w-md text-sm text-muted">
              Start with a blank quiz. Everything you type is saved automatically, and you can host it the moment it’s
              ready.
            </p>
            <NewQuizButton label="Create a quiz" />
          </div>
        )}
      </section>

      {stats.sessions.length > 0 && (
        <section aria-labelledby="sessions-heading" className="space-y-4">
          <div className="flex items-end justify-between">
            <h2 id="sessions-heading" className="font-display text-xl font-bold">
              Recent sessions
            </h2>
            <Link href="/reports" className="inline-flex items-center gap-1 text-sm font-semibold text-nova-700 hover:underline dark:text-nova-300">
              All reports
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
          <div className="divide-y divide-[var(--border)] rounded-2xl border border-app bg-surface shadow-soft">
            {stats.sessions.map((s) => (
              <Link key={s.id} href={`/reports/${s.id}`} className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-surface-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{s.title}</p>
                  <p className="text-xs text-muted">
                    <time dateTime={s.createdAt.toISOString()}>{formatDateTime(s.createdAt, timeZone)}</time> · {MODE_LABELS[s.mode]}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3 text-sm">
                  <span className="flex items-center gap-1 text-muted">
                    <Users className="size-4" aria-hidden="true" />
                    {s.playerCount}
                  </span>
                  <StatusBadge status={s.status} />
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="tips-heading" className="grid gap-4 sm:grid-cols-2">
        <h2 id="tips-heading" className="sr-only">
          Hosting tips
        </h2>
        <div className="rounded-3xl border border-app bg-surface p-5 shadow-soft">
          <Maximize2 className="size-5 text-nova-600 dark:text-nova-300" aria-hidden="true" />
          <h3 className="mt-3 font-display font-bold">Use the projector view</h3>
          <p className="mt-1 text-sm text-muted">
            Open it from the host screen on the big display. It shows the PIN, questions and leaderboard without your
            controls.
          </p>
        </div>
        <div className="rounded-3xl border border-app bg-surface p-5 shadow-soft">
          <Sparkles className="size-5 text-nova-600 dark:text-nova-300" aria-hidden="true" />
          <h3 className="mt-3 font-display font-bold">Turn the sound on</h3>
          <p className="mt-1 text-sm text-muted">
            Pick a soundtrack in the host controls. It plays on the projector and on every phone with sound on.
          </p>
        </div>
      </section>
    </div>
  );
}
