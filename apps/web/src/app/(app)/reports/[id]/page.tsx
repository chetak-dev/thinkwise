import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Award, CheckCircle2, Download, Gauge, Trophy, Users } from 'lucide-react';
import {
  QUESTION_TYPE_LABELS as TYPE_LABELS,
  computeReport,
  describeAnswer,
  scoredAnswers,
  type QuestionStats,
} from '@thinkwise/shared';
import { getDb, getSessionReport, type SessionPlayer } from '@thinkwise/db';
import { requireUser } from '@/lib/session';
import { MODE_LABELS, StatusBadge, formatDateTime } from '@/components/SessionBits';
import { PrintButton } from '@/components/PrintButton';

export const metadata: Metadata = { title: 'Report · ThinkWise' };

const ACTION =
  'inline-flex h-10 items-center gap-2 rounded-xl border border-app bg-surface px-4 text-sm font-semibold hover:border-nova-400';
const CARD = 'rounded-2xl border border-app bg-surface p-5 shadow-soft';
const BAR_MAX_PX = 152;

const pct = (n: number | null) => (n === null ? '—' : `${n}%`);
const seconds = (ms: number | null) => (ms === null ? '—' : `${(ms / 1000).toFixed(1)} s`);
const signed = (n: number) => (n < 0 ? `−${Math.abs(n)}` : `+${n}`);

