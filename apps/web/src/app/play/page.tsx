'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowDown, ArrowUp, Check, Feather, Lightbulb, Loader2, Volume2, VolumeX } from 'lucide-react';
import {
  ANSWER_TEXT_MAX,
  AVATARS,
  CLOUD_ANSWER_MAX,
  NICKNAME_MAX,
  countBlanks,
  countWords,
  formatNumberAnswer,
  isScored,
  parseNumberAnswer,
  type AnswerKey,
  type Avatar,
  type GameMode,
  type PlayerAnswer,
  type PublicQuestion,
  type PublicRules,
  type ServerMessage,
  type Standing,
  type TrackId,
} from '@thinkwise/shared';
import { Logo } from '@/components/Logo';
import { ConnectionBadge } from '@/components/ConnectionBadge';
import { answerStyle } from '@/components/game/answers';
import { Confetti } from '@/components/game/Confetti';
import { Leaderboard } from '@/components/game/Leaderboard';
import { QuestionImage } from '@/components/game/QuestionImage';
import { QuestionText } from '@/components/game/QuestionText';
import {
  TimerRing,
  clockTimer,
  useCountdownTicks,
  useRemainingMs,
  type ClockedTimer,
} from '@/components/game/TimerRing';
import { useGameSocket } from '@/lib/useGameSocket';
import { DEFAULT_RULES } from '@/lib/stage';
import { usePrefs, type Lang } from '@/lib/prefs';
import { LANGUAGES, STRINGS, type Strings } from '@/lib/i18n';
import { playSfx, setSoundEnabled, useAudioPlaying, useSound } from '@/lib/audio';

type Step = 'pin' | 'checking' | 'profile' | 'lobby' | 'question' | 'result' | 'leaderboard' | 'final' | 'kicked';

interface Me {
  id: string;
  nickname: string;
  avatar: string;
}

type Result = Extract<ServerMessage, { t: 'result' }>;
type Final = Extract<ServerMessage, { t: 'final' }>;
type AnswerInput = { choice: number } | { choices: number[] } | { text: string } | { number: number } | { blanks: string[] };

const tokenKey = (pin: string) => `tw-player-${pin}`;

const SUBMIT_CLASS =
  'flex h-14 w-full items-center justify-center rounded-2xl bg-[linear-gradient(100deg,#6d4aff,#ff5d73)] text-lg font-bold text-white shadow-lift transition hover:brightness-110 disabled:opacity-50';
const FIELD_CLASS =
  'h-16 w-full rounded-2xl border-2 border-app bg-surface px-4 text-center text-xl font-bold focus:border-nova-500 focus:outline-none';

function NumberAnswer({ t, onSubmit, disabled }: { t: Strings; onSubmit: (a: AnswerInput) => void; disabled: boolean }) {
  const [typed, setTyped] = useState('');
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
        {t.submit}
      </button>
    </form>
  );
}

function BlanksAnswer({
  count,
  t,
  onSubmit,
  disabled,
}: {
  count: number;
  t: Strings;
  onSubmit: (a: AnswerInput) => void;
  disabled: boolean;
}) {
  const [filled, setFilled] = useState<string[]>(() => Array.from({ length: count }, () => ''));
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
        {t.submit}
      </button>
    </form>
  );
}

function optionLabel(q: PublicQuestion, i: number, t: Strings) {
  if (q.type === 'tf') return i === 0 ? t.answerTrue : t.answerFalse;
  return q.options[i]!;
}

function TypedAnswer({
  t,
  onSubmit,
  disabled,
  maxWords,
}: {
  t: Strings;
  onSubmit: (a: AnswerInput) => void;
  disabled: boolean;
  /** Word clouds: the most words allowed. */
  maxWords?: number;
}) {
  const [typed, setTyped] = useState('');
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
        {t.submit}
      </button>
    </form>
  );
}

function OrderAnswer({
  items,
  t,
  onSubmit,
  disabled,
}: {
  items: string[];
  t: Strings;
  onSubmit: (a: AnswerInput) => void;
  disabled: boolean;
}) {
  const [order, setOrder] = useState(() => items.map((_, i) => i));
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
        {t.submit}
      </button>
    </div>
  );
}

