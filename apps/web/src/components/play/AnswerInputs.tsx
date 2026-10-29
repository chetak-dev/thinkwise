'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, Check } from 'lucide-react';
import {
  ANSWER_TEXT_MAX,
  CLOUD_ANSWER_MAX,
  countBlanks,
  countWords,
  formatNumberAnswer,
  parseNumberAnswer,
  type AnswerKey,
  type PlayerAnswer,
  type PublicQuestion,
} from '@thinkwise/shared';
import { answerStyle } from '@/components/game/answers';
import type { Strings } from '@/lib/i18n';

export type AnswerInput = { choice: number } | { choices: number[] } | { text: string } | { number: number } | { blanks: string[] };
export const SUBMIT_CLASS =
  'flex h-14 w-full items-center justify-center rounded-2xl bg-[linear-gradient(100deg,#6d4aff,#ff5d73)] text-lg font-bold text-white shadow-lift transition hover:brightness-110 disabled:opacity-50';
const FIELD_CLASS =
  'h-16 w-full rounded-2xl border-2 border-app bg-surface px-4 text-center text-xl font-bold focus:border-nova-500 focus:outline-none';

/** Self-paced: the answer saved earlier, and the button wording ("Save answer"). */
interface Editing {
  initial?: PlayerAnswer | null;
  submitLabel?: string;
}

export function NumberAnswer({
  t,
  onSubmit,
  disabled,
  initial,
  submitLabel,
}: { t: Strings; onSubmit: (a: AnswerInput) => void; disabled: boolean } & Editing) {
  const [typed, setTyped] = useState(initial?.number === undefined ? '' : String(initial.number));
  const [invalid, setInvalid] = useState(false);
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const n = parseNumberAnswer(typed);
        setInvalid(n === null);
        if (n !== null) onSubmit({ number: n });
      }}
    >
      <label htmlFor="number-answer" className="sr-only">
        {t.typeNumber}
      </label>
      <input
        id="number-answer"
        autoFocus
        autoComplete="off"
        inputMode="decimal"
        enterKeyHint="send"
        maxLength={30}
        value={typed}
        aria-invalid={invalid}
        aria-describedby={invalid ? 'number-error' : undefined}
        onChange={(e) => {
          setTyped(e.target.value);
          setInvalid(false);
        }}
        placeholder={t.typeNumber}
        className={`${FIELD_CLASS} tabular-nums`}
      />
      {invalid && (
        <p id="number-error" role="alert" className="text-center text-sm font-semibold text-rose-600 dark:text-rose-300">
          {t.notANumber}
        </p>
      )}
      <button type="submit" disabled={disabled || !typed.trim()} className={SUBMIT_CLASS}>
        {submitLabel ?? t.submit}
      </button>
    </form>
  );
}

export function BlanksAnswer({
  count,
  t,
  onSubmit,
  disabled,
  initial,
  submitLabel,
}: {
  count: number;
  t: Strings;
  onSubmit: (a: AnswerInput) => void;
  disabled: boolean;
} & Editing) {
  const [filled, setFilled] = useState<string[]>(() => Array.from({ length: count }, (_, i) => initial?.blanks?.[i] ?? ''));
  const any = filled.some((f) => f.trim());
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (any) onSubmit({ blanks: filled.map((f) => f.trim()) });
      }}
    >
      {filled.map((value, i) => (
        <div key={i} className="flex items-center gap-3">
          <label
            htmlFor={`blank-${i}`}
            className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-nova-100 font-display font-bold text-nova-800 dark:bg-nova-900 dark:text-nova-200"
          >
            <span className="sr-only">{t.blankLabel(i + 1)}</span>
            <span aria-hidden="true">{i + 1}</span>
          </label>
          <input
            id={`blank-${i}`}
            autoFocus={i === 0}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint={i === count - 1 ? 'send' : 'next'}
            maxLength={ANSWER_TEXT_MAX}
            value={value}
            onChange={(e) => setFilled((f) => f.map((x, j) => (j === i ? e.target.value : x)))}
            placeholder={t.blankLabel(i + 1)}
            className="h-14 w-full rounded-2xl border-2 border-app bg-surface px-4 text-lg font-bold focus:border-nova-500 focus:outline-none"
          />
        </div>
      ))}
      <button type="submit" disabled={disabled || !any} className={SUBMIT_CLASS}>
        {submitLabel ?? t.submit}
      </button>
    </form>
  );
}

