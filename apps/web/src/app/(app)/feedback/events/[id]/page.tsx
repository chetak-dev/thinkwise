import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight, ClipboardList, DoorOpen, Download, Fingerprint, ListChecks, MessageSquareText, QrCode, Rocket, Users } from 'lucide-react';
import { countEventFeedback, getDb, getFeedbackEvent, listEventSessions } from '@thinkwise/db';
import { EVENT_FLOW_INFO, EVENT_IDENTITY_INFO } from '@thinkwise/shared';
import { requireUser } from '@/lib/session';
import { getTimeZone } from '@/lib/timeZone';
import { formatDateTime } from '@/lib/time';
import { StatusBadge } from '@/components/SessionBits';
import { LaunchEventButton } from './LaunchEventButton';

export const metadata: Metadata = { title: 'Interactive event · ThinkWise' };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/feedback/events/${id}`);
  const db = getDb();
  const [event, sessions, feedback, timeZone] = await Promise.all([
    getFeedbackEvent(db, user.id, id),
    listEventSessions(db, user.id, id),
    countEventFeedback(db, user.id, id),
    getTimeZone(),
  ]);
  if (!event) notFound();

  const hasFeedback = event.flow !== 'quiz_only';
  const formText = !hasFeedback
    ? 'No feedback step'
    : event.form
      ? `${event.form.title || 'Untitled feedback form'}${event.afterForm ? ` · then ${event.afterForm.title || 'Untitled feedback form'}` : ''}`
      : 'Form deleted';
  const stats = [
    {
      Icon: ClipboardList,
      label: 'Feedback form',
      value: hasFeedback && event.form ? plural(event.form.fieldCount + (event.afterForm?.fieldCount ?? 0), 'question', 'questions') : '—',
      detail: formText,
    },
    { Icon: ListChecks, label: 'Quiz', value: event.quiz ? plural(event.quiz.questionCount, 'question', 'questions') : '—', detail: event.quiz?.title ?? 'Quiz deleted' },
    {
      Icon: Fingerprint,
      label: 'Identity',
      value: hasFeedback ? EVENT_IDENTITY_INFO[event.identity].label : '—',
      detail: hasFeedback ? EVENT_IDENTITY_INFO[event.identity].description : 'No feedback is collected',
    },
    {
      Icon: DoorOpen,
      label: 'Journey',
      value: event.flow === 'quiz_only' ? 'Quiz only' : event.feedbackRequired ? 'Feedback required' : 'Feedback optional',
      detail: event.allowLateEntry ? 'Late entry allowed' : 'No joining once the quiz starts',
    },
    {
      Icon: MessageSquareText,
      label: 'Responses',
      value: plural(feedback.total, 'response', 'responses'),
      detail: sessions.length ? `Across ${plural(sessions.length, 'launch', 'launches')}` : 'Launch the lobby to start collecting',
    },
  ];

  return (
    <div className="space-y-8">
      <Link href="/feedback" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-app">
        <ArrowLeft className="size-4" aria-hidden="true" />
        Feedback + Quiz
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-2xl">
          <span className="rounded-full bg-nova-100 px-2.5 py-0.5 text-xs font-bold text-nova-700 dark:bg-nova-900/60 dark:text-nova-200">
            {EVENT_FLOW_INFO[event.flow].badge}
          </span>
          <h1 className="mt-2 break-words font-display text-3xl font-bold">{event.title}</h1>
          <p className="mt-1 text-muted">{event.description || 'Feedback and a live quiz, joined into one experience.'}</p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          {hasFeedback && (
            <a
              href={`/api/feedback/events/${event.id}/export`}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-app bg-surface px-4 text-sm font-semibold transition hover:-translate-y-0.5 hover:border-nova-400"
            >
              <Download className="size-4" aria-hidden="true" />
              Export CSV
            </a>
          )}
          <LaunchEventButton eventId={event.id} disabled={!event.quiz} />
        </div>
      </div>

      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {stats.map(({ Icon, label, value, detail }) => (
          <li key={label} className="rounded-2xl border border-app bg-surface p-5 shadow-soft">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.14em] text-muted">
              <Icon className="size-4 text-nova-600 dark:text-nova-300" aria-hidden="true" />
              {label}
            </p>
            <p className="mt-2 font-display text-xl font-bold">{value}</p>
            <p className="mt-1 break-words text-sm text-muted">{detail}</p>
          </li>
        ))}
      </ul>

      <section className="space-y-3">
        <div>
          <h2 className="font-display text-xl font-bold">Launches</h2>
          <p className="text-sm text-muted">Each launch gets its own PIN and report.</p>
        </div>
        {sessions.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-app bg-surface px-6 py-8 text-center text-sm text-muted">
            Not launched yet. Launch the lobby when you’re ready to welcome participants.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-2xl border border-app bg-surface shadow-soft">
            {sessions.map((s) => (
              <li key={s.id}>
                <Link href={`/reports/${s.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3.5 hover:bg-surface-2">
                  <span className="font-semibold tabular-nums">PIN {s.pin}</span>
                  <time dateTime={s.createdAt.toISOString()} className="text-sm text-muted">
                    {formatDateTime(s.createdAt, timeZone)}
                  </time>
                  <span className="flex items-center gap-1 text-sm text-muted">
                    <Users className="size-4" aria-hidden="true" />
                    {plural(s.playerCount, 'player', 'players')}
                  </span>
                  {hasFeedback && (
                    <span className="flex items-center gap-1 text-sm text-muted">
                      <MessageSquareText className="size-4" aria-hidden="true" />
                      {plural(feedback.bySession[s.id] ?? 0, 'response', 'responses')}
                    </span>
                  )}
                  <StatusBadge status={s.status} />
                  <span className="ml-auto flex items-center gap-1 text-sm font-semibold text-nova-700 dark:text-nova-300">
                    Report
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-3xl border border-app bg-surface p-6 shadow-soft">
        <h2 className="font-display text-xl font-bold">How the day runs</h2>
        <ol className="mt-4 grid gap-4 md:grid-cols-3">
          {[
            { Icon: QrCode, title: 'Share one QR code', body: 'The lobby screen shows a single link, PIN and QR code for everyone.' },
            {
              Icon: ClipboardList,
              title: 'Feedback flows in',
              body: hasFeedback ? 'Participants fill in the form and land in the same lobby.' : 'Participants go straight into the lobby.',
            },
            { Icon: Rocket, title: 'Start the quiz', body: 'When you press Start, everyone moves into the game together.' },
          ].map(({ Icon, title, body }, i) => (
            <li key={title} className="flex gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-nova-100 font-display font-bold text-nova-700 dark:bg-nova-900/60 dark:text-nova-200">
                {i + 1}
              </span>
              <div>
                <p className="flex items-center gap-1.5 font-semibold">
                  <Icon className="size-4 text-muted" aria-hidden="true" />
                  {title}
                </p>
                <p className="mt-0.5 text-sm text-muted">{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