function RatingAnswer({
  scale,
  onSubmit,
  disabled,
}: {
  scale: { min: number; max: number };
  onSubmit: (a: AnswerInput) => void;
  disabled: boolean;
}) {
  const values = Array.from({ length: scale.max - scale.min + 1 }, (_, i) => scale.min + i);
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {values.map((v) => (
        <button
          key={v}
          type="button"
          disabled={disabled}
          onClick={() => onSubmit({ number: v })}
          className="flex size-14 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#4a22cc,#8f6dff)] font-display text-2xl font-bold text-white shadow-[0_6px_0_0_rgb(0_0_0/0.18)] transition-all active:translate-y-[3px] disabled:opacity-60"
        >
          {v}
        </button>
      ))}
    </div>
  );
}

function AnswerButtons({
  question,
  t,
  onSubmit,
  disabled,
}: {
  question: PublicQuestion;
  t: Strings;
  onSubmit: (answer: AnswerInput) => void;
  disabled: boolean;
}) {
  const [picked, setPicked] = useState<number[]>([]);
  if (question.type === 'text') return <TypedAnswer t={t} onSubmit={onSubmit} disabled={disabled} />;
  if (question.type === 'cloud') {
    return <TypedAnswer t={t} onSubmit={onSubmit} disabled={disabled} maxWords={question.maxWords ?? 1} />;
  }
  if (question.type === 'numeric') return <NumberAnswer t={t} onSubmit={onSubmit} disabled={disabled} />;
  if (question.type === 'blanks') {
    return <BlanksAnswer count={countBlanks(question.text)} t={t} onSubmit={onSubmit} disabled={disabled} />;
  }
  if (question.type === 'order') return <OrderAnswer items={question.options} t={t} onSubmit={onSubmit} disabled={disabled} />;
  if (question.type === 'rating' && question.scale) {
    return <RatingAnswer scale={question.scale} onSubmit={onSubmit} disabled={disabled} />;
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
          {picked.length ? t.submitCount(picked.length) : t.submit}
        </button>
      )}
    </div>
  );
}

