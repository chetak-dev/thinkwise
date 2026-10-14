'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, Copy, X } from 'lucide-react';
import type { CloudWord, RecentAnswer } from '@thinkwise/shared';
import { DEFAULT_THEME, formatNumberAnswer, usesOptions } from '@thinkwise/shared';
import { answerStyle } from '@/components/game/answers';
import { Confetti } from '@/components/game/Confetti';
import { Leaderboard } from '@/components/game/Leaderboard';
import { Podium } from '@/components/game/Podium';
import { QuestionImage } from '@/components/game/QuestionImage';
import { QuestionText } from '@/components/game/QuestionText';
import { TimerRing } from '@/components/game/TimerRing';
import type { StageState } from '@/lib/stage';

export function formatPin(pin: string) {
  return `${pin.slice(0, 3)} ${pin.slice(3)}`;
}

interface Flight {
  key: number;
  who: RecentAnswer;
}

function AnswerFlights({ recent }: { recent: RecentAnswer[] }) {
  const [flights, setFlights] = useState<Flight[]>([]);
  const seen = useRef<Set<string>>(new Set());
  const counter = useRef(0);

  useEffect(() => {
    const fresh = recent.filter((r) => !seen.current.has(r.id));
    if (recent.length === 0) seen.current.clear();
    if (fresh.length === 0) return;
    for (const r of fresh) seen.current.add(r.id);
    const added = fresh.slice(0, 3).map((who) => ({ key: ++counter.current, who }));
    setFlights((f) => [...f, ...added].slice(-4));
    const keys = new Set(added.map((a) => a.key));
    const id = setTimeout(() => setFlights((f) => f.filter((x) => !keys.has(x.key))), 2200);
    return () => clearTimeout(id);
  }, [recent]);

  return (
    <div className="decorative pointer-events-none absolute inset-x-3 bottom-3 z-20 flex min-h-20 items-end justify-center overflow-hidden" aria-hidden="true">
      {flights.map((f, i) => (
        <div
          key={f.key}
          className="flight absolute bottom-1 flex max-w-[18rem] items-center gap-2 rounded-full border border-white/20 bg-ink-950/90 px-4 py-2 font-display font-bold text-white shadow-[0_0_30px_rgba(109,74,255,.45)] backdrop-blur-md"
          style={{ left: `${20 + ((i * 23) % 60)}%` }}
        >
          <span className="text-xl">{f.who.avatar}</span>
          <span className="truncate">{f.who.nickname}</span>
          <span className="text-aqua-400">LOCKED IN</span>
        </div>
      ))}
    </div>
  );
}

const CLOUD_COLOURS = ['text-nova-500', 'text-aqua-500', 'text-rose-500', 'text-amber-500', 'text-emerald-500'];