function Stat({ label, value, hint, icon: Icon }: { label: string; value: string; hint?: string; icon: typeof Users }) {
  return (
    <div className={CARD}>
      <div className="flex items-center justify-between text-sm font-medium text-muted">
        <span>{label}</span>
        <Icon className="size-4" aria-hidden="true" />
      </div>
      <p className="mt-2 font-display text-3xl font-bold tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

function AnswerCell({ player, q }: { player: SessionPlayer; q: QuestionStats }) {
  const a = player.answers.find((x) => x.q === q.index);
  if (!a) return <span className="text-muted">—</span>;
  if (!q.scored) {
    return (
      <div className="rounded-lg bg-surface-2 px-2 py-1">
        <span className="line-clamp-2">{describeAnswer(q, a) || '—'}</span>
        <span className="text-[11px] tabular-nums opacity-70">{seconds(a.timeMs)}</span>
      </div>
    );
  }
  const partly = !a.isCorrect && a.points > 0;
  const tone = a.isCorrect
    ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
    : partly
      ? 'bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200'
      : 'bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300';
  return (
    <div className={`rounded-lg px-2 py-1 ${tone}`}>
      <span className="line-clamp-2">
        <span aria-label={a.isCorrect ? 'Correct:' : partly ? 'Partly right:' : 'Wrong:'}>
          {a.isCorrect ? '✓' : partly ? '◐' : '✗'}
        </span>{' '}
        {describeAnswer(q, a) || '—'}
      </span>
      <span className="text-[11px] tabular-nums opacity-70">
        {signed(a.points)} · {seconds(a.timeMs)}
      </span>
    </div>
  );
}

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/reports/${id}`);
  const report = await getSessionReport(getDb(), user.id, id);
  if (!report) notFound();

  const players = report.players;
  const stats = computeReport(report.questions, players, report.questionsAsked);
  const asked = stats.questions.filter((q) => q.asked);
  const finished = report.status !== 'live';
  const maxBucket = Math.max(1, ...stats.distribution.map((b) => b.count));

  return (
    <div className="space-y-8 print:space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/reports"
            className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-app print:hidden"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Reports
          </Link>
          <h1 className="font-display text-3xl font-bold">{report.title}</h1>
          <p className="flex flex-wrap items-center gap-x-1.5 text-muted">
            <time dateTime={report.createdAt.toISOString()}>{formatDateTime(report.createdAt)}</time> · {MODE_LABELS[report.mode]} · PIN{' '}
            {report.pin} · <StatusBadge status={report.status} />
          </p>
        </div>
        {finished && (
          <div className="flex flex-wrap gap-2 print:hidden">
            <a href={`/api/sessions/${report.id}/export`} className={ACTION}>
              <Download className="size-4" aria-hidden="true" />
              Export CSV (Excel)
            </a>
            <Link href={`/reports/${report.id}/certificates`} className={ACTION}>
              <Award className="size-4" aria-hidden="true" />
              Certificates
            </Link>
            <PrintButton className={ACTION} />
          </div>
        )}
      </div>

      {!finished ? (
        <p className="rounded-2xl border border-dashed border-app bg-surface p-6 text-center text-muted">
          This game hasn’t finished yet. Results appear here as soon as it ends.
        </p>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Participants" value={String(stats.participants)} icon={Users} />
            <Stat label="Average accuracy" value={pct(stats.accuracy)} icon={CheckCircle2} />
            <Stat label="Average score" value={stats.avgScore === null ? '—' : String(stats.avgScore)} icon={Trophy} />
            <Stat
              label="Completion"
              value={pct(stats.completion)}
              hint={`Answers given out of possible · ${report.questionsAsked} of ${report.questionCount} questions asked`}
              icon={Gauge}
            />
          </section>

          <section className="grid gap-4 lg:grid-cols-[2fr_1fr]">
            <div className={CARD}>
              <h2 className="mb-4 font-display text-lg font-bold">Accuracy by question</h2>
              {asked.length === 0 ? (
                <p className="text-sm text-muted">No questions were asked in this game.</p>
              ) : (
                <ol className="space-y-2.5">
                  {asked.map((q) => (
                    <li key={q.index} className="grid grid-cols-[2.5rem_1fr_3.5rem] items-center gap-3 text-sm">
                      <span className="font-semibold text-muted">Q{q.index + 1}</span>
                      <div
                        className="h-6 overflow-hidden rounded-lg bg-surface-2"
                        role="img"
                        aria-label={`Question ${q.index + 1}: ${pct(q.accuracy)} correct`}
                      >
                        {q.accuracy === null ? (
                          <div className="flex h-full items-center px-2 text-xs text-muted">
                            {TYPE_LABELS[q.type]} ·{' '}
                            {!q.scored ? (q.average === null ? 'not scored' : `average ${q.average}`) : 'no answers'}
                          </div>
                        ) : (
                          <div className="h-full rounded-lg bg-aqua-500" style={{ width: `${q.accuracy}%` }} />
                        )}
                      </div>
                      <span className="text-right font-semibold tabular-nums">{pct(q.accuracy)}</span>
                    </li>
                  ))}
                </ol>
              )}
              {stats.hardest && (
                <p className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-900 dark:bg-rose-950/30 dark:text-rose-200">
                  Toughest question: <strong>Q{stats.hardest.index + 1}</strong> ({pct(stats.hardest.accuracy)} correct) — worth
                  going over again with the group.
                </p>
              )}
            </div>

            <div className={CARD}>
              <h2 className="mb-4 font-display text-lg font-bold">Score distribution</h2>
              <div className="flex h-48 items-end gap-2" role="img" aria-label="Score distribution histogram">
                {stats.distribution.map((b) => (
                  <div key={b.from} className="flex flex-1 flex-col items-center gap-1">
                    <span className="text-xs font-semibold tabular-nums">{b.count}</span>
                    <div
                      className="w-full rounded-t-lg bg-nova-500"
                      style={{ height: `${Math.max(2, Math.round((b.count / maxBucket) * BAR_MAX_PX))}px` }}
                    />
                    <span className="text-[10px] text-muted">
                      {b.from}–{b.to}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section aria-labelledby="participants-h" className="space-y-3">
            <h2 id="participants-h" className="font-display text-xl font-bold">
              Participants
            </h2>
            {players.length === 0 ? (
              <p className="text-sm text-muted">Nobody joined this game.</p>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-app bg-surface shadow-soft">
                <table className="w-full text-sm">
                  <thead className="bg-surface-2 text-left text-xs uppercase tracking-wider text-muted">
                    <tr>
                      <th scope="col" className="px-5 py-3">Rank</th>
                      <th scope="col" className="px-5 py-3">Name</th>
                      <th scope="col" className="px-5 py-3">Score</th>
                      <th scope="col" className="px-5 py-3">Correct</th>
                      <th scope="col" className="hidden px-5 py-3 sm:table-cell">Accuracy</th>
                      <th scope="col" className="hidden px-5 py-3 sm:table-cell">Avg time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {players.map((p) => {
                      const scored = scoredAnswers(report.questions, p.answers);
                      const acc = scored.length ? Math.round((p.correctCount / scored.length) * 100) : null;
                      const avg = p.answers.length ? p.answers.reduce((n, a) => n + a.timeMs, 0) / p.answers.length : null;
                      return (
                        <tr key={`${p.rank}-${p.nickname}`}>
                          <td className="px-5 py-3 font-semibold tabular-nums">{p.rank}</td>
                          <td className="px-5 py-3">
                            <span aria-hidden="true">{p.avatar}</span> {p.nickname}
                          </td>
                          <td className="px-5 py-3 font-semibold tabular-nums">{p.score}</td>
                          <td className="px-5 py-3 tabular-nums">
                            {p.correctCount}/{stats.scoredAsked}
                          </td>
                          <td className="hidden px-5 py-3 tabular-nums sm:table-cell">{pct(acc)}</td>
                          <td className="hidden px-5 py-3 tabular-nums sm:table-cell">{seconds(avg)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {players.length > 0 && asked.length > 0 && (
            <section aria-labelledby="matrix-h">
              <h2 id="matrix-h" className="mb-1 font-display text-xl font-bold">
                Answers by person
              </h2>
              <p className="mb-3 text-sm text-muted">
                What each player chose on every question. Green is right, amber is partly right, red is wrong and a dash means
                no answer.
              </p>
              <div className="max-h-[70vh] overflow-auto rounded-2xl border border-app bg-surface shadow-soft print:max-h-none">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-surface-2 text-left text-xs uppercase tracking-wider text-muted">
                    <tr>
                      <th scope="col" className="sticky left-0 z-10 bg-surface-2 px-4 py-3">Name</th>
                      <th scope="col" className="px-3 py-3 text-right">Score</th>
                      {asked.map((q) => (
                        <th key={q.index} scope="col" className="min-w-40 px-3 py-3" title={q.text}>
                          Q{q.index + 1}
                          <span className="block max-w-48 truncate font-normal normal-case tracking-normal">{q.text}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {players.map((p) => (
                      <tr key={`${p.rank}-${p.nickname}`}>
                        <th scope="row" className="sticky left-0 bg-surface px-4 py-2.5 text-left font-semibold whitespace-nowrap">
                          <span className="mr-2" aria-hidden="true">{p.avatar}</span>
                          {p.nickname}
                        </th>
                        <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{p.score}</td>
                        {asked.map((q) => (
                          <td key={q.index} className="px-3 py-2">
                            <AnswerCell player={p} q={q} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {asked.length > 0 && (
            <section aria-labelledby="breakdown-h" className="space-y-3">
              <h2 id="breakdown-h" className="font-display text-xl font-bold">
                Question breakdown
              </h2>
              <div className="grid gap-4 md:grid-cols-2">
                {asked.map((q) => (
                  <div key={q.index} className={`${CARD} break-inside-avoid`}>
                    <div className="mb-2 flex items-center justify-between gap-2 text-xs font-semibold text-muted">
                      <span>
                        Q{q.index + 1} · {TYPE_LABELS[q.type]}
                      </span>
                      <span>
                        {q.answers} {q.answers === 1 ? 'answer' : 'answers'} · avg {seconds(q.avgMs)}
                        {q.average !== null && ` · average rating ${q.average}`}
                      </span>
                    </div>
                    <p className="font-semibold">{q.text}</p>
                    {q.answerKey && (
                      <p className="mt-1 text-xs text-muted">
                        {q.type === 'numeric' ? 'Answer' : q.type === 'order' ? 'Right order' : 'Accepted'}:{' '}
                        <span className="font-semibold text-emerald-700 dark:text-emerald-400">{q.answerKey}</span>
                      </p>
                    )}
                    <ul className="mt-3 space-y-1.5">
                      {(q.answerKey
                        ? q.textCounts.map((r) => ({ label: r.text, count: r.count, isCorrect: r.isCorrect }))
                        : q.options.map((label, i) => ({ label, count: q.optionCounts[i] ?? 0, isCorrect: q.correct.includes(i) }))
                      ).map(({ label, count, isCorrect }, i) => {
                        const share = q.answers ? Math.round((count / q.answers) * 100) : 0;
                        return (
                          <li key={i} className="text-sm">
                            <div className="flex justify-between gap-2">
                              <span className={`truncate ${isCorrect ? 'font-semibold text-emerald-700 dark:text-emerald-400' : ''}`}>
                                {isCorrect && <span aria-label="Correct answer:">✓ </span>}
                                {label}
                              </span>
                              <span className="tabular-nums text-muted">{count}</span>
                            </div>
                            <div className="mt-0.5 h-1.5 rounded-full bg-surface-2">
                              <div
                                className={`h-full rounded-full ${isCorrect ? 'bg-aqua-500' : 'bg-nova-300'}`}
                                style={{ width: `${share}%` }}
                              />
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
