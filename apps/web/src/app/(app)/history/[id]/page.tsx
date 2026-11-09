import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getDb, participantLiveResult } from '@thinkwise/db';
import { inLanguage, isScored, savedChoices, type GameResults } from '@thinkwise/shared';
import { requireUser } from '@/lib/session';
import { getTimeZone } from '@/lib/timeZone';
import { formatDateTime } from '@/lib/time';

export const metadata: Metadata = { title: 'Quiz result · ThinkWise' };

type Question = GameResults['questions'][number];
type Answer = GameResults['players'][number]['answers'][number];

function optionLabel(q: Question, i: number) {
  return q.options[i] ?? `Option ${i + 1}`;
}

function givenAnswer(q: Question, a: Answer) {
  if (a.text !== undefined) return a.text;
  if (a.number !== undefined) return String(a.number);
  if (a.blanks) return a.blanks.map((b, i) => `${i + 1}. ${b || '—'}`).join('  ');
  return savedChoices(a)
    .map((i) => optionLabel(q, i))
    .join(q.type === 'order' ? ' → ' : ', ');
}

function correctAnswer(q: Question) {
  if (q.numericAnswer !== undefined) return q.tolerance ? `${q.numericAnswer} ± ${q.tolerance}` : String(q.numericAnswer);
  if (q.blanks?.length) return q.blanks.map((b, i) => `${i + 1}. ${b[0] ?? ''}`).join('  ');
  if (q.accepted?.length) return q.accepted.join(' / ');
  return q.correct.map((i) => optionLabel(q, i)).join(q.type === 'order' ? ' → ' : ', ');
}

export default async function HistoryResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/history/${id}`);
  const [result, timeZone] = await Promise.all([participantLiveResult(getDb(), user.id, id), getTimeZone()]);
  if (!result) notFound();
  const ended = result.status === 'ended';
  const answers = new Map((result.review?.answers ?? []).map((a) => [a.q, a]));
  const questions = (result.review?.questions ?? []).slice(0, result.questionsAsked);

  return (
    <div className="max-w-3xl space-y-6">
      <Link href="/history" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-app">
        <ArrowLeft className="size-4" aria-hidden="true" />
        My quiz history
      </Link>
      <div>
        <h1 className="font-display text-3xl font-bold">{result.title}</h1>
        <p className="text-muted">
          Live quiz · <time dateTime={result.startedAt.toISOString()}>{formatDateTime(result.startedAt, timeZone)}</time>
          {result.language && <> · {result.language}</>}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Played as', `${result.avatar} ${result.nickname}`],
          ['Score', result.score ?? '—'],
          ['Correct', result.correctCount ?? '—'],
          ['Place', result.rank ? `${result.rank} of ${result.players}` : '—'],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl border border-app bg-surface p-4 shadow-soft">
            <dt className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</dt>
            <dd className="mt-1 truncate font-display text-xl font-bold">{value}</dd>
          </div>
        ))}
      </dl>

      {!ended ? (
        <p className="rounded-2xl bg-sun-500/15 px-4 py-3 text-sm font-semibold">
          {result.status === 'live' ? 'This game is still running. Your result appears here once it ends.' : 'This game ended early, so there is no final result.'}
        </p>
      ) : !result.review ? (
        <p className="rounded-2xl bg-surface-2 px-4 py-3 text-sm text-muted">The host chose not to show the correct answers for this quiz.</p>
      ) : (
        <ol className="space-y-4">
          {questions.map((raw, i) => {
            const q = inLanguage(raw, result.language);
            const a = answers.get(i);
            const scored = isScored(q.type);
            return (
              <li key={i} className="space-y-2 rounded-2xl border border-app bg-surface p-4 shadow-soft">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold">
                    <span className="text-muted">{i + 1}. </span>
                    {q.text}
                  </p>
                  {scored && (
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                        !a
                          ? 'bg-surface-2 text-muted'
                          : a.isCorrect
                            ? 'bg-emerald-500/20 text-emerald-800 dark:text-emerald-200'
                            : 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                      }`}
                    >
                      {!a ? 'No answer' : `+${a.points}`}
                    </span>
                  )}
                </div>
                <p className="text-sm">
                  <span className="font-semibold text-muted">Your answer: </span>
                  {a ? givenAnswer(q, a) || '—' : '—'}
                </p>
                {scored && (
                  <p className="text-sm">
                    <span className="font-semibold text-muted">Correct answer: </span>
                    {correctAnswer(q) || '—'}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
