'use client';

import { Suspense, useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, ArrowRight, CalendarClock, Clock, Feather, Lightbulb, ListChecks, Loader2, Pencil, Timer, Volume2, VolumeX } from 'lucide-react';
import { AVATARS, NICKNAME_MAX, isScored, type Avatar, type PlayerAnswer, type PublicQuestion } from '@thinkwise/shared';
import type { SelfInfo, SelfPlayerState } from '@thinkwise/db';
import { Logo } from '@/components/Logo';
import { PageLoader } from '@/components/PageLoader';
import { Confetti } from '@/components/game/Confetti';
import { QuestionImage } from '@/components/game/QuestionImage';
import { QuestionText } from '@/components/game/QuestionText';
import { AnswerButtons, AnswerSummary, SUBMIT_CLASS, type AnswerInput } from '@/components/play/AnswerInputs';
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
    return { status: res.status, data: (await res.json().catch(() => null)) as T | null };
  } catch {
    return { status: 0, data: null };
  }
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
  const [nickname, setNickname] = useState('');
  const [avatar, setAvatar] = useState<Avatar>(AVATARS[0]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [index, setIndex] = useState(0);
  const [hintFor, setHintFor] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const offset = useRef(0);
  const opened = useRef(new Set<number>());
  const submitting = useRef(false);

  const token = () => (pin ? localStorage.getItem(tokenKey(pin)) : null);

  useEffect(() => {
    setAvatar(AVATARS[Math.floor(Math.random() * AVATARS.length)]!);
  }, []);

  const applyState = useCallback((s: SelfPlayerState) => {
    offset.current = s.serverNow - Date.now();
    setState(s);
    setStep((prev) => (s.submitted || s.state === 'closed' ? 'done' : prev === 'review' ? 'review' : 'quiz'));
  }, []);

  const refresh = useCallback(async () => {
    const tok = pin ? localStorage.getItem(tokenKey(pin)) : null;
    if (!tok) return false;
    const { status, data } = await post<{ state: SelfPlayerState }>({ action: 'state', token: tok });
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
        const body = (await res.json()) as { info?: SelfInfo };
        if (cancelled) return;
        if (!body.info) {
          setError(t.selfNotFound);
          setStep('pin');
          return;
        }
        offset.current = body.info.serverNow - Date.now();
        setInfo(body.info);
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
      submitting.current = true;
      setBusy(true);
      await post({ action: 'submit', token: tok });
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
    void post({ action: 'open', token: tok, index });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, index]);

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
    if (!nickname.trim() || busy) return;
    setBusy(true);
    setError(null);
    const { data } = await post<{ token?: string; error?: string }>({ action: 'join', pin, nickname: nickname.trim(), avatar });
    if (data?.token) {
      localStorage.setItem(tokenKey(pin), data.token);
      setIndex(0);
      await refresh();
    } else {
      const reason = data?.error;
      setError(
        reason === 'name_taken'
          ? t.selfNameTaken
          : reason === 'closed'
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

  const save = async (input: AnswerInput | null) => {
    const tok = token();
    if (!tok || !state || busy) return;
    setBusy(true);
    setError(null);
    const { status } = await post({ action: 'save', token: tok, index, answer: input });
    if (status === 200) {
      await refresh();
      const total = state.questions.length;
      if (input) {
        // Go on to the next question still to answer, or to the review once every one has an answer.
        const answered = new Set(Object.keys(state.answers).map(Number)).add(index);
        const nextOpen = [...Array(total).keys()].map((k) => (index + 1 + k) % total).find((k) => !answered.has(k));
        if (nextOpen === undefined) setStep('review');
        else setIndex(nextOpen);
      }
    } else if (status === 409) {
      await refresh();
    } else {
      setError(t.saveFailed);
    }
    setBusy(false);
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

              {info.state === 'open' ? (
                <form onSubmit={join} className="space-y-5">
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
                            avatar === a ? 'scale-110 bg-nova-100 ring-2 ring-nova-500 dark:bg-nova-900' : 'hover:bg-surface-2'
                          }`}
                        >
                          {a}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                  <p className="rounded-2xl bg-nova-500/10 px-4 py-3 text-sm">{t.selfTimerNote}</p>
                  {error && (
                    <p role="alert" className="text-center text-sm font-semibold text-rose-600 dark:text-rose-300">
                      {error}
                    </p>
                  )}
                  <button type="submit" disabled={!nickname.trim() || busy} className={SUBMIT_CLASS}>
                    {busy && <Loader2 className="mr-2 size-5 animate-spin" aria-hidden="true" />}
                    {t.selfStart}
                  </button>
                  <p className="text-center text-[11px] text-muted">
                    {t.privacyNote}{' '}
                    <Link href="/privacy" className="font-semibold underline hover:text-app">
                      {t.privacyLink}
                    </Link>
                  </p>
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
          <div className="sticky top-0 z-10 -mx-1 mb-4 flex items-center justify-between gap-3 rounded-2xl bg-[var(--bg)]/90 px-1 py-2 backdrop-blur">
            <div className="min-w-0">
              <p className="truncate font-display font-bold">{state.title}</p>
              <p className="text-xs font-semibold text-muted">{t.answeredOf(answeredCount, questions.length)}</p>
            </div>
            <div
              role="timer"
              aria-label={t.timeLeft}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 font-display text-lg font-bold tabular-nums ${
                lowTime ? 'animate-pulse bg-rose-500/15 text-rose-700 dark:text-rose-300' : 'bg-surface shadow-soft'
              }`}
            >
              <Timer className="size-4" aria-hidden="true" />
              {formatClock(remaining)}
            </div>
          </div>
        )}

        {step === 'quiz' && state && question && (
          <div className="flex flex-1 flex-col gap-4">
            <nav aria-label={t.questionList} className="flex flex-wrap gap-1.5">
              {questions.map((q) => {
                const done = state.answers[q.index] !== undefined;
                return (
                  <button
                    key={q.index}
                    type="button"
                    onClick={() => setIndex(q.index)}
                    aria-current={q.index === index ? 'step' : undefined}
                    aria-label={`${t.questionOf(q.index + 1, questions.length)}${done ? '' : ` – ${t.notAnswered}`}`}
                    className={`flex size-9 items-center justify-center rounded-xl text-sm font-bold tabular-nums transition ${
                      q.index === index
                        ? 'bg-nova-600 text-white ring-2 ring-nova-300'
                        : done
                          ? 'bg-emerald-500/20 text-emerald-800 dark:text-emerald-200'
                          : 'bg-surface text-muted shadow-soft'
                    }`}
                  >
                    {q.index + 1}
                  </button>
                );
              })}
            </nav>

            <div className="glass-panel animate-rise space-y-4 rounded-[2rem] p-6 text-center" key={`q-${index}`}>
              <p className="text-sm font-semibold text-muted">{t.questionOf(index + 1, questions.length)}</p>
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

            <div className="mt-auto grid grid-cols-3 gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIndex((i) => Math.max(0, i - 1))}
                disabled={index === 0}
                className="flex h-12 items-center justify-center gap-1 rounded-2xl bg-surface font-bold shadow-soft disabled:opacity-40"
              >
                <ArrowLeft className="size-4" aria-hidden="true" />
                {t.previous}
              </button>
              <button
                type="button"
                onClick={() => setStep('review')}
                className="flex h-12 items-center justify-center gap-1 rounded-2xl bg-ink-900 font-bold text-white dark:bg-white dark:text-ink-900"
              >
                <ListChecks className="size-4" aria-hidden="true" />
                {t.reviewAnswers}
              </button>
              <button
                type="button"
                onClick={() => (index === questions.length - 1 ? setStep('review') : setIndex(index + 1))}
                className="flex h-12 items-center justify-center gap-1 rounded-2xl bg-surface font-bold shadow-soft"
              >
                {t.next}
                <ArrowRight className="size-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}

        {step === 'review' && state && (
          <div className="flex flex-1 flex-col gap-4">
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

        {step === 'done' && state && <DoneStage state={state} t={t} timedOut={timedOut} onCheck={() => void refresh()} />}
      </main>
    </div>
  );
}

function DoneStage({
  state,
  t,
  timedOut,
  onCheck,
}: {
  state: SelfPlayerState;
  t: Strings;
  timedOut: boolean;
  onCheck: () => void;
}) {
  const final = state.final;
  const ranked = state.rules.showLeaderboard && final;
  const medal = ranked && final.rank <= 3 ? ['🥇', '🥈', '🥉'][final.rank - 1] : '🎉';
  const result = state.result;
  return (
    <div className="flex flex-1 flex-col items-center gap-5 text-center">
      {state.rules.gamification && ranked && final.rank <= 3 && <Confetti />}
      <div className="animate-pop text-7xl" aria-hidden="true">
        {final ? medal : '✅'}
      </div>
      <h1 className="font-display text-3xl font-bold">{final ? t.allDone : t.submittedTitle}</h1>
      {timedOut && <p className="font-semibold text-muted">{t.timeUpSubmitted}</p>}
      {state.rules.completionMessage && <p className="max-w-sm whitespace-pre-line font-semibold">{state.rules.completionMessage}</p>}
      {result && (
        <div className={`grid w-full gap-3 ${ranked ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {ranked && (
            <div className="rounded-2xl bg-surface p-3 shadow-soft">
              <div className="font-display text-2xl font-bold tabular-nums">
                #{final.rank}
                <span className="text-sm text-muted"> / {final.players}</span>
              </div>
              <div className="text-xs font-semibold text-muted">{t.yourPlace}</div>
            </div>
          )}
          <div className="rounded-2xl bg-surface p-3 shadow-soft">
            <div className="font-display text-2xl font-bold tabular-nums">{result.score}</div>
            <div className="text-xs font-semibold text-muted">{t.score}</div>
          </div>
          <div className="rounded-2xl bg-surface p-3 shadow-soft">
            <div className="font-display text-2xl font-bold tabular-nums">
              {result.correctCount}
              <span className="text-sm text-muted"> / {result.scoredTotal}</span>
            </div>
            <div className="text-xs font-semibold text-muted">{t.correctAnswers}</div>
          </div>
        </div>
      )}
      {!final && (
        <>
          <p className="max-w-sm text-sm text-muted">{t.answersLater}</p>
          <button type="button" onClick={onCheck} className="font-semibold text-nova-600 underline dark:text-nova-300">
            {t.checkAgain}
          </button>
        </>
      )}
      {final && final.top.length > 0 && (
        <div className="w-full rounded-3xl bg-surface p-4 text-left shadow-soft">
          <p className="mb-2 text-sm font-semibold text-muted">{t.topPlayers}</p>
          <ol className="space-y-1.5">
            {final.top.map((p) => (
              <li key={p.rank} className={`flex items-center gap-2 ${p.nickname === state.me.nickname ? 'font-bold' : ''}`}>
                <span className="w-6 text-center">{['🥇', '🥈', '🥉'][p.rank - 1] ?? p.rank}</span>
                <span aria-hidden="true">{p.avatar}</span>
                <span className="flex-1 truncate font-semibold">{p.nickname}</span>
                <span className="font-bold tabular-nums">{p.score}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
      {final && (
        <ol className="w-full space-y-4 text-left">
          {final.review.map((r) => {
            const q = state.questions[r.index]!;
            const scored = isScored(q.type);
            return (
              <li key={r.index} className="space-y-3 rounded-3xl border border-app bg-surface/60 p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold">
                    <span className="text-muted">{r.index + 1}. </span>
                    {q.text}
                  </p>
                  {scored && (
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                        r.answer === null
                          ? 'bg-surface-2 text-muted'
                          : r.isCorrect
                            ? 'bg-emerald-500/20 text-emerald-800 dark:text-emerald-200'
                            : 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                      }`}
                    >
                      {r.answer === null ? t.noAnswer : t.plusPoints(r.points)}
                    </span>
                  )}
                </div>
                <AnswerSummary question={q} t={t} answer={r.answer} correct={r.correct.length ? r.correct : null} answerKey={r.key} />
                {r.explanation && (
                  <p className="whitespace-pre-line text-sm">
                    <span className="font-bold">{t.why} </span>
                    {r.explanation}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      )}
      <button type="button" onClick={() => window.location.assign('/play')} className="font-semibold text-nova-600 underline dark:text-nova-300">
        {t.joinAnother}
      </button>
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
