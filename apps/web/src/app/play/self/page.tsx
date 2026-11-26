'use client';

import { Suspense, useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  ArrowLeft, ArrowRight, CalendarClock, Check, CheckCircle2, Clock, Feather, History, LayoutGrid, Lightbulb, ListChecks, Loader2, Minus,
  Pencil, RefreshCw, Timer, Volume2, VolumeX, X,
} from 'lucide-react';
import { isScored, type PlayerAnswer, type PublicQuestion } from '@thinkwise/shared';
import type { SelfInfo, SelfPlayerState } from '@thinkwise/db';
import { Logo } from '@/components/Logo';
import { Modal } from '@/components/Modal';
import { PageLoader } from '@/components/PageLoader';
import { Confetti } from '@/components/game/Confetti';
import { QuestionImage } from '@/components/game/QuestionImage';
import { QuestionText } from '@/components/game/QuestionText';
import { AnswerButtons, AnswerSummary, previewAnswer, SUBMIT_CLASS, type AnswerInput } from '@/components/play/AnswerInputs';
import { usePrefs, type Lang } from '@/lib/prefs';
import { LANGUAGES, STRINGS, type Strings } from '@/lib/i18n';
import { setSoundEnabled, useAudioPlaying, useSound } from '@/lib/audio';

const tokenKey = (pin: string) => `tw-self-${pin}`;
const LOCALES: Record<Lang, string> = { en: 'en-IN', hi: 'hi-IN', or: 'or-IN' };

type Step = 'pin' | 'loading' | 'info' | 'quiz' | 'review' | 'done';

