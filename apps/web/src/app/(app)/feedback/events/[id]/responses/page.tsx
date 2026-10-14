import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Download, MessageSquareText } from 'lucide-react';
import { getDb, getEventFeedbackExport, getFeedbackEvent } from '@thinkwise/db';
import { summarizeResponses, questionHeading, type QuestionSummary } from '@thinkwise/shared';
import { requireUser } from '@/lib/session';
import { getTimeZone } from '@/lib/timeZone';
import { formatDateTime } from '@/lib/time';

export const metadata: Metadata = { title: 'Responses · ThinkWise' };

const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function Bar({ label, n, of }: { label: string; n: number; of: number }) {
  return (
    <li className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3 text-sm">
      <span className="truncate font-medium" title={label}>
        {label}
      </span>
      <span className="h-2.5 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
        <span className="block h-full rounded-full bg-[linear-gradient(90deg,#6d4aff,#ff5d73)]" style={{ width: `${pct(n, of)}%` }} />
      </span>
      <span className="w-16 text-right tabular-nums text-muted">
        {n} · {pct(n, of)}%
      </span>
    </li>
  );
}

function Summary({ s }: { s: QuestionSummary }) {
  return (
    <li className="rounded-2xl border border-app bg-surface p-5 shadow-soft">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">{questionHeading(s.field)}</h3>
        <span className="text-xs font-semibold text-muted">{plural(s.answered, 'answer', 'answers')}</span>
      </div>
      <div className="mt-4">
        {s.answered === 0 ? (
          <p className="text-sm text-muted">No answers yet.</p>
        ) : s.kind === 'scale' ? (
          <div className="grid gap-4 sm:grid-cols-[auto_1fr] sm:items-center">
            <p className="font-display text-4xl font-bold tabular-nums">
              {s.average.toFixed(1)}
              <span className="text-base font-semibold text-muted"> average</span>
            </p>
            <ul className="space-y-1.5">
              {s.counts.map((c) => (
                <Bar key={c.label} label={c.label} n={c.n} of={s.answered} />
              ))}
            </ul>
          </div>
        ) : s.kind === 'choices' ? (
          <ul className="space-y-1.5">
            {s.counts.map((c) => (
              <Bar key={c.label} label={c.label} n={c.n} of={s.answered} />
            ))}
          </ul>
        ) : s.kind === 'grid' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th scope="col" className="sr-only">
                    Row
                  </th>
                  {s.rows[0]?.counts.map((c) => (
                    <th key={c.label} scope="col" className="px-2 pb-2 text-center font-semibold text-muted">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {s.rows.map((r) => (
                  <tr key={r.label} className="border-t border-app">
                    <th scope="row" className="py-2 pr-2 text-left font-medium">
                      {r.label}
                    </th>
                    {r.counts.map((c) => (
                      <td key={c.label} className="text-center tabular-nums">
                        {c.n}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : s.kind === 'ranking' ? (
          <ol className="space-y-1.5 text-sm">
            {s.order.map((o, i) => (
              <li key={o.label} className="flex items-center gap-3">
                <span className="flex size-7 items-center justify-center rounded-lg bg-nova-100 font-display font-bold text-nova-700 dark:bg-nova-900/60 dark:text-nova-200">
                  {i + 1}
                </span>
                <span className="flex-1 font-medium">{o.label}</span>
                <span className="tabular-nums text-muted">average place {o.averagePlace.toFixed(1)}</span>
              </li>
            ))}
          </ol>
        ) : s.kind === 'number' ? (
          <dl className="grid grid-cols-3 gap-3 text-center">
            {[
              ['Average', s.average],
              ['Lowest', s.min],
              ['Highest', s.max],
            ].map(([label, value]) => (
              <div key={label as string} className="rounded-xl bg-surface-2 p-3">
                <dt className="text-xs font-semibold text-muted">{label}</dt>
                <dd className="font-display text-xl font-bold tabular-nums">{Number((value as number).toFixed(2))}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <ul className="max-h-80 space-y-2 overflow-y-auto pr-1 text-sm">
            {s.latest.map((t, i) => (
              <li key={i} className="rounded-xl bg-surface-2 px-3 py-2">
                <p className="whitespace-pre-line break-words">{t.text}</p>
                {t.name && <p className="mt-0.5 text-xs font-semibold text-muted">{t.name}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

export default async function ResponsesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ session?: string }>;
}) {
  const { id } = await params;
  const { session } = await searchParams;
  const user = await requireUser(`/feedback/events/${id}/responses`);
  const db = getDb();
  const [event, data, timeZone] = await Promise.all([getFeedbackEvent(db, user.id, id), getEventFeedbackExport(db, user.id, id), getTimeZone()]);
  if (!event || !data) notFound();

  const chosen = data.sessions.some((s) => s.id === session) ? session : undefined;
  const subs = data.submissions.filter((s) => !chosen || s.sessionId === chosen);
  const named = (stage: 'before' | 'after') =>
    subs.filter((s) => s.stage === stage).map((s) => ({ answers: s.answers, name: data.identity === 'anonymous' ? null : s.nickname }));
  const stages = [
    { key: 'before', heading: 'Before the quiz', fields: data.beforeFields, rows: named('before') },
    { key: 'after', heading: 'After the quiz', fields: data.afterFields, rows: named('after') },
  ].filter((s) => s.fields.length > 0);
  const chip = (active: boolean) =>
    `rounded-full px-3 py-1.5 text-sm font-semibold transition ${active ? 'bg-nova-600 text-white' : 'bg-surface-2 text-muted hover:text-app'}`;

  return (
    <div className="space-y-8">
      <Link href={`/feedback/events/${event.id}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-app">
        <ArrowLeft className="size-4" aria-hidden="true" />
        {event.title}
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold">Responses</h1>
          <p className="text-muted">{plural(subs.length, 'response', 'responses')}{chosen ? ' in this launch' : ' across all launches'}.</p>
        </div>
        <a
          href={`/api/feedback/events/${event.id}/export`}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-app bg-surface px-4 text-sm font-semibold transition hover:-translate-y-0.5 hover:border-nova-400"
        >
          <Download className="size-4" aria-hidden="true" />
          Export CSV
        </a>
      </div>

      {data.sessions.length > 1 && (
        <nav aria-label="Launches" className="flex flex-wrap gap-2">
          <Link href={`/feedback/events/${event.id}/responses`} className={chip(!chosen)} aria-current={!chosen ? 'page' : undefined}>
            All launches
          </Link>
          {data.sessions.map((s) => (
            <Link
              key={s.id}
              href={`/feedback/events/${event.id}/responses?session=${s.id}`}
              className={chip(chosen === s.id)}
              aria-current={chosen === s.id ? 'page' : undefined}
            >
              PIN {s.pin} · {formatDateTime(s.createdAt, timeZone)}
            </Link>
          ))}
        </nav>
      )}

      {stages.length === 0 || subs.length === 0 ? (
        <div className="flex flex-col items-center rounded-3xl border border-dashed border-app bg-surface px-6 py-12 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-nova-100 text-nova-700 dark:bg-nova-900/60 dark:text-nova-200">
            <MessageSquareText className="size-7" aria-hidden="true" />
          </span>
          <h2 className="mt-4 font-display text-lg font-bold">No responses yet</h2>
          <p className="mt-1 max-w-md text-sm text-muted">Launch the event lobby. Answers appear here as participants send their feedback.</p>
        </div>
      ) : (
        stages.map((stage) => (
          <section key={stage.key} className="space-y-3">
            {stages.length > 1 && (
              <h2 className="font-display text-xl font-bold">
                {stage.heading} <span className="text-base font-semibold text-muted">· {plural(stage.rows.length, 'response', 'responses')}</span>
              </h2>
            )}
            <ul className="grid gap-4 lg:grid-cols-2">
              {summarizeResponses(stage.fields, stage.rows).map((s) => (
                <Summary key={s.field.id} s={s} />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