function AnswerSummary({
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

function QuestionStage({
  question,
  timer,
  myAnswer,
  pending,
  result,
  t,
  lowData,
  showRank,
  onSubmit,
  onNext,
}: {
  question: PublicQuestion;
  timer: ClockedTimer | null;
  myAnswer: PlayerAnswer | null;
  pending: boolean;
  result: Result | null;
  t: Strings;
  lowData: boolean;
  showRank: boolean;
  onSubmit: (answer: AnswerInput) => void;
  /** Self-paced: the player moves on when ready. */
  onNext?: () => void;
}) {
  const remaining = useRemainingMs(timer);
  const live = !result;
  const scored = isScored(question.type);
  const timedOut = live && myAnswer === null && !timer?.paused && remaining <= 0;
  const [hintFor, setHintFor] = useState<number | null>(null);
  const hintOpen = hintFor === question.index;

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-muted">{t.questionOf(question.index + 1, question.total)}</span>
        <div className="flex items-center gap-2">
          {live && timer?.paused && (
            <span className="rounded-full bg-sun-500/20 px-2.5 py-0.5 text-xs font-bold text-amber-800 dark:text-amber-200">
              {t.paused}
            </span>
          )}
          {live && <TimerRing timer={timer} size={48} />}
        </div>
      </div>

      <div className="glass-panel animate-rise space-y-4 rounded-[2rem] p-6 text-center">
        {question.imageUrl && (
          <QuestionImage key={question.imageUrl} url={question.imageUrl} lowData={lowData} showLabel={t.showImage} className="max-h-48" />
        )}
        <h2 className="font-display text-xl font-bold leading-snug sm:text-2xl">
          <QuestionText text={question.text} blanks={question.type === 'blanks'} />
        </h2>
        {live && (question.hint || question.penalty) && (
          <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
            {question.hint && !hintOpen && (
              <button
                type="button"
                onClick={() => setHintFor(question.index)}
                className="inline-flex items-center gap-1.5 rounded-full border border-app bg-surface px-3 py-1 font-semibold text-nova-700 hover:bg-surface-2 dark:text-nova-300"
              >
                <Lightbulb className="size-4" aria-hidden="true" />
                {t.showHint}
              </button>
            )}
            {question.penalty ? (
              <span className="rounded-full bg-rose-500/10 px-3 py-1 font-semibold text-rose-700 dark:text-rose-300">
                {t.penaltyNote(question.penalty)}
              </span>
            ) : null}
          </div>
        )}
        {live && question.hint && hintOpen && (
          <p role="note" className="animate-pop rounded-2xl bg-sun-500/15 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
            <span className="font-bold">{t.hint}: </span>
            {question.hint}
          </p>
        )}
      </div>

      {result ? (
        <div className="space-y-4">
          <div
            className={`animate-pop rounded-3xl p-6 text-center text-white shadow-lift ${
              !scored || result.points > 0 && !result.isCorrect
                ? 'bg-[linear-gradient(135deg,#4a22cc,#8f6dff)]'
                : result.isCorrect
                  ? 'bg-[linear-gradient(135deg,#00806a,#14c9b8)]'
                  : 'bg-[linear-gradient(135deg,#c4500b,#ff5d73)]'
            }`}
            role="status"
          >
            <p className="font-display text-3xl font-bold">
              {result.answer === null
                ? t.noAnswer
                : !scored
                  ? t.thanks
                  : result.isCorrect
                    ? t.correct
                    : result.points > 0
                      ? t.partlyRight
                      : t.wrong}
            </p>
            {scored && <p className="mt-2 text-lg font-semibold">{t.plusPoints(result.points)}</p>}
            {result.partsRight !== undefined && question.type === 'blanks' && (
              <p className="mt-1 text-sm font-semibold opacity-90">{t.blanksRight(result.partsRight, countBlanks(question.text))}</p>
            )}
            {result.partsRight !== undefined && question.type === 'order' && (
              <p className="mt-1 text-sm font-semibold opacity-90">{t.placesRight(result.partsRight, question.options.length)}</p>
            )}
            {showRank && scored && <p className="mt-1 text-sm font-semibold opacity-90">{t.rankOf(result.rank, result.total)}</p>}
          </div>
          {result.explanation && (
            <div className="animate-rise rounded-3xl border border-app bg-surface p-4 text-left shadow-soft">
              <p className="text-xs font-bold uppercase tracking-[.14em] text-muted">{t.why}</p>
              <p className="mt-1 whitespace-pre-line text-sm leading-relaxed">{result.explanation}</p>
            </div>
          )}
          <AnswerSummary question={question} t={t} answer={result.answer} correct={result.correct} answerKey={result} />
          {onNext && (
            <button type="button" onClick={onNext} autoFocus className={SUBMIT_CLASS}>
              {t.nextQuestion}
            </button>
          )}
        </div>
      ) : myAnswer !== null ? (
        <div className="space-y-4">
          <div
            className="animate-pop rounded-3xl bg-[linear-gradient(135deg,#4a22cc,#8f6dff)] p-6 text-center text-white shadow-lift"
            role="status"
          >
            <p className="font-display text-3xl font-bold">{t.lockedIn}</p>
            <p className="mt-1 text-sm font-semibold opacity-90">{t.waitingOthers}</p>
          </div>
          <AnswerSummary question={question} t={t} answer={myAnswer} correct={null} />
        </div>
      ) : timedOut ? (
        <div className="flex flex-col items-center justify-center gap-3 py-8 text-center" role="status">
          <div className="text-5xl" aria-hidden="true">
            ⏰
          </div>
          <h2 className="font-display text-2xl font-bold">{t.timeUp}</h2>
        </div>
      ) : (
        <AnswerButtons key={question.index} question={question} t={t} onSubmit={onSubmit} disabled={pending} />
      )}
    </div>
  );
}

function FinalStage({ final, me, t, rules }: { final: Final; me: Me; t: Strings; rules: PublicRules }) {
  const mine = final.me;
  const ranked = rules.showLeaderboard;
  const medal = ranked && mine && mine.rank <= 3 ? ['🥇', '🥈', '🥉'][mine.rank - 1] : '🎉';
  return (
    <div className="flex flex-1 flex-col items-center gap-5 text-center">
      {rules.gamification && ranked && mine && mine.rank <= 3 && <Confetti />}
      <div className="animate-pop text-7xl" aria-hidden="true">
        {medal}
      </div>
      <h2 className="font-display text-3xl font-bold">{t.allDone}</h2>
      {final.waiting && (
        <p className="animate-pulse font-semibold text-muted" role="status">
          {t.waitingOthers}
        </p>
      )}
      {rules.completionMessage && <p className="max-w-sm whitespace-pre-line font-semibold">{rules.completionMessage}</p>}
      {mine && (
        <div className={`grid w-full gap-3 ${ranked ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {ranked && (
            <div className="rounded-2xl bg-surface p-3 shadow-soft">
              <div className="font-display text-2xl font-bold tabular-nums">
                #{mine.rank}
                <span className="text-sm text-muted"> / {final.total}</span>
              </div>
              <div className="text-xs font-semibold text-muted">{t.yourPlace}</div>
            </div>
          )}
          <div className="rounded-2xl bg-surface p-3 shadow-soft">
            <div className="font-display text-2xl font-bold tabular-nums">{mine.score}</div>
            <div className="text-xs font-semibold text-muted">{t.score}</div>
          </div>
          <div className="rounded-2xl bg-surface p-3 shadow-soft">
            <div className="font-display text-2xl font-bold tabular-nums">
              {mine.correctCount}
              <span className="text-sm text-muted"> / {final.questionCount}</span>
            </div>
            <div className="text-xs font-semibold text-muted">{t.correctAnswers}</div>
          </div>
        </div>
      )}
      {final.podium.length > 0 && (
        <div className="w-full rounded-3xl bg-surface p-4 text-left shadow-soft">
          <p className="mb-2 text-sm font-semibold text-muted">{t.topPlayers}</p>
          <ol className="space-y-1.5">
            {final.podium.map((s: Standing) => (
              <li key={s.id} className={`flex items-center gap-2 ${s.id === me.id ? 'font-bold' : ''}`}>
                <span className="w-6 text-center">{['🥇', '🥈', '🥉'][s.rank - 1] ?? s.rank}</span>
                <span aria-hidden="true">{s.avatar}</span>
                <span className="flex-1 truncate font-semibold">{s.nickname}</span>
                <span className="font-bold tabular-nums">{s.score}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
      <button
        type="button"
        onClick={() => window.location.assign('/play')}
        className="font-semibold text-nova-600 underline dark:text-nova-300"
      >
        {t.joinAnother}
      </button>
    </div>
  );
}

function PlayFlow() {
  const params = useSearchParams();
  const linkPin = (params.get('pin') ?? '').replace(/\D/g, '').slice(0, 6);
  const [prefs, setPrefs] = usePrefs();
  const t = STRINGS[prefs.lang];

  const [step, setStep] = useState<Step>('pin');
  const [pinInput, setPinInput] = useState(linkPin);
  const [pin, setPin] = useState<string | null>(null);
  const [nickname, setNickname] = useState('');
  const [avatar, setAvatar] = useState<Avatar>(AVATARS[0]);
  const [me, setMe] = useState<Me | null>(null);
  const [score, setScore] = useState(0);
  const [count, setCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState<PublicQuestion | null>(null);
  const [timer, setTimer] = useState<ClockedTimer | null>(null);
  const [myAnswer, setMyAnswer] = useState<PlayerAnswer | null>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [board, setBoard] = useState<{ top: Standing[]; me?: { rank: number; score: number } } | null>(null);
  const [final, setFinal] = useState<Final | null>(null);
  const [rules, setRules] = useState<PublicRules>(DEFAULT_RULES);
  const [mode, setMode] = useState<GameMode>('live');
  const [track, setTrack] = useState<TrackId | null>(null);

  useEffect(() => {
    setAvatar(AVATARS[Math.floor(Math.random() * AVATARS.length)]!);
  }, []);

  const inGame = step !== 'pin' && step !== 'checking' && step !== 'profile';
  useSound(
    prefs.sound,
    track,
    prefs.sound && prefs.music && inGame && step !== 'final' && step !== 'kicked',
    prefs.volume,
  );
  useCountdownTicks(timer, step === 'question' && myAnswer === null, () => playSfx('tick'));
  const audioPlaying = useAudioPlaying();

  const toggleSound = () => {
    // Sound that is on but held back by the browser just needs this tap to start.
    const next = !(prefs.sound && audioPlaying);
    setSoundEnabled(next);
    setPrefs({ sound: next });
  };

  const { status, send } = useGameSocket({
    onOpen(send) {
      const target = pin ?? (linkPin.length === 6 ? linkPin : null);
      const token = target ? localStorage.getItem(tokenKey(target)) : null;
      if (target && token) {
        send({ t: 'player:resume', pin: target, playerToken: token });
      } else if (target && step === 'pin' && linkPin.length === 6) {
        setStep('checking');
        send({ t: 'pin:check', pin: target });
      }
    },
    onMessage(msg: ServerMessage) {
      switch (msg.t) {
        case 'pin:ok':
          setPin(msg.pin);
          setError(null);
          setStep('profile');
          break;
        case 'player:ready':
          localStorage.setItem(tokenKey(msg.pin), msg.playerToken);
          setPin(msg.pin);
          setMe({ id: msg.playerId, nickname: msg.nickname, avatar: msg.avatar });
          setScore(msg.score);
          setRules(msg.rules);
          setMode(msg.mode ?? 'live');
          setError(null);
          setStep('lobby');
          break;
        case 'lobby:count':
          setCount(msg.count);
          break;
        case 'soundtrack':
          setTrack(msg.track);
          break;
        case 'question':
          if (!question || question.index !== msg.question.index) playSfx('start');
          setQuestion(msg.question);
          setTimer(clockTimer(msg.timer));
          setMyAnswer(msg.myAnswer ?? null);
          setPending(false);
          setResult(null);
          setStep('question');
          break;
        case 'timer':
          setTimer(clockTimer(msg.timer));
          break;
        case 'answer:ok':
          setMyAnswer(msg.answer);
          setPending(false);
          playSfx('lock');
          break;
        case 'result':
          if (step !== 'result') playSfx(msg.isCorrect ? 'correct' : 'wrong');
          setResult(msg);
          setScore(msg.score);
          setPending(false);
          setStep('result');
          break;
        case 'leaderboard':
          if (step !== 'leaderboard') playSfx('leaderboard');
          setBoard({ top: msg.top, me: msg.me });
          if (msg.me) setScore(msg.me.score);
          setStep('leaderboard');
          break;
        case 'final':
          if (step !== 'final') playSfx('fanfare');
          setFinal(msg);
          if (msg.me) setScore(msg.me.score);
          setStep('final');
          break;
        case 'kicked':
          if (pin) localStorage.removeItem(tokenKey(pin));
          setStep('kicked');
          break;
        case 'error':
          if (msg.code === 'session_expired') {
            if (pin) localStorage.removeItem(tokenKey(pin));
            if (linkPin) localStorage.removeItem(tokenKey(linkPin));
            setMe(null);
            setStep('pin');
            setError(msg.message);
          } else if (step === 'checking' || step === 'pin') {
            setStep('pin');
            setError(msg.message);
          } else if (step === 'profile') {
            setError(msg.message);
          } else {
            // Mid-game errors (e.g. rate limiting) must not throw the player out of the game.
            setPending(false);
          }
          break;
      }
    },
  });

  const submitPin = (e: FormEvent) => {
    e.preventDefault();
    const clean = pinInput.replace(/\D/g, '');
    if (clean.length !== 6) {
      setError(t.pinInvalid);
      return;
    }
    setError(null);
    setStep('checking');
    send({ t: 'pin:check', pin: clean });
  };

  const submitProfile = (e: FormEvent) => {
    e.preventDefault();
    const name = nickname.trim();
    if (!pin || !name) return;
    setError(null);
    send({ t: 'player:join', pin, nickname: name, avatar });
  };

  const submitAnswer = (answer: AnswerInput) => {
    if (!question || pending || myAnswer !== null) return;
    setPending(true);
    send({ t: 'player:answer', index: question.index, ...answer });
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only-focusable fixed left-3 top-3 z-[100] rounded-lg bg-nova-600 px-4 py-2 font-semibold text-white"
      >
        Skip to content
      </a>
      <div className="decorative arena-grid pointer-events-none absolute inset-0 -z-10" aria-hidden="true" />
      <ConnectionBadge status={status} />

      <header className="glass-panel m-3 flex items-center justify-between gap-2 rounded-2xl px-3 py-3 sm:px-4">
        <Link href="/" aria-label="ThinkWise home" className="shrink-0">
          <Logo className="text-lg" />
        </Link>
        <div className="flex min-w-0 items-center gap-0.5 sm:gap-1">
          <button
            type="button"
            onClick={toggleSound}
            aria-label={audioPlaying ? t.muteSound : t.enableSound}
            title={audioPlaying ? t.muteSound : t.enableSound}
            aria-pressed={audioPlaying}
            className="rounded-lg p-2 text-muted hover:bg-surface-2"
          >
            {audioPlaying ? <Volume2 className="size-5" /> : <VolumeX className="size-5" />}
          </button>
          <button
            type="button"
            onClick={() => setPrefs({ lowData: !prefs.lowData })}
            aria-pressed={prefs.lowData}
            aria-label={t.lowData}
            title={t.lowData}
            className={`whitespace-nowrap rounded-lg p-2 text-xs font-semibold hover:bg-surface-2 sm:px-2 sm:py-1.5 ${
              prefs.lowData ? 'bg-nova-100 text-nova-800 dark:bg-nova-900 dark:text-nova-200' : 'text-muted'
            }`}
          >
            <Feather className="size-5 sm:hidden" aria-hidden="true" />
            <span className="hidden sm:inline">{t.lowData}</span>
          </button>
          <label htmlFor="lang" className="sr-only">
            {t.language}
          </label>
          <select
            id="lang"
            value={prefs.lang}
            onChange={(e) => setPrefs({ lang: e.target.value as Lang })}
            className="rounded-lg border border-app bg-surface px-1.5 py-1.5 text-sm"
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
      </header>

      <main id="main" className="flex flex-1 flex-col">
        {(step === 'pin' || step === 'checking') && (
          <div className="flex flex-1 items-center justify-center px-4 pb-16">
            <form onSubmit={submitPin} className="w-full max-w-sm animate-rise space-y-4">
              <h1 className="text-center font-display text-2xl font-bold">{t.joinTitle}</h1>
              <label htmlFor="pin" className="sr-only">
                {t.pinLabel}
              </label>
              <input
                id="pin"
                inputMode="numeric"
                autoComplete="off"
                autoFocus
                maxLength={7}
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                placeholder={t.pinPlaceholder}
                className="h-16 w-full rounded-2xl border-2 border-app bg-surface-2 text-center font-display text-3xl font-bold tracking-[0.3em] placeholder:text-base placeholder:tracking-normal focus:border-nova-500 focus:outline-none"
              />
              {error && (
                <p role="alert" className="text-center text-sm font-semibold text-rose-600 dark:text-rose-300">
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={step === 'checking' || status !== 'open'}
                className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-ink-900 text-lg font-bold text-white disabled:opacity-60 dark:bg-white dark:text-ink-900"
              >
                {step === 'checking' && <Loader2 className="size-5 animate-spin" aria-hidden="true" />}
                {step === 'checking' ? t.checking : t.enter}
              </button>
            </form>
          </div>
        )}

        {step === 'profile' && (
          <div className="flex flex-1 items-center justify-center px-4 pb-16">
            <form onSubmit={submitProfile} className="glass-panel w-full max-w-md animate-rise space-y-5 rounded-[2rem] p-7">
              <h1 className="text-center font-display text-2xl font-bold">{t.joinTitle}</h1>
              <div>
                <label htmlFor="nickname" className="mb-1.5 block text-sm font-semibold">
                  {t.nickname}
                </label>
                <input
                  id="nickname"
                  autoFocus
                  autoComplete="off"
                  maxLength={NICKNAME_MAX}
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder={t.nicknamePlaceholder}
                  className="h-14 w-full rounded-2xl border-2 border-app bg-surface-2 px-4 text-xl font-bold focus:border-nova-500 focus:outline-none"
                />
              </div>
              <fieldset>
                <legend className="mb-2 text-sm font-semibold">{t.avatar}</legend>
                <div className="grid grid-cols-8 gap-1.5">
                  {AVATARS.map((a) => (
                    <button
                      key={a}
                      type="button"
                      aria-label={`Avatar ${a}`}
                      aria-pressed={avatar === a}
                      onClick={() => setAvatar(a)}
                      className={`flex aspect-square items-center justify-center rounded-xl text-2xl transition ${
                        avatar === a
                          ? 'scale-110 bg-nova-100 ring-2 ring-nova-500 dark:bg-nova-900'
                          : 'hover:bg-surface-2'
                      }`}
                    >
                      {a}
                    </button>
                  ))}
                </div>
              </fieldset>
              {error && (
                <p role="alert" className="text-center text-sm font-semibold text-rose-600 dark:text-rose-300">
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={!nickname.trim() || status !== 'open'}
                className="h-14 w-full rounded-2xl bg-[linear-gradient(100deg,#6d4aff,#ff5d73)] text-lg font-bold text-white shadow-lift transition hover:brightness-110 disabled:opacity-60"
              >
                {t.joinButton}
              </button>
              <p className="text-center text-[11px] text-muted">
                {t.privacyNote}{' '}
                <Link href="/privacy" className="font-semibold underline hover:text-app">
                  {t.privacyLink}
                </Link>
              </p>
            </form>
          </div>
        )}

        {inGame && step !== 'kicked' && me && (
          <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 pb-6">
            <div
              className="glass-panel mb-4 flex items-center justify-between rounded-2xl px-4 py-2.5"
              style={{ boxShadow: `inset 0 3px 0 ${rules.themeColour}` }}
            >
              <span className="flex min-w-0 items-center gap-2 font-semibold">
                <span className="text-2xl" aria-hidden="true">
                  {me.avatar}
                </span>
                <span className="truncate">{me.nickname}</span>
              </span>
              <span className="flex items-center gap-3 text-sm font-bold tabular-nums" aria-label={`${t.score}: ${score}`}>
                {score}
              </span>
            </div>

            {step === 'lobby' && (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 py-12 text-center">
                {rules.orgName && (
                  <p className="text-xs font-bold uppercase tracking-[.18em]" style={{ color: rules.themeColour }}>
                    {rules.orgName}
                  </p>
                )}
                <span className="inline-block animate-float text-6xl" aria-hidden="true">
                  {me.avatar}
                </span>
                <h2 className="font-display text-2xl font-bold">{t.youreIn}</h2>
                {rules.welcomeMessage && (
                  <p className="max-w-sm whitespace-pre-line rounded-2xl bg-surface px-4 py-3 font-semibold shadow-soft">
                    {rules.welcomeMessage}
                  </p>
                )}
                <p className="max-w-sm text-muted">
                  {t.waitingHost}
                  <br />
                  <span className="text-sm">{t.lookForName}</span>
                </p>
                <p className="rounded-full bg-surface-2 px-3 py-1 text-sm font-semibold" aria-live="polite">
                  {t.players(count)}
                </p>
              </div>
            )}

            {(step === 'question' || step === 'result') && question && (
              <QuestionStage
                question={question}
                timer={timer}
                myAnswer={myAnswer}
                pending={pending}
                result={step === 'result' ? result : null}
                t={t}
                lowData={prefs.lowData}
                showRank={rules.showLeaderboard}
                onSubmit={submitAnswer}
                onNext={mode === 'self' ? () => send({ t: 'player:next' }) : undefined}
              />
            )}

            {step === 'leaderboard' && board && (
              <Leaderboard
                compact
                title={t.leaderboard}
                top={board.top}
                meId={me.id}
                me={board.me ? { ...board.me, nickname: me.nickname, avatar: me.avatar } : null}
              />
            )}

            {step === 'final' && final && <FinalStage final={final} me={me} t={t} rules={rules} />}
          </div>
        )}

        {step === 'kicked' && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-12 text-center">
            <h2 className="font-display text-2xl font-bold">{t.removedTitle}</h2>
            <p className="max-w-sm text-muted">{t.removedBody}</p>
            <button
              type="button"
              onClick={() => window.location.assign('/play')}
              className="mt-3 h-12 rounded-2xl bg-ink-900 px-6 font-bold text-white dark:bg-white dark:text-ink-900"
            >
              {t.joinAnother}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

export default function PlayPage() {
  return (
    <Suspense>
      <PlayFlow />
    </Suspense>
  );
}