async function post<T>(body: Record<string, unknown>): Promise<{ status: number; data: T | null }> {
  try {
    const res = await fetch('/api/self', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
    if (res.status === 401 || res.status === 403) toSignIn(data?.error === 'profile' ? 'profile' : 'sign_in', String(body.pin ?? ''));
    return { status: res.status, data };
  } catch {
    return { status: 0, data: null };
  }
}

/** Self-paced quizzes need an account with a complete profile. */
function toSignIn(reason: 'sign_in' | 'profile', pin: string) {
  const next = encodeURIComponent(pin ? `/play/self?pin=${pin}` : '/play/self');
  window.location.assign(reason === 'profile' ? `/welcome?next=${next}` : `/login?next=${next}`);
}

function formatWhen(ms: number, lang: Lang) {
  return new Intl.DateTimeFormat(LOCALES[lang], { dateStyle: 'medium', timeStyle: 'short' }).format(ms);
}

function formatClock(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** One line describing a saved answer, for the review list. */
function answerLine(q: PublicQuestion, a: PlayerAnswer, t: Strings) {
  if (a.text !== undefined) return a.text;
  if (a.number !== undefined) return String(a.number);
  if (a.blanks) return a.blanks.map((b, i) => `${i + 1}. ${b || '—'}`).join('  ');
  const label = (i: number) => (q.type === 'tf' ? (i === 0 ? t.answerTrue : t.answerFalse) : q.options[i]);
  return a.choices.map(label).join(q.type === 'order' ? ' → ' : ', ');
}

function SelfFlow() {
  const params = useSearchParams();
  const linkPin = (params.get('pin') ?? '').replace(/\D/g, '').slice(0, 7);
  const [prefs, setPrefs] = usePrefs();
  const t = STRINGS[prefs.lang];

  const [step, setStep] = useState<Step>(linkPin.length === 7 ? 'loading' : 'pin');
  const [pinInput, setPinInput] = useState(linkPin);
  const [pin, setPin] = useState(linkPin.length === 7 ? linkPin : '');
  const [info, setInfo] = useState<SelfInfo | null>(null);
  const [state, setState] = useState<SelfPlayerState | null>(null);
  const [language, setLanguage] = useState('');
  const [signedIn, setSignedIn] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [index, setIndex] = useState(0);
  const [hintFor, setHintFor] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const offset = useRef(0);
  const opened = useRef(new Set<number>());
  const submitting = useRef(false);
  // Typed, ordered and multi-pick answers stay on the phone until saved; moving on saves them.
  const draft = useRef<{ at: number; input: AnswerInput } | null>(null);
  const flushRef = useRef<() => void>(() => {});

  const token = () => (pin ? localStorage.getItem(tokenKey(pin)) : null);

  const applyState = useCallback((s: SelfPlayerState) => {
    offset.current = s.serverNow - Date.now();
    setState(s);
    setStep((prev) => (s.submitted || s.state === 'closed' ? 'done' : prev === 'review' ? 'review' : 'quiz'));
  }, []);

  const refresh = useCallback(async () => {
    const tok = pin ? localStorage.getItem(tokenKey(pin)) : null;
    if (!tok) return false;
    const { status, data } = await post<{ state: SelfPlayerState }>({ action: 'state', token: tok, pin });
    if (data && 'state' in data && data.state) {
      applyState(data.state);
      return true;
    }
    if (status === 404) localStorage.removeItem(tokenKey(pin));
    return false;
  }, [pin, applyState]);

  // Look the PIN up: carry on an attempt from this device, or show the quiz's details.
  useEffect(() => {
    if (!pin) return;
    let cancelled = false;
    void (async () => {
      if (await refresh()) return;
      try {
        const res = await fetch(`/api/self?pin=${pin}`, { cache: 'no-store' });
        const body = (await res.json()) as { info?: SelfInfo; signedIn?: boolean };
        if (cancelled) return;
        if (!body.info) {
          setError(t.selfNotFound);
          setStep('pin');
          return;
        }
        offset.current = body.info.serverNow - Date.now();
        setSignedIn(body.signedIn !== false);
        setInfo(body.info);
        setLanguage(body.info.mine?.language ?? (body.info.languages.length === 1 ? body.info.languages[0]! : ''));
        // An attempt already started (maybe on another device) carries on where it was left.
        if (body.info.mine && body.info.state !== 'upcoming') {
          const { data } = await post<{ token?: string }>({ action: 'join', pin });
          if (cancelled) return;
          if (data?.token) {
            localStorage.setItem(tokenKey(pin), data.token);
            if (await refresh()) return;
          }
        }
        setStep('info');
      } catch {
        if (!cancelled) {
          setError(t.selfJoinFailed);
          setStep('pin');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // Strings only change the error wording.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin, refresh]);

  const active = step === 'quiz' || step === 'review';
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [active]);

  const remaining = state ? state.deadlineAt - (now + offset.current) : 0;

  const submit = useCallback(
    async (auto: boolean) => {
      const tok = token();
      if (!tok || submitting.current) return;
      flushRef.current();
      submitting.current = true;
      setBusy(true);
      await saveQueue.current;
      await post({ action: 'submit', token: tok, pin });
      if (auto) setTimedOut(true);
      setConfirming(false);
      await refresh();
      setBusy(false);
      submitting.current = false;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pin, refresh],
  );

  useEffect(() => {
    if (active && state && remaining <= 0) void submit(true);
  }, [active, state, remaining, submit]);

  // The clock for speed points starts when a question is first seen.
  useEffect(() => {
    const tok = token();
    if (step !== 'quiz' || !tok || opened.current.has(index)) return;
    opened.current.add(index);
    void post({ action: 'open', token: tok, pin, index });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, index]);

  // Leaving the page while answering is counted for the host.
  useEffect(() => {
    if (!active || !pin) return;
    const onHide = () => {
      const tok = localStorage.getItem(tokenKey(pin));
      if (document.visibilityState !== 'hidden' || !tok || submitting.current) return;
      const body = JSON.stringify({ action: 'away', token: tok });
      if (!navigator.sendBeacon?.('/api/self', new Blob([body], { type: 'application/json' }))) void post({ action: 'away', token: tok, pin });
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [active, pin]);

  useSound(prefs.sound, state?.track ?? null, prefs.sound && prefs.music && active, prefs.volume);
  const audioPlaying = useAudioPlaying();
  const toggleSound = () => {
    const next = !(prefs.sound && audioPlaying);
    setSoundEnabled(next);
    setPrefs({ sound: next });
  };

  const submitPin = (e: FormEvent) => {
    e.preventDefault();
    const clean = pinInput.replace(/\D/g, '');
    if (clean.length === 6) {
      window.location.assign(`/play?pin=${clean}`);
      return;
    }
    if (clean.length !== 7) {
      setError(t.pinInvalid);
      return;
    }
    setError(null);
    setStep('loading');
    setPin(clean);
  };

  const join = async (e: FormEvent) => {
    e.preventDefault();
    if (!signedIn) return toSignIn('sign_in', pin);
    if (busy || (info?.languages.length && !language)) return;
    setBusy(true);
    setError(null);
    const { data } = await post<{ token?: string; error?: string }>({
      action: 'join',
      pin,
      ...(language ? { language } : {}),
    });
    if (data?.token) {
      localStorage.setItem(tokenKey(pin), data.token);
      setIndex(0);
      await refresh();
    } else {
      const reason = data?.error;
      setError(
        reason === 'closed'
          ? t.selfClosed
          : reason === 'upcoming'
            ? t.selfUpcoming
            : reason === 'not_found'
              ? t.selfNotFound
              : t.selfJoinFailed,
      );
    }
    setBusy(false);
  };

  // Answers show at once; saves go to the server one after another in the background.
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());
  const saveSeq = useRef(new Map<number, number>());

  const setAnswer = (at: number, answer: PlayerAnswer | null) =>
    setState((s) => {
      if (!s) return s;
      const answers = { ...s.answers };
      if (answer) answers[at] = answer;
      else delete answers[at];
      return { ...s, answers };
    });

  const save = (input: AnswerInput | null, at = index, advance = true) => {
    const tok = token();
    if (!tok || !state || busy) return;
    if (draft.current?.at === at) draft.current = null;
    setError(null);
    const previous = state.answers[at] ?? null;
    const seq = (saveSeq.current.get(at) ?? 0) + 1;
    saveSeq.current.set(at, seq);
    setAnswer(at, input ? previewAnswer(input) : null);
    if (input && advance) {
      // Go on to the next question still to answer, or to the review once every one has an answer.
      const total = state.questions.length;
      const answered = new Set(Object.keys(state.answers).map(Number)).add(at);
      const nextOpen = [...Array(total).keys()].map((k) => (at + 1 + k) % total).find((k) => !answered.has(k));
      if (nextOpen === undefined) setStep('review');
      else setIndex(nextOpen);
    }
    saveQueue.current = saveQueue.current.then(async () => {
      const { status, data } = await post<{ answer?: PlayerAnswer | null }>({ action: 'save', token: tok, pin, index: at, answer: input });
      const latest = saveSeq.current.get(at) === seq;
      if (status === 200) {
        if (latest && data && 'answer' in data) setAnswer(at, data.answer ?? null);
        return;
      }
      if (status === 409) {
        await refresh();
        return;
      }
      if (latest) {
        setAnswer(at, previous);
        setIndex(at);
        setStep((s) => (s === 'review' ? 'quiz' : s));
        setError(t.saveFailed);
      }
    });
  };

  const flushDraft = () => {
    const d = draft.current;
    draft.current = null;
    if (!d || !state) return;
    const saved = state.answers[d.at];
    if (saved && JSON.stringify(previewAnswer(d.input)) === JSON.stringify(saved)) return;
    save(d.input, d.at, false);
  };
  useEffect(() => {
    flushRef.current = flushDraft;
  });
  const go = (to: number) => {
    flushDraft();
    setIndex(to);
  };
  const toReview = () => {
    flushDraft();
    setStep('review');
  };

  const questions = state?.questions ?? [];
  const question = questions[index];
  const answeredCount = state ? Object.keys(state.answers).length : 0;
  const lowTime = remaining < 60_000;

  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only-focusable fixed left-3 top-3 z-[100] rounded-lg bg-nova-600 px-4 py-2 font-semibold text-white">
        Skip to content
      </a>
      <div className="decorative arena-grid pointer-events-none absolute inset-0 -z-10" aria-hidden="true" />

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

      <main id="main" className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 pb-10">
        {step === 'loading' && <PageLoader label={t.joiningGame} />}

        {step === 'pin' && (
          <div className="flex flex-1 items-center justify-center pb-16">
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
                className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-ink-900 text-lg font-bold text-white dark:bg-white dark:text-ink-900"
              >
                {t.enter}
              </button>
            </form>
          </div>
        )}

        {step === 'info' && info && (
          <div className="flex flex-1 items-center justify-center pb-16">
            <div className="glass-panel w-full max-w-md animate-rise space-y-5 rounded-[2rem] p-7">
              <div className="text-center">
                <h1 className="font-display text-2xl font-bold">{info.title}</h1>
                {info.rules.welcomeMessage && <p className="mt-2 whitespace-pre-line text-sm text-muted">{info.rules.welcomeMessage}</p>}
              </div>
              <ul className="space-y-1.5 text-sm font-semibold">
                <li className="flex items-center gap-2">
                  <ListChecks className="size-4 text-nova-600" aria-hidden="true" />
                  {t.selfQuestions(info.questionCount)}
                </li>
                <li className="flex items-center gap-2">
                  <Timer className="size-4 text-nova-600" aria-hidden="true" />
                  {t.selfTimeLimit(Math.round(info.timeLimitMs / 60_000))}
                </li>
                {info.state === 'upcoming' && info.opensAt && (
                  <li className="flex items-center gap-2">
                    <CalendarClock className="size-4 text-nova-600" aria-hidden="true" />
                    {t.selfOpens(formatWhen(info.opensAt, prefs.lang))}
                  </li>
                )}
                {info.state !== 'closed' && info.closesAt && (
                  <li className="flex items-center gap-2">
                    <Clock className="size-4 text-nova-600" aria-hidden="true" />
                    {t.selfCloses(formatWhen(info.closesAt, prefs.lang))}
                  </li>
                )}
              </ul>

              {info.state === 'open' && !signedIn ? (
                <div className="space-y-4">
                  <p className="rounded-2xl bg-nova-500/10 px-4 py-3 text-sm">{t.signInNote}</p>
                  <button type="button" onClick={() => toSignIn('sign_in', pin)} className={SUBMIT_CLASS}>
                    {t.signInToPlay}
                  </button>
                </div>
              ) : info.state === 'open' ? (
                <form onSubmit={join} className="space-y-5">
                  {info.mine && (
                    <p role="status" className="rounded-2xl bg-sun-500/15 px-4 py-3 text-sm font-semibold">
                      {t.alreadyStarted(info.mine.language)}
                    </p>
                  )}
                  {info.languages.length > 0 && !info.mine && (
                    <fieldset>
                      <legend className="mb-2 text-sm font-semibold">{t.questionLanguage}</legend>
                      <div className="flex flex-wrap gap-2">
                        {info.languages.map((l) => (
                          <button
                            key={l}
                            type="button"
                            aria-pressed={language === l}
                            onClick={() => setLanguage(l)}
                            className={`rounded-xl border-2 px-4 py-2 text-sm font-bold transition ${
                              language === l ? 'border-nova-500 bg-nova-100 dark:bg-nova-900' : 'border-app hover:bg-surface-2'
                            }`}
                          >
                            {l}
                          </button>
                        ))}
                      </div>
                      <p className="mt-2 text-xs text-muted">{t.languageLocked}</p>
                    </fieldset>
                  )}
                  <p className="rounded-2xl bg-nova-500/10 px-4 py-3 text-sm">{t.selfTimerNote}</p>
                  {error && (
                    <p role="alert" className="text-center text-sm font-semibold text-rose-600 dark:text-rose-300">
                      {error}
                    </p>
                  )}
                  <button
                    type="submit"
                    disabled={busy || (info.languages.length > 0 && !language)}
                    className={SUBMIT_CLASS}
                  >
                    {busy && <Loader2 className="mr-2 size-5 animate-spin" aria-hidden="true" />}
                    {info.mine ? t.resumeAttempt : t.selfStart}
                  </button>
                </form>
              ) : (
                <p role="status" className="rounded-2xl bg-sun-500/15 px-4 py-3 text-center font-semibold text-amber-900 dark:text-amber-100">
                  {info.state === 'upcoming' ? t.selfUpcoming : t.selfClosed}
                </p>
              )}
            </div>
          </div>
        )}

        {active && state && (
          <div className="sticky top-0 z-10 -mx-1 mb-3 rounded-2xl bg-[var(--bg)]/90 px-1 pb-2 pt-1 backdrop-blur">
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{state.title}</p>
                <p className="truncate text-xs font-semibold text-muted">
                  {step === 'quiz' ? t.questionOf(index + 1, questions.length) : t.answeredOf(answeredCount, questions.length)}
                </p>
              </div>
              {step === 'quiz' && (
                <button
                  type="button"
                  onClick={() => setPaletteOpen(true)}
                  aria-label={t.questionList}
                  title={t.questionList}
                  className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-app bg-surface px-2.5 text-sm font-semibold hover:bg-surface-2"
                >
                  <LayoutGrid className="size-4" aria-hidden="true" />
                  <span className="hidden sm:inline">{t.questionList}</span>
                </button>
              )}
              <div
                role="timer"
                aria-label={t.timeLeft}
                className={`flex h-10 shrink-0 items-center gap-1.5 rounded-xl px-3 font-display text-base font-bold tabular-nums ${
                  lowTime ? 'animate-pulse bg-rose-500/15 text-rose-700 dark:text-rose-300' : 'bg-surface shadow-soft'
                }`}
              >
                <Timer className="size-4" aria-hidden="true" />
                {formatClock(remaining)}
              </div>
            </div>
            <div
              role="progressbar"
              aria-label={t.answeredOf(answeredCount, questions.length)}
              aria-valuemin={0}
              aria-valuemax={questions.length}
              aria-valuenow={answeredCount}
              className="mt-2 h-1 overflow-hidden rounded-full bg-surface-2"
            >
              <div
                className="h-full rounded-full bg-nova-500 transition-[width] duration-300"
                style={{ width: `${questions.length ? (answeredCount / questions.length) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}

        {step === 'quiz' && state && question && (
          <div className="flex flex-1 flex-col gap-3 sm:gap-4">
            <Modal
              open={paletteOpen}
              onClose={() => setPaletteOpen(false)}
              title={t.questionList}
              description={t.answeredOf(answeredCount, questions.length)}
              size="max-w-md"
            >
              <nav aria-label={t.questionList} className="grid max-h-[55vh] grid-cols-6 gap-2 overflow-y-auto p-1 sm:grid-cols-8">
                {questions.map((q) => {
                  const done = state.answers[q.index] !== undefined;
                  return (
                    <button
                      key={q.index}
                      type="button"
                      onClick={() => {
                        go(q.index);
                        setPaletteOpen(false);
                      }}
                      aria-current={q.index === index ? 'step' : undefined}
                      aria-label={`${t.questionOf(q.index + 1, questions.length)}${done ? '' : ` – ${t.notAnswered}`}`}
                      className={`flex aspect-square items-center justify-center rounded-xl text-sm font-bold tabular-nums transition ${
                        q.index === index
                          ? 'bg-nova-600 text-white ring-2 ring-nova-300'
                          : done
                            ? 'bg-emerald-500/20 text-emerald-800 dark:text-emerald-200'
                            : 'border border-app bg-surface text-muted hover:bg-surface-2'
                      }`}
                    >
                      {q.index + 1}
                    </button>
                  );
                })}
              </nav>
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-muted">
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-3 rounded bg-emerald-500/40" aria-hidden="true" />
                  {t.answered}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-3 rounded border border-app bg-surface" aria-hidden="true" />
                  {t.notAnswered}
                </span>
              </div>
            </Modal>

            <div className="glass-panel animate-rise space-y-3 rounded-3xl p-4 text-center sm:space-y-4 sm:rounded-[2rem] sm:p-6" key={`q-${index}`}>
              {question.imageUrl && (
                <QuestionImage key={question.imageUrl} url={question.imageUrl} lowData={prefs.lowData} showLabel={t.showImage} className="max-h-48" />
              )}
              <h2 className="font-display text-xl font-bold leading-snug sm:text-2xl">
                <QuestionText text={question.text} blanks={question.type === 'blanks'} />
              </h2>
              {(question.hint || question.penalty) && (
                <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
                  {question.hint && hintFor !== index && (
                    <button
                      type="button"
                      onClick={() => setHintFor(index)}
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
              {question.hint && hintFor === index && (
                <p role="note" className="animate-pop rounded-2xl bg-sun-500/15 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
                  <span className="font-bold">{t.hint}: </span>
                  {question.hint}
                </p>
              )}
            </div>

            <AnswerButtons
              key={`a-${index}-${JSON.stringify(state.answers[index] ?? null)}`}
              question={question}
              t={t}
              onSubmit={(a) => void save(a)}
              onDraft={(input) => {
                draft.current = input ? { at: index, input } : null;
              }}
              dense
              disabled={busy}
              initial={state.answers[index] ?? null}
              submitLabel={t.saveAnswer}
            />
            {state.answers[index] && (
              <button
                type="button"
                onClick={() => void save(null)}
                disabled={busy}
                className="self-center text-sm font-semibold text-muted underline hover:text-app"
              >
                {t.clearAnswer}
              </button>
            )}
            {error && (
              <p role="alert" className="text-center text-sm font-semibold text-rose-600 dark:text-rose-300">
                {error}
              </p>
            )}

            <div className="mt-auto grid grid-cols-[1fr_1.35fr_1fr] gap-2 pt-2 text-sm leading-tight sm:text-base">
              <button
                type="button"
                onClick={() => go(Math.max(0, index - 1))}
                disabled={index === 0}
                className="flex h-12 min-w-0 items-center justify-center gap-1 rounded-2xl bg-surface px-2 text-center font-bold shadow-soft disabled:opacity-40"
              >
                <ArrowLeft className="size-4" aria-hidden="true" />
                {t.previous}
              </button>
              <button
                type="button"
                onClick={toReview}
                className="flex h-12 min-w-0 items-center justify-center gap-1.5 rounded-2xl bg-ink-900 px-2 text-center font-bold text-white dark:bg-white dark:text-ink-900"
              >
                <ListChecks className="size-4 shrink-0" aria-hidden="true" />
                {t.reviewAnswers}
              </button>
              <button
                type="button"
                onClick={() => (index === questions.length - 1 ? toReview() : go(index + 1))}
                className="flex h-12 min-w-0 items-center justify-center gap-1 rounded-2xl bg-surface px-2 text-center font-bold shadow-soft"
              >
                {t.next}
                <ArrowRight className="size-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}

        {step === 'review' && state && (
          <div className="flex flex-1 flex-col gap-4">
            <button
              type="button"
              onClick={() => {
                setConfirming(false);
                setStep('quiz');
              }}
              className="inline-flex items-center gap-1.5 self-start rounded-xl bg-surface px-3 py-2 text-sm font-bold shadow-soft hover:bg-surface-2"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              {t.backToQuestions}
            </button>
            <div>
              <h1 className="font-display text-2xl font-bold">{t.reviewTitle}</h1>
              <p className="mt-1 text-sm text-muted">{t.reviewNote}</p>
            </div>
            <ol className="space-y-2">
              {questions.map((q) => {
                const a = state.answers[q.index];
                return (
                  <li key={q.index}>
                    <button
                      type="button"
                      onClick={() => {
                        setIndex(q.index);
                        setStep('quiz');
                      }}
                      className="flex w-full items-start gap-3 rounded-2xl bg-surface p-3 text-left shadow-soft hover:ring-2 hover:ring-nova-300"
                    >
                      <span
                        className={`flex size-8 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${
                          a ? 'bg-emerald-500/20 text-emerald-800 dark:text-emerald-200' : 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                        }`}
                      >
                        {q.index + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2 block text-sm font-semibold">{q.text.replace(/_{3,}/g, '___')}</span>
                        <span className={`mt-0.5 block break-words text-sm ${a ? 'font-bold' : 'italic text-muted'}`}>
                          {a ? answerLine(q, a, t) : t.notAnswered}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-nova-700 dark:text-nova-300">
                        <Pencil className="size-3.5" aria-hidden="true" />
                        {t.change}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
            {confirming ? (
              <div role="alertdialog" aria-labelledby="confirm-text" className="glass-panel animate-pop space-y-3 rounded-3xl p-5 text-center">
                <p id="confirm-text" className="font-semibold">
                  {t.confirmSubmit(questions.length - answeredCount)}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setConfirming(false)} className="h-12 rounded-2xl bg-surface font-bold shadow-soft">
                    {t.keepWorking}
                  </button>
                  <button
                    type="button"
                    autoFocus
                    disabled={busy}
                    onClick={() => void submit(false)}
                    className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(100deg,#6d4aff,#ff5d73)] font-bold text-white disabled:opacity-60"
                  >
                    {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                    {t.yesSubmit}
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirming(true)} className={SUBMIT_CLASS}>
                {t.submitQuiz}
              </button>
            )}
          </div>
        )}

        {step === 'done' && state && <DoneStage state={state} t={t} timedOut={timedOut} lang={prefs.lang} onCheck={refresh} />}
      </main>
    </div>
  );
}

function DoneStage({
  state,
  t,
  timedOut,
  lang,
  onCheck,
}: {
  state: SelfPlayerState;
  t: Strings;
  timedOut: boolean;
  lang: Lang;
  onCheck: () => Promise<unknown>;
}) {
  const final = state.final;
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState(false);
  const check = async () => {
    setChecking(true);
    try {
      await onCheck();
    } finally {
      setChecking(false);
      setChecked(true);
    }
  };

  // Fetch the results by themselves as soon as the quiz closes, and every 20 s in case the host closes it early.
  useEffect(() => {
    if (final) return;
    const untilClose = state.closesAt ? state.closesAt - state.serverNow + 2_000 : Infinity;
    const id = window.setTimeout(() => void onCheck(), Math.max(5_000, Math.min(untilClose, 20_000)));
    return () => window.clearTimeout(id);
  }, [final, state, onCheck]);
  const ranked = state.rules.showLeaderboard && final;
  const result = state.result;
  const stats: { label: string; value: string; of?: string }[] = result
    ? [
        ...(ranked ? [{ label: t.yourPlace, value: String(final.rank), of: `/ ${final.players}` }] : []),
        { label: t.score, value: String(result.score) },
        { label: t.correctAnswers, value: String(result.correctCount), of: `/ ${result.scoredTotal}` },
        ...(result.scoredTotal ? [{ label: t.accuracy, value: `${Math.round((result.correctCount / result.scoredTotal) * 100)}%` }] : []),
      ]
    : [];
  return (
    <div className="flex flex-1 flex-col gap-6 pt-2">
      {state.rules.gamification && ranked && final.rank <= 3 && <Confetti />}
      <section className="overflow-hidden rounded-3xl border border-app bg-surface shadow-soft">
        <div className="flex items-start gap-4 p-6">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="size-6" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-bold leading-tight">{final ? t.resultsTitle : t.submittedTitle}</h1>
            <p className="mt-1 truncate text-sm text-muted">{state.title}</p>
            {timedOut && <p className="mt-2 text-sm font-semibold text-amber-800 dark:text-amber-200">{t.timeUpSubmitted}</p>}
          </div>
        </div>
        {state.rules.completionMessage && (
          <p className="mx-6 mb-6 whitespace-pre-line border-l-2 border-nova-400 pl-3 text-sm">{state.rules.completionMessage}</p>
        )}
        {stats.length > 0 && (
          <dl className={`grid grid-cols-2 border-t border-app ${stats.length === 4 ? 'sm:grid-cols-4' : stats.length === 3 ? 'sm:grid-cols-3' : ''}`}>
            {stats.map((s, i) => (
              <div
                key={s.label}
                className={`px-5 py-4 ${i % 2 === 1 ? 'border-l border-app' : ''} ${i >= 2 ? 'border-t border-app sm:border-t-0' : ''} ${
                  i >= 2 ? 'sm:border-l' : ''
                }`}
              >
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{s.label}</dt>
                <dd className="mt-1 font-display text-2xl font-bold tabular-nums">
                  {s.value}
                  {s.of && <span className="ml-1 text-sm font-semibold text-muted">{s.of}</span>}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      {!final && (
        <section className="flex flex-col gap-3 rounded-2xl border border-app bg-surface px-5 py-4 text-sm sm:flex-row sm:items-center">
          <Clock className="hidden size-5 shrink-0 text-muted sm:block" aria-hidden="true" />
          <p className="flex-1">
            {state.closesAt && state.state !== 'closed' ? t.resultsAfter(formatWhen(state.closesAt, lang)) : t.answersLater}
            {checked && !checking && (
              <span role="status" className="mt-1 block text-xs text-muted">
                {t.resultsNotYet}
              </span>
            )}
          </p>
          <button
            type="button"
            disabled={checking}
            onClick={check}
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-app px-4 font-semibold transition hover:bg-surface-2 disabled:opacity-60"
          >
            {checking ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="size-4" aria-hidden="true" />}
            {t.checkResults}
          </button>
        </section>
      )}

      {final && final.top.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">{t.topPlayers}</h2>
          <ol className="divide-y divide-[var(--border)] overflow-hidden rounded-2xl border border-app bg-surface">
            {final.top.map((p) => {
              const me = p.nickname === state.me.nickname;
              return (
                <li key={p.rank} className={`flex items-center gap-3 px-4 py-2.5 text-sm ${me ? 'bg-nova-500/10 font-bold' : ''}`}>
                  <span className="w-6 text-right font-semibold tabular-nums text-muted">{p.rank}</span>
                  <span aria-hidden="true">{p.avatar}</span>
                  <span className="flex-1 truncate font-semibold">{p.nickname}</span>
                  <span className="font-bold tabular-nums">{p.score}</span>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {final && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">{t.answerReview}</h2>
          <ol className="divide-y divide-[var(--border)] overflow-hidden rounded-2xl border border-app bg-surface">
            {final.review.map((r) => {
              const q = state.questions[r.index]!;
              const scored = isScored(q.type);
              const status = !scored ? null : r.answer === null ? 'none' : r.isCorrect ? 'right' : r.points > 0 ? 'part' : 'wrong';
              return (
                <li key={r.index} className="space-y-3 p-4">
                  <div className="flex items-start gap-3">
                    <span
                      className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full ${
                        status === 'right'
                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                          : status === 'wrong'
                            ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                            : status === 'part'
                              ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                              : 'bg-surface-2 text-muted'
                      }`}
                      aria-hidden="true"
                    >
                      {status === 'right' ? <Check className="size-3.5" /> : status === 'wrong' ? <X className="size-3.5" /> : <Minus className="size-3.5" />}
                    </span>
                    <p className="min-w-0 flex-1 font-semibold">
                      <span className="text-muted">{r.index + 1}. </span>
                      {q.text}
                    </p>
                    {scored && (
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-muted">
                        {r.answer === null ? t.noAnswer : t.plusPoints(r.points)}
                      </span>
                    )}
                  </div>
                  <div className="pl-9">
                    <AnswerSummary question={q} t={t} answer={r.answer} correct={r.correct.length ? r.correct : null} answerKey={r.key} />
                    {r.explanation && (
                      <p className="mt-3 whitespace-pre-line text-sm text-muted">
                        <span className="font-semibold text-app">{t.why} </span>
                        {r.explanation}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      <Link
        href="/history"
        className="inline-flex h-11 items-center justify-center gap-2 self-center rounded-xl border border-app bg-surface px-5 text-sm font-semibold shadow-soft hover:bg-surface-2"
      >
        <History className="size-4" aria-hidden="true" />
        {t.myHistory}
      </Link>
    </div>
  );
}

export default function SelfPlayPage() {
  return (
    <Suspense>
      <SelfFlow />
    </Suspense>
  );
}
