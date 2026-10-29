'use client';

import { Suspense, useEffect, useRef, useState, type FormEvent } from 'react';
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
  type AnswerProblem,
  type Avatar,
  type FeedbackAnswers,
  type GameMode,
  type PlayerAnswer,
  type PublicQuestion,
  type PublicRules,
  type ServerMessage,
  type Standing,
  type TrackId,
} from '@thinkwise/shared';
import { Logo } from '@/components/Logo';
import { PageLoader } from '@/components/PageLoader';
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
import { EventFeedbackForm, type PlayEventForm } from '@/components/play/EventFeedbackForm';
import { AnswerButtons, AnswerSummary, SUBMIT_CLASS, type AnswerInput } from '@/components/play/AnswerInputs';

type Step = 'pin' | 'checking' | 'profile' | 'feedback' | 'lobby' | 'question' | 'result' | 'leaderboard' | 'final' | 'kicked';

interface Me {
  id: string;
  nickname: string;
  avatar: string;
}

type Result = Extract<ServerMessage, { t: 'result' }>;
type Final = Extract<ServerMessage, { t: 'final' }>;

const tokenKey = (pin: string) => `tw-player-${pin}`;
const feedbackDoneKey = (pin: string, stage: 'before' | 'after') => `tw-feedback-${stage}-done-${pin}`;
const eventRefKey = (pin: string) => `tw-event-ref-${pin}`;

/** Stable per PIN, so a retried submit isn't stored twice. randomUUID needs HTTPS, hence the fallback. */
function feedbackClientId(pin: string) {
  const key = `tw-feedback-id-${pin}`;
  let id = localStorage.getItem(key);
  if (!id) {
    id = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
    localStorage.setItem(key, id);
  }
  return id;
}

/** The event behind this PIN. Once found, its ref keeps working after the game ends (for after-quiz feedback). */
async function loadEventForm(pin: string): Promise<PlayEventForm | null> {
  const ref = localStorage.getItem(eventRefKey(pin));
  try {
    const res = await fetch(`/api/play/event?${ref ? `ref=${encodeURIComponent(ref)}` : `pin=${pin}`}`, { cache: 'no-store' });
    const event = res.ok ? ((await res.json()) as { event: PlayEventForm | null }).event : null;
    if (event) localStorage.setItem(eventRefKey(pin), event.ref);
    return event;
  } catch {
    // Without the form the player can still join the game.
    return null;
  }
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
  const rawPin = (params.get('pin') ?? '').replace(/\D/g, '');
  const selfLink = rawPin.length === 7;
  const linkPin = selfLink ? '' : rawPin.slice(0, 6);
  useEffect(() => {
    if (selfLink) window.location.replace(`/play/self?pin=${rawPin}`);
  }, [selfLink, rawPin]);
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
  const [eventForm, setEventForm] = useState<PlayEventForm | null>(null);
  const [afterDone, setAfterDone] = useState(false);
  const eventFormLoad = useRef<Promise<PlayEventForm | null> | null>(null);

  const ensureEventForm = (p: string) => {
    eventFormLoad.current ??= loadEventForm(p).then((event) => {
      setEventForm(event);
      setAfterDone(!!localStorage.getItem(feedbackDoneKey(p, 'after')));
      return event;
    });
    return eventFormLoad.current;
  };

  useEffect(() => {
    setAvatar(AVATARS[Math.floor(Math.random() * AVATARS.length)]!);
  }, []);

  const inGame = step !== 'pin' && step !== 'checking' && step !== 'profile' && step !== 'feedback';
  // A join link carries the PIN, so skip the PIN screen unless the check fails.
  const joiningByLink = linkPin.length === 6 && !error && (step === 'pin' || step === 'checking');
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
          void ensureEventForm(msg.pin);
          setStep('profile');
          break;
        case 'player:ready':
          localStorage.setItem(tokenKey(msg.pin), msg.playerToken);
          setPin(msg.pin);
          // Rejoining players skip the PIN screen, so look the event up here too.
          void ensureEventForm(msg.pin);
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
          } else if (step === 'profile' || step === 'feedback') {
            setStep('profile');
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
    if (clean.length === 7) {
      window.location.assign(`/play/self?pin=${clean}`);
      return;
    }
    if (clean.length !== 6) {
      setError(t.pinInvalid);
      return;
    }
    setError(null);
    setStep('checking');
    send({ t: 'pin:check', pin: clean });
  };

  const join = () => {
    if (!pin) return;
    setError(null);
    send({ t: 'player:join', pin, nickname: nickname.trim(), avatar });
  };

  const submitProfile = async (e: FormEvent) => {
    e.preventDefault();
    if (!pin || !nickname.trim()) return;
    const event = await ensureEventForm(pin);
    if (event?.before && !localStorage.getItem(feedbackDoneKey(pin, 'before'))) {
      setStep('feedback');
      window.scrollTo({ top: 0 });
      return;
    }
    join();
  };

  const sendFeedback = async (stage: 'before' | 'after', answers: FeedbackAnswers): Promise<'ok' | 'failed' | Record<string, AnswerProblem>> => {
    if (!pin || !eventForm) return 'failed';
    try {
      const res = await fetch('/api/play/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ref: eventForm.ref,
          stage,
          clientId: feedbackClientId(pin),
          nickname: stage === 'after' && me ? me.nickname : nickname.trim(),
          answers,
        }),
      });
      if (res.status === 422) return ((await res.json()) as { problems: Record<string, AnswerProblem> }).problems;
      // 404: the event has gone, so there's nothing to hold the player back for.
      if (!res.ok && res.status !== 404) return 'failed';
    } catch {
      return 'failed';
    }
    localStorage.setItem(feedbackDoneKey(pin, stage), '1');
    if (stage === 'before') join();
    else setAfterDone(true);
    return 'ok';
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
        {(joiningByLink || selfLink) && <PageLoader label={t.joiningGame} />}

        {(step === 'pin' || step === 'checking') && !joiningByLink && !selfLink && (
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
                {(step === 'checking' || status === 'connecting') && <Loader2 className="size-5 animate-spin" aria-hidden="true" />}
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

        {step === 'feedback' && eventForm?.before && (
          <EventFeedbackForm
            form={eventForm.before}
            title={eventForm.before.title || eventForm.title}
            description={eventForm.before.description || eventForm.description}
            intro={t.welcomeName(nickname.trim())}
            submitLabel={t.sendFeedback}
            note={t.feedbackNote}
            t={t}
            onSubmit={(answers) => sendFeedback('before', answers)}
            onSkip={eventForm.required ? undefined : join}
          />
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
            {step === 'final' && eventForm?.after && (
              <div className="-mx-4 mt-8">
                {afterDone ? (
                  <p role="status" className="glass-panel mx-4 rounded-2xl p-5 text-center font-display text-lg font-bold">
                    {t.feedbackThanks}
                  </p>
                ) : (
                  <EventFeedbackForm
                    form={eventForm.after}
                    title={eventForm.after.title || eventForm.title}
                    description={eventForm.after.description}
                    intro={t.afterIntro}
                    submitLabel={t.sendAfter}
                    t={t}
                    onSubmit={(answers) => sendFeedback('after', answers)}
                  />
                )}
              </div>
            )}
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
