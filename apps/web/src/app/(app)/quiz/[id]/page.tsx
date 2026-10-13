import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { QUESTION_TYPE_LABELS, answerKeyText, isScored, usesOptions } from '@thinkwise/shared';
import { getDb, getSharedQuiz } from '@thinkwise/db';
import { requireUser } from '@/lib/session';
import { SharedQuizActions } from './SharedQuizActions';

export const metadata: Metadata = { title: 'Quiz · ThinkWise' };

function formatTime(ms: number) {
  const s = ms / 1000;
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${s % 60 ? ` ${s % 60}s` : ''}`;
}

export default async function SharedQuizPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/quiz/${id}`);
  const view = await getSharedQuiz(getDb(), user.id, id);
  if (view === 'draft_only') redirect(`/quiz/${id}/edit`);
  if (!view) notFound();
  const { quiz } = view;
  const colour = quiz.rules.themeColour;

  return (
    <div className="space-y-6">
      <div
        className="overflow-hidden rounded-3xl text-white shadow-lift"
        style={{ background: `linear-gradient(135deg, ${colour}, color-mix(in srgb, ${colour} 55%, #0c0a1d))` }}
      >
        <div className="p-6 sm:p-10">
          <div className="flex flex-wrap gap-2">
            {['Published', view.visibility].map((badge) => (
              <span
                key={badge}
                className="inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-0.5 text-xs font-semibold capitalize text-ink-900"
              >
                {badge}
              </span>
            ))}
          </div>
          <h1 className="mt-3 font-display text-3xl font-bold sm:text-4xl">{quiz.title}</h1>
          {quiz.description && <p className="mt-2 max-w-2xl whitespace-pre-line text-white/90">{quiz.description}</p>}
          <p className="mt-2 text-sm text-white/80">
            {quiz.questions.length} {quiz.questions.length === 1 ? 'question' : 'questions'}
            {view.owned ? ' · your quiz' : ` · by ${view.authorName}`}
          </p>
          <SharedQuizActions id={view.id} owned={view.owned} />
        </div>
      </div>

      <ol className="space-y-3" aria-label="Questions">
        {quiz.questions.map((q, i) => (
          <li key={i} className="rounded-2xl border border-app bg-surface p-5 shadow-soft">
            <p className="text-xs font-semibold text-muted">
              Q{i + 1} · {QUESTION_TYPE_LABELS[q.type]} · {formatTime(q.timeLimitMs)} ·{' '}
              {isScored(q.type) ? `${q.points} pts` : 'not scored'}
              {q.penalty ? ` · −${q.penalty} if wrong` : ''}
            </p>
            <p className="mt-1 font-semibold">{q.text}</p>
            {usesOptions(q.type) && (
              <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
                {q.options.map((option, j) => {
                  const right = q.correct.includes(j);
                  return (
                    <li key={j} className={right ? 'font-semibold text-emerald-700 dark:text-emerald-400' : 'text-muted'}>
                      {right ? '✓' : '•'} {option}
                      {right && <span className="sr-only"> (correct answer)</span>}
                    </li>
                  );
                })}
              </ul>
            )}
            {q.type === 'rating' && (
              <p className="mt-2 text-sm text-muted">
                Scale {q.ratingMin}–{q.ratingMax}
              </p>
            )}
            {q.type === 'cloud' && (
              <p className="mt-2 text-sm text-muted">{q.maxWords === 1 ? 'One word' : `Up to ${q.maxWords} words`} per response</p>
            )}
            {!usesOptions(q.type) && q.type !== 'rating' && q.type !== 'cloud' && (
              <p className="mt-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                {q.type === 'numeric' ? 'Answer' : q.type === 'order' ? 'Right order' : 'Accepted'}:{' '}
                {answerKeyText({ ...q, numericAnswer: q.numericAnswer ?? undefined })}
                {q.caseSensitive && <span className="font-normal text-muted"> (case sensitive)</span>}
              </p>
            )}
            {q.explanation && <p className="mt-2 text-sm text-muted">{q.explanation}</p>}
          </li>
        ))}
      </ol>
    </div>
  );
}