function WordCloud({
  words,
  answered,
  show,
  revealed,
  big,
}: {
  words: CloudWord[];
  answered: number;
  show: boolean;
  revealed: boolean;
  big: boolean;
}) {
  const peak = Math.max(1, ...words.map((w) => w.count));
  // Biggest responses sit in the middle, smaller ones spread out to both sides.
  const arranged: CloudWord[] = [];
  words.forEach((w, i) => (i % 2 ? arranged.push(w) : arranged.unshift(w)));
  const [minRem, maxRem] = big ? [1.25, 5] : [1, 3.25];
  return (
    <div
      className={`rounded-[2rem] border p-6 text-center ${big ? 'border-white/10 bg-white/[.07] backdrop-blur-xl' : 'border-app bg-surface shadow-soft'}`}
    >
      {show && words.length > 0 ? (
        <ul aria-label="Word cloud" className={`flex flex-wrap items-center justify-center gap-x-5 gap-y-2 ${big ? 'min-h-64' : 'min-h-40'}`}>
          {arranged.map((w) => (
            <li
              key={w.text}
              className={`animate-pop font-display font-bold leading-tight transition-all duration-500 ${CLOUD_COLOURS[words.indexOf(w) % CLOUD_COLOURS.length]}`}
              style={{ fontSize: `${minRem + (maxRem - minRem) * Math.sqrt(w.count / peak)}rem` }}
            >
              {w.text}
              <span className="sr-only">: {w.count}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className={`font-display font-bold ${big ? 'text-3xl' : 'text-xl'}`}>
          {revealed ? 'No responses' : 'Players are typing their answers…'}
        </p>
      )}
      {revealed && (
        <p className={`mt-4 font-semibold text-muted tabular-nums ${big ? 'text-xl' : ''}`}>
          {answered} {answered === 1 ? 'response' : 'responses'}
        </p>
      )}
    </div>
  );
}

function RatingBars({
  min,
  counts,
  showCounts,
  showAverage,
  big,
}: {
  min: number;
  counts: number[];
  showCounts: boolean;
  showAverage: boolean;
  big: boolean;
}) {
  const total = counts.reduce((n, c) => n + c, 0);
  const peak = Math.max(1, ...counts);
  const average = total ? counts.reduce((n, c, i) => n + c * (min + i), 0) / total : null;
  return (
    <div className={`rounded-[2rem] border p-6 ${big ? 'border-white/10 bg-white/[.07] backdrop-blur-xl' : 'border-app bg-surface shadow-soft'}`}>
      <div className={`flex items-end gap-2 ${big ? 'h-64' : 'h-40'}`} role="img" aria-label="How players rated it">
        {counts.map((c, i) => (
          <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            {showCounts && <span className="text-sm font-semibold tabular-nums">{c}</span>}
            <div
              className="w-full rounded-t-xl bg-nova-500 transition-all duration-500"
              style={{ height: showCounts ? `${Math.max(4, (c / peak) * 100)}%` : '4%' }}
            />
            <span className={`font-display font-bold tabular-nums ${big ? 'text-2xl' : 'text-base'}`}>{min + i}</span>
          </div>
        ))}
      </div>
      {showAverage && (
        <p className={`mt-4 text-center font-semibold text-muted ${big ? 'text-xl' : ''}`}>
          {average === null ? 'No ratings yet' : `Average ${average.toFixed(1)} from ${total} ${total === 1 ? 'rating' : 'ratings'}`}
        </p>
      )}
    </div>
  );
}

export function Stage({
  state,
  big = false,
  joinUrl,
  qr,
  copied,
  onCopy,
  onKick,
  finishedActions,
}: {
  state: StageState;
  big?: boolean;
  joinUrl: string;
  qr: string;
  copied?: boolean;
  onCopy?: () => void;
  onKick?: (playerId: string) => void;
  finishedActions?: ReactNode;
}) {
  const { phase, pin, players, question, progress, settings, correct, timer, rules } = state;
  const branded = rules.themeColour.toLowerCase() !== DEFAULT_THEME;

  if (phase === 'connecting') {
    return <p className="py-24 text-center font-display text-2xl font-bold text-muted">Opening the game…</p>;
  }

  if (phase === 'lobby') {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center gap-8">
        <div
          className="arena-sheen nova-gradient grid w-full items-center gap-6 rounded-[2rem] border border-white/15 p-6 text-white shadow-[0_30px_90px_-24px_rgba(109,74,255,.7)] sm:p-10 md:grid-cols-[1fr_auto]"
          style={branded ? { background: `linear-gradient(135deg, ${rules.themeColour}, color-mix(in srgb, ${rules.themeColour} 55%, #0c0a1d))` } : undefined}
        >
          <div>
            {rules.orgName && <p className="mb-2 text-sm font-bold uppercase tracking-[.18em] text-white/75">{rules.orgName}</p>}
            <p className="text-lg font-semibold text-white/80">
              Go to <span className="font-bold text-white">{joinUrl ? `${new URL(joinUrl).host}/play` : '…'}</span> and
              enter
            </p>
            <p
              className="mt-2 whitespace-nowrap font-display text-6xl font-bold tracking-[0.15em] sm:text-8xl"
              aria-label={pin ? `Game PIN ${pin.split('').join(' ')}` : 'Creating game'}
            >
              {pin ? formatPin(pin) : '··· ···'}
            </p>
            {onCopy && (
              <button
                type="button"
                onClick={onCopy}
                disabled={!joinUrl}
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-white/15 px-4 py-2 text-sm font-semibold hover:bg-white/25 disabled:opacity-50"
              >
                <Copy className="size-4" aria-hidden="true" />
                {copied ? 'Copied!' : 'Copy join link'}
              </button>
            )}
          </div>
          <figure className="flex flex-col items-center gap-2 justify-self-center">
            <div
              className={`${big ? 'size-60 p-4' : 'size-48 p-3.5'} rounded-3xl bg-white shadow-[0_18px_50px_-18px_rgba(12,10,29,.8)] ring-4 ring-white/25`}
            >
              {qr && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qr} alt={`QR code to join: ${joinUrl}`} className="size-full" />
              )}
            </div>
            <figcaption className="text-sm font-semibold text-white/80">Scan to join</figcaption>
          </figure>
        </div>

        <div className="w-full text-center">
          {rules.welcomeMessage && (
            <p className={`mx-auto mb-3 max-w-2xl whitespace-pre-line font-semibold ${big ? 'text-2xl' : 'text-lg'}`}>
              {rules.welcomeMessage}
            </p>
          )}
          <p className="font-display text-2xl font-bold" aria-live="polite">
            {players.length === 0
              ? 'Waiting for players…'
              : `${players.length} ${players.length === 1 ? 'player' : 'players'} in the lobby`}
          </p>
        </div>

        <ul aria-label="Players in the lobby" className="flex max-w-5xl flex-wrap justify-center gap-2">
          {players.map((p) => (
            <li
              key={p.id}
              className="group flex animate-pop items-center gap-2 rounded-full border border-nova-200/60 bg-surface px-4 py-2 font-semibold text-app shadow-soft transition hover:-translate-y-0.5 hover:shadow-lift dark:border-nova-800"
            >
              <span className="grid size-8 place-items-center rounded-full bg-nova-100 text-lg dark:bg-nova-900" aria-hidden="true">
                {p.avatar}
              </span>
              <span className={p.connected ? '' : 'text-muted'}>{p.nickname}</span>
              <span
                className={`size-2 rounded-full ${p.connected ? 'bg-emerald-400 shadow-[0_0_10px_#34d399]' : 'bg-gray-400'}`}
                role="img"
                aria-label={p.connected ? 'Online' : 'Offline'}
              />
              {onKick && (
                <button
                  type="button"
                  onClick={() => onKick(p.id)}
                  aria-label={`Remove ${p.nickname}`}
                  className="-mr-1 hidden rounded-full p-0.5 text-muted hover:bg-rose-100 hover:text-rose-700 group-hover:inline-flex group-focus-within:inline-flex focus:inline-flex dark:hover:bg-rose-950 dark:hover:text-rose-300"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if ((phase === 'question' || phase === 'reveal') && question) {
    const answeredTotal = progress && progress.total > 0 ? progress.total : players.length;
    const recent = progress?.recent ?? [];
    const { accepted, numeric, blankAnswers } = state.answerKey;
    const keyChips = accepted?.length
      ? accepted
      : numeric
        ? [formatNumberAnswer(numeric.answer, numeric.tolerance)]
        : (blankAnswers ?? []).map((b, i) => `${i + 1}. ${b.join(' / ')}`);
    return (
      <div className="relative mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6">
        {big && settings.liveCounts && phase === 'question' && <AnswerFlights recent={recent} />}
        <div className="flex items-center justify-between gap-4">
          <span className="inline-flex items-center gap-1 rounded-full bg-nova-100 px-2.5 py-0.5 text-xs font-semibold text-nova-800 dark:bg-nova-900/60 dark:text-nova-200">
            Question {question.index + 1} / {question.total}
          </span>
          <div className="flex items-center gap-4">
            {(settings.liveCounts || phase === 'reveal') && progress && (
              <span className="text-sm font-semibold text-muted tabular-nums" aria-live="polite">
                {progress.answered} / {answeredTotal} answered
              </span>
            )}
            {phase === 'question' && timer?.paused && (
              <span className="rounded-full bg-sun-500/20 px-2.5 py-0.5 text-xs font-bold text-amber-800 dark:text-amber-200">
                Paused
              </span>
            )}
            {phase === 'question' && <TimerRing timer={timer} size={big ? 72 : 56} />}
          </div>
        </div>

        {settings.liveCounts && recent.length > 0 && (
          <div className="flex items-center gap-2 overflow-hidden rounded-2xl border border-aqua-400/20 bg-aqua-400/10 px-3 py-2">
            <span className="shrink-0 text-xs font-bold uppercase tracking-[.14em] text-aqua-600 dark:text-aqua-300">
              Just answered
            </span>
            <div className="flex min-w-0 gap-2 overflow-hidden">
              {recent.map((r) => (
                <span
                  key={r.id}
                  className="animate-pop whitespace-nowrap rounded-full bg-surface px-2.5 py-1 text-xs font-semibold text-app"
                >
                  <span aria-hidden="true">{r.avatar}</span> {r.nickname}
                </span>
              ))}
            </div>
          </div>
        )}

        <div
          className={`space-y-5 rounded-[2rem] border p-6 text-center shadow-lift sm:p-10 ${
            big ? 'border-white/10 bg-white/[.07] backdrop-blur-xl' : 'border-app bg-surface'
          }`}
        >
          {question.imageUrl && (
            <QuestionImage key={question.imageUrl} url={question.imageUrl} className={big ? 'max-h-[40vh]' : 'max-h-64'} />
          )}
          <h2 className={`font-display font-bold leading-tight ${big ? 'text-4xl sm:text-5xl' : 'text-2xl sm:text-3xl'}`}>
            <QuestionText text={question.text} blanks={question.type === 'blanks'} />
          </h2>
          {question.type === 'multi' && phase === 'question' && (
            <p className={`font-semibold text-muted ${big ? 'text-xl' : 'text-sm'}`}>Pick every right answer</p>
          )}
          {question.type === 'poll' && phase === 'question' && (
            <p className={`font-semibold text-muted ${big ? 'text-xl' : 'text-sm'}`}>
              {question.multiple ? 'Poll · pick as many as you like' : 'Poll · no right or wrong answer'}
            </p>
          )}
          {question.type === 'cloud' && phase === 'question' && (
            <p className={`font-semibold text-muted ${big ? 'text-xl' : 'text-sm'}`}>
              Word cloud · {question.maxWords && question.maxWords > 1 ? `up to ${question.maxWords} words` : 'one word'} each
            </p>
          )}
        </div>

        {!usesOptions(question.type) && question.type !== 'order' && question.type !== 'rating' && question.type !== 'cloud' && (
          <div
            className={`rounded-[2rem] border p-6 text-center ${
              big ? 'border-white/10 bg-white/[.07] backdrop-blur-xl' : 'border-app bg-surface shadow-soft'
            }`}
          >
            {phase === 'reveal' && keyChips.length > 0 ? (
              <>
                <p className="text-xs font-bold uppercase tracking-[.14em] text-muted">
                  {question.type === 'numeric' ? 'Correct answer' : question.type === 'blanks' ? 'Answers for each blank' : 'Accepted answers'}
                </p>
                <ul className="mt-3 flex flex-wrap justify-center gap-2">
                  {keyChips.map((a) => (
                    <li
                      key={a}
                      className={`inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2 font-bold text-white ${big ? 'text-2xl' : 'text-lg'}`}
                    >
                      <Check className="size-5" aria-hidden="true" />
                      {a}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className={`font-display font-bold ${big ? 'text-3xl' : 'text-xl'}`}>
                {phase === 'reveal' ? 'Answers are hidden for this quiz' : 'Players are typing their answers…'}
              </p>
            )}
            {phase === 'reveal' && state.rightCount !== null && (
              <p className={`mt-3 font-semibold text-muted tabular-nums ${big ? 'text-xl' : ''}`}>
                {state.rightCount} of {progress?.answered ?? 0} got it right
              </p>
            )}
          </div>
        )}

        {question.type === 'order' && (
          <div
            className={`rounded-[2rem] border p-6 ${big ? 'border-white/10 bg-white/[.07] backdrop-blur-xl' : 'border-app bg-surface shadow-soft'}`}
          >
            <p className="text-center text-xs font-bold uppercase tracking-[.14em] text-muted">
              {phase === 'reveal' && correct.length ? 'Right order' : 'Put these in order'}
            </p>
            <ol className={`mx-auto mt-3 max-w-xl space-y-2 ${big ? 'text-2xl' : 'text-lg'}`}>
              {(phase === 'reveal' && correct.length ? correct : question.options.map((_, i) => i)).map((item, pos) => (
                <li
                  key={item}
                  className={`flex items-center gap-3 rounded-2xl px-4 py-2 font-bold ${
                    phase === 'reveal' && correct.length ? 'bg-emerald-500 text-white' : 'bg-surface-2'
                  }`}
                >
                  <span className="w-6 text-center tabular-nums opacity-70">
                    {phase === 'reveal' && correct.length ? pos + 1 : String.fromCharCode(65 + pos)}
                  </span>
                  <span className="min-w-0 flex-1 break-words">{question.options[item]}</span>
                </li>
              ))}
            </ol>
            {phase === 'reveal' && !correct.length && <p className="mt-3 text-center text-muted">Answers are hidden for this quiz</p>}
            {phase === 'reveal' && state.rightCount !== null && (
              <p className={`mt-3 text-center font-semibold text-muted tabular-nums ${big ? 'text-xl' : ''}`}>
                {state.rightCount} of {progress?.answered ?? 0} got it exactly right
              </p>
            )}
          </div>
        )}

        {question.type === 'cloud' && (
          <WordCloud
            words={progress?.words ?? []}
            answered={progress?.answered ?? 0}
            show={settings.liveCounts || phase === 'reveal'}
            revealed={phase === 'reveal'}
            big={big}
          />
        )}

        {question.type === 'rating' && question.scale && (
          <RatingBars
            min={question.scale.min}
            counts={progress?.counts ?? []}
            showCounts={settings.liveCounts || phase === 'reveal'}
            showAverage={phase === 'reveal'}
            big={big}
          />
        )}

        {usesOptions(question.type) && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {question.options.map((label, i) => {
              const style = answerStyle(i);
              const count = progress?.counts[i] ?? 0;
              const total = progress?.answered ?? 0;
              const share = total > 0 ? count / total : 0;
              const showCounts = settings.liveCounts || phase === 'reveal';
              const isCorrect = correct.includes(i);
              // Polls (and quizzes that hide answers) have nothing to highlight, so keep every option bright.
              const dimmed = phase === 'reveal' && correct.length > 0 && !isCorrect;
              return (
                <div
                  key={i}
                  className={`relative overflow-hidden rounded-2xl text-white shadow-soft transition-opacity ${style.bg} ${
                    big ? 'min-h-24 p-5 text-2xl' : 'min-h-16 p-4 text-lg'
                  } ${dimmed ? 'opacity-40' : ''}`}
                >
                  {showCounts && (
                    <div
                      className="absolute inset-y-0 right-0 bg-ink-950/35 transition-all duration-500"
                      style={{ width: `${(1 - share) * 100}%` }}
                      aria-hidden="true"
                    />
                  )}
                  <div className="relative flex items-center gap-3 font-bold">
                    <style.Icon className="size-6 shrink-0" aria-hidden="true" />
                    <span className="sr-only">{style.letter}.</span>
                    <span className="min-w-0 flex-1 break-words">{label}</span>
                    {phase === 'reveal' && isCorrect && <Check className="size-7 shrink-0" aria-label="Correct answer" />}
                    {showCounts && <span className="tabular-nums">{count}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {phase === 'reveal' && state.explanation && (
          <div
            className={`animate-rise rounded-3xl border p-5 text-left ${
              big ? 'border-white/10 bg-white/[.07] text-xl backdrop-blur-xl' : 'border-app bg-surface shadow-soft'
            }`}
          >
            <p className="text-xs font-bold uppercase tracking-[.14em] text-muted">Why</p>
            <p className="mt-1 whitespace-pre-line leading-relaxed">{state.explanation}</p>
          </div>
        )}
      </div>
    );
  }

  if (phase === 'leaderboard') {
    return <Leaderboard title="Leaderboard" top={state.top} large={big} />;
  }

  if (phase === 'self') {
    const progress = state.selfProgress;
    const percent = progress?.percent ?? 0;
    return (
      <div className="mx-auto w-full max-w-4xl space-y-8">
        <div className={`rounded-3xl p-6 ${big ? 'border border-white/10 bg-white/[.07] backdrop-blur-xl' : 'bg-surface shadow-soft'}`}>
          <p className="text-sm font-semibold text-muted">Self-paced in progress</p>
          <div className="mt-3 flex flex-wrap items-end gap-x-6 gap-y-1">
            <p className={`font-display font-bold tabular-nums ${big ? 'text-7xl' : 'text-5xl'}`}>{percent}%</p>
            <p className="pb-2 text-muted">
              average progress · {progress?.finished ?? 0} of {progress?.total ?? players.length} finished
            </p>
          </div>
          <div
            className="mt-4 h-4 overflow-hidden rounded-full bg-surface-2"
            role="progressbar"
            aria-label="Average progress"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,#6d4aff,#ff5d73)] transition-all duration-700"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
        {rules.showLeaderboard && <Leaderboard title="Live leaderboard" top={progress?.top ?? []} compact large={big} />}
      </div>
    );
  }

  if (phase === 'finished') {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-8 py-6 text-center">
        {rules.gamification && <Confetti key={`confetti-${state.celebration}`} />}
        {rules.showLeaderboard ? (
          <>
            <h2 className="font-display text-4xl font-bold">{rules.gamification ? '🎉 And the winners are…' : 'Final results'}</h2>
            <Podium key={`podium-${state.celebration}`} standings={state.podium} />
            {state.podium.length === 0 && <p className="text-muted">Nobody joined this game.</p>}
          </>
        ) : (
          <>
            <h2 className="font-display text-4xl font-bold">That’s the end of the quiz</h2>
            <p className="text-muted">
              {players.length} {players.length === 1 ? 'player' : 'players'} took part. Thanks for playing!
            </p>
          </>
        )}
        {rules.completionMessage && (
          <p className={`max-w-2xl whitespace-pre-line font-semibold ${big ? 'text-2xl' : 'text-lg'}`}>{rules.completionMessage}</p>
        )}
        {finishedActions}
      </div>
    );
  }

  return null;
}