function optionLabel(q: PublicQuestion, i: number, t: Strings) {
  if (q.type === 'tf') return i === 0 ? t.answerTrue : t.answerFalse;
  return q.options[i]!;
}

export function TypedAnswer({
  t,
  onSubmit,
  disabled,
  maxWords,
  initial,
  submitLabel,
}: {
  t: Strings;
  onSubmit: (a: AnswerInput) => void;
  disabled: boolean;
  /** Word clouds: the most words allowed. */
  maxWords?: number;
} & Editing) {
  const [typed, setTyped] = useState(initial?.text ?? '');
  const tooMany = maxWords !== undefined && countWords(typed) > maxWords;
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (typed.trim() && !tooMany) onSubmit({ text: typed.trim().replace(/\s+/g, ' ') });
      }}
    >
      <label htmlFor="typed-answer" className="sr-only">
        {t.typeAnswer}
      </label>
      {maxWords !== undefined && (
        <p id="typed-limit" className={`text-center text-sm font-semibold ${tooMany ? 'text-rose-600 dark:text-rose-400' : 'text-muted'}`}>
          {tooMany ? t.tooManyWords(maxWords) : t.upToWords(maxWords)}
        </p>
      )}
      <input
        id="typed-answer"
        autoFocus
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        enterKeyHint="send"
        maxLength={maxWords !== undefined ? CLOUD_ANSWER_MAX : ANSWER_TEXT_MAX}
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        placeholder={t.typeAnswer}
        aria-describedby={maxWords !== undefined ? 'typed-limit' : undefined}
        aria-invalid={tooMany || undefined}
        className={FIELD_CLASS}
      />
      <button type="submit" disabled={disabled || !typed.trim() || tooMany} className={SUBMIT_CLASS}>
        {submitLabel ?? t.submit}
      </button>
    </form>
  );
}

export function OrderAnswer({
  items,
  t,
  onSubmit,
  disabled,
  initial,
  submitLabel,
}: {
  items: string[];
  t: Strings;
  onSubmit: (a: AnswerInput) => void;
  disabled: boolean;
} & Editing) {
  const [order, setOrder] = useState(() =>
    initial?.choices?.length === items.length ? [...initial.choices] : items.map((_, i) => i),
  );
  const move = (from: number, to: number) =>
    setOrder((o) => {
      const next = [...o];
      [next[from], next[to]] = [next[to]!, next[from]!];
      return next;
    });
  return (
    <div className="space-y-3">
      <p className="text-center text-sm font-semibold text-muted">{t.orderHint}</p>
      <ol className="space-y-2" aria-label={t.yourOrder}>
        {order.map((item, pos) => (
          <li key={item} className="flex items-center gap-2 rounded-2xl bg-surface p-2 pl-3 shadow-soft">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-nova-100 font-display font-bold text-nova-800 dark:bg-nova-900 dark:text-nova-200">
              {pos + 1}
            </span>
            <span className="min-w-0 flex-1 break-words font-bold">{items[item]}</span>
            <button
              type="button"
              onClick={() => move(pos, pos - 1)}
              disabled={disabled || pos === 0}
              aria-label={t.moveUp(items[item]!)}
              className="flex size-11 items-center justify-center rounded-xl bg-surface-2 disabled:opacity-30"
            >
              <ArrowUp className="size-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => move(pos, pos + 1)}
              disabled={disabled || pos === order.length - 1}
              aria-label={t.moveDown(items[item]!)}
              className="flex size-11 items-center justify-center rounded-xl bg-surface-2 disabled:opacity-30"
            >
              <ArrowDown className="size-5" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ol>
      <button type="button" disabled={disabled} onClick={() => onSubmit({ choices: order })} className={SUBMIT_CLASS}>
        {submitLabel ?? t.submit}
      </button>
    </div>
  );
}

export function RatingAnswer({
  scale,
  onSubmit,
  disabled,
  initial,
}: {
  scale: { min: number; max: number };
  onSubmit: (a: AnswerInput) => void;
  disabled: boolean;
} & Editing) {
  const values = Array.from({ length: scale.max - scale.min + 1 }, (_, i) => scale.min + i);
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {values.map((v) => (
        <button
          key={v}
          type="button"
          disabled={disabled}
          onClick={() => onSubmit({ number: v })}
          aria-pressed={initial ? initial.number === v : undefined}
          className={`flex size-14 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#4a22cc,#8f6dff)] font-display text-2xl font-bold text-white shadow-[0_6px_0_0_rgb(0_0_0/0.18)] transition-all active:translate-y-[3px] disabled:opacity-60 ${
            initial?.number === v ? 'ring-4 ring-white/80 ring-offset-2 ring-offset-[var(--bg)]' : ''
          }`}
        >
          {v}
        </button>
      ))}
    </div>
  );
}

export function AnswerButtons({
  question,
  t,
  onSubmit,
  disabled,
  initial,
  submitLabel,
}: {
  question: PublicQuestion;
  t: Strings;
  onSubmit: (answer: AnswerInput) => void;
  disabled: boolean;
} & Editing) {
  const [picked, setPicked] = useState<number[]>(() => initial?.choices ?? []);
  const edit = { t, onSubmit, disabled, initial, submitLabel };
  if (question.type === 'text') return <TypedAnswer {...edit} />;
  if (question.type === 'cloud') return <TypedAnswer {...edit} maxWords={question.maxWords ?? 1} />;
  if (question.type === 'numeric') return <NumberAnswer {...edit} />;
  if (question.type === 'blanks') return <BlanksAnswer count={countBlanks(question.text)} {...edit} />;
  if (question.type === 'order') return <OrderAnswer items={question.options} {...edit} />;
  if (question.type === 'rating' && question.scale) {
    return <RatingAnswer scale={question.scale} onSubmit={onSubmit} disabled={disabled} initial={initial} />;
  }
  const multi = question.type === 'multi' || (question.type === 'poll' && question.multiple === true);
  const toggle = (i: number) => setPicked((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]));
  return (
    <div className="space-y-4">
      {multi && <p className="text-center text-sm font-semibold text-muted">{question.type === 'poll' ? t.pickAny : t.pickAll}</p>}
      <div className="grid grid-cols-2 gap-3">
        {question.options.map((_, i) => {
          const style = answerStyle(i);
          const on = picked.includes(i);
          return (
            <button
              key={i}
              type="button"
              disabled={disabled}
              aria-pressed={multi ? on : undefined}
              onClick={() => (multi ? toggle(i) : onSubmit({ choice: i }))}
              className={`group relative flex min-h-24 w-full items-center gap-2 rounded-2xl px-3 py-3 text-left font-bold text-white shadow-[0_6px_0_0_rgb(0_0_0/0.18)] transition-all active:translate-y-[3px] active:shadow-[0_3px_0_0_rgb(0_0_0/0.18)] disabled:cursor-default sm:gap-3 sm:px-4 ${style.bg} ${
                on ? 'ring-4 ring-white/80 ring-offset-2 ring-offset-[var(--bg)]' : ''
              }`}
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-white/20 sm:size-10">
                {on ? <Check className="size-5 sm:size-6" strokeWidth={3} aria-hidden="true" /> : <style.Icon className="size-5 sm:size-6" aria-hidden="true" />}
              </span>
              <span className="sr-only">{style.letter}.</span>
              <span className="min-w-0 flex-1 break-words leading-snug hyphens-auto">{optionLabel(question, i, t)}</span>
            </button>
          );
        })}
      </div>
      {multi && (
        <button
          type="button"
          disabled={disabled || picked.length === 0}
          onClick={() => onSubmit({ choices: [...picked].sort((a, b) => a - b) })}
          className={SUBMIT_CLASS}
        >
          {submitLabel ?? (picked.length ? t.submitCount(picked.length) : t.submit)}
        </button>
      )}
    </div>
  );
}

export function AnswerSummary({
  question,
  t,
  answer,
  correct,
  answerKey,
}: {
  question: PublicQuestion;
  t: Strings;
  answer: PlayerAnswer | null;
  correct: number[] | null;
  answerKey?: AnswerKey;
}) {
  if (question.type === 'order') {
    const mine = answer?.choices ?? [];
    const lists = [
      { title: t.yourOrder, seq: mine, tone: 'bg-surface shadow-soft' },
      { title: t.rightOrder, seq: correct ?? [], tone: 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200' },
    ].filter((l) => l.seq.length > 0);
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        {lists.map((l) => (
          <div key={l.title} className={`rounded-2xl p-4 ${l.tone}`}>
            <p className="text-xs font-bold uppercase tracking-[.14em] opacity-80">{l.title}</p>
            <ol className="mt-2 space-y-1 font-bold">
              {l.seq.map((item, pos) => (
                <li key={item} className="flex gap-2">
                  <span className="tabular-nums opacity-60">{pos + 1}.</span>
                  <span className="min-w-0 break-words">{question.options[item]}</span>
                  {l.seq === mine && correct?.length ? (
                    <span className="ml-auto" aria-label={correct[pos] === item ? 'In the right place' : 'Wrong place'}>
                      {correct[pos] === item ? '✓' : '✗'}
                    </span>
                  ) : null}
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    );
  }
  if (question.type === 'rating') {
    return answer?.number === undefined ? null : (
      <div className="rounded-2xl bg-surface p-4 text-center shadow-soft">
        <p className="text-xs font-bold uppercase tracking-[.14em] text-muted">{t.yourRating}</p>
        <p className="mt-1 font-display text-3xl font-bold tabular-nums">{answer.number}</p>
      </div>
    );
  }
  if (question.type === 'text' || question.type === 'numeric' || question.type === 'blanks' || question.type === 'cloud') {
    const given =
      answer?.text ??
      (answer?.number !== undefined ? String(answer.number) : answer?.blanks?.map((b, i) => `${i + 1}. ${b || '—'}`).join('   '));
    const key = answerKey?.accepted?.length
      ? answerKey.accepted.join(' · ')
      : answerKey?.numeric
        ? formatNumberAnswer(answerKey.numeric.answer, answerKey.numeric.tolerance)
        : answerKey?.blankAnswers?.length
          ? answerKey.blankAnswers.map((b, i) => `${i + 1}. ${b.join(' / ')}`).join('   ')
          : '';
    return (
      <div className="space-y-2">
        {given !== undefined && (
          <div className="rounded-2xl bg-surface p-4 text-center shadow-soft">
            <p className="text-xs font-bold uppercase tracking-[.14em] text-muted">{t.yourAnswer}</p>
            <p className="mt-1 whitespace-pre-wrap break-words font-display text-xl font-bold">{given}</p>
          </div>
        )}
        {key && (
          <div className="rounded-2xl bg-emerald-50 p-4 text-center text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
            <p className="text-xs font-bold uppercase tracking-[.14em] opacity-80">
              {question.type === 'numeric' ? t.correctNumber : t.accepted}
            </p>
            <p className="mt-1 whitespace-pre-wrap break-words font-bold">{key}</p>
          </div>
        )}
      </div>
    );
  }
  const picks = answer?.choices ?? [];
  // Polls and quizzes that hide answers send no right options; then the player's own picks get the tick.
  const right = correct?.length ? correct : null;
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {question.options.map((_, i) => {
        const style = answerStyle(i);
        const isPick = picks.includes(i);
        const isRight = right?.includes(i) ?? false;
        const faded = right ? !isRight && !isPick : !isPick;
        return (
          <div
            key={i}
            className={`relative flex min-h-14 w-full items-center gap-3 rounded-2xl px-4 py-2 text-left font-bold text-white shadow-[0_6px_0_0_rgb(0_0_0/0.18)] ${style.bg} ${
              faded ? 'opacity-40' : ''
            } ${isPick ? 'ring-4 ring-white/70 ring-offset-2 ring-offset-[var(--bg)]' : ''}`}
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/20">
              <style.Icon className="size-6" aria-hidden="true" />
            </span>
            <span className="sr-only">{style.letter}.</span>
            <span className="min-w-0 flex-1 break-words leading-snug">{optionLabel(question, i, t)}</span>
            {(right ? isRight : isPick) && (
              <Check className="size-7 shrink-0" aria-label={right ? 'Correct answer' : 'Your answer'} />
            )}
          </div>
        );
      })}
    </div>
  );
}
