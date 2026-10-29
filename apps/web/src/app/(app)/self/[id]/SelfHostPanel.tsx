'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import { ArrowLeft, BarChart3, CalendarClock, Check, Copy, Download, Loader2, QrCode, RotateCcw, Settings2, Share2, Square, Timer, Users } from 'lucide-react';
import type { SelfHostView } from '@thinkwise/db';
import { TypeToConfirm, confirmMatches } from '@/components/TypeToConfirm';
import { formatDateTime } from '@/lib/time';
import { closeSelfAction, reopenSelfAction, updateSelfSettingsAction } from './actions';

const POLL_MS = 5000;

function localInput(ms: number) {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function minutes(ms: number) {
  const m = Math.round(ms / 60_000);
  return m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`;
}

function clock(ms: number) {
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m ${String(s % 60).padStart(2, '0')}s`;
}

const field = 'h-10 w-full rounded-xl border border-app bg-surface px-3 text-sm';
const label = 'text-xs font-bold uppercase tracking-[.1em] text-muted';

function Toggle({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-4 accent-nova-600" />
      <span>{children}</span>
    </label>
  );
}

function SettingsEditor({ view, onDone }: { view: SelfHostView; onDone: () => void }) {
  const router = useRouter();
  const live = view.state !== 'closed';
  const upcoming = view.state === 'upcoming';
  const [title, setTitle] = useState(view.title);
  const [opensAt, setOpensAt] = useState(() => (view.opensAt ? localInput(view.opensAt) : ''));
  const [closesAt, setClosesAt] = useState(() => (view.closesAt ? localInput(view.closesAt) : ''));
  const [limit, setLimit] = useState(String(Math.round(view.timeLimitMs / 60_000)));
  const [board, setBoard] = useState(view.showLeaderboard);
  const [answers, setAnswers] = useState(view.showCorrect);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = () => {
    const patch: Parameters<typeof updateSelfSettingsAction>[1] = {};
    if (title.trim() !== view.title) patch.title = title;
    if (board !== view.showLeaderboard) patch.showLeaderboard = board;
    if (answers !== view.showCorrect) patch.showCorrect = answers;
    if (live) {
      if (upcoming && view.opensAt && opensAt !== localInput(view.opensAt)) {
        const ms = new Date(opensAt).getTime();
        if (!Number.isFinite(ms)) return setProblem('Choose when the quiz opens.');
        patch.opensAtMs = ms;
      }
      if (view.closesAt && closesAt !== localInput(view.closesAt)) {
        const ms = new Date(closesAt).getTime();
        if (!Number.isFinite(ms)) return setProblem('Choose when the quiz closes.');
        patch.closesAtMs = ms;
      }
      const mins = Number(limit);
      if (mins !== Math.round(view.timeLimitMs / 60_000)) {
        if (!Number.isFinite(mins) || mins < 1 || mins > 1440) return setProblem('The time limit must be 1–1440 minutes.');
        patch.timeLimitMinutes = mins;
      }
    }
    startTransition(async () => {
      const r = await updateSelfSettingsAction(view.id, patch);
      if (!r.ok) return setProblem(r.error);
      setProblem(null);
      onDone();
      router.refresh();
    });
  };

  return (
    <section aria-label="Quiz settings" className="glass-panel space-y-4 rounded-3xl p-6">
      <div>
        <h2 className="font-display text-xl font-bold">Settings</h2>
        <p className="mt-1 text-sm text-muted">
          {live
            ? 'Changes apply straight away. A new time limit applies to everyone still answering.'
            : 'The quiz has closed. You can still rename it and choose what participants see.'}
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 sm:col-span-2">
          <span className={label}>Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} className={field} />
        </label>
        {live && upcoming && (
          <label className="space-y-1">
            <span className={label}>Opens</span>
            <input type="datetime-local" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} className={field} />
          </label>
        )}
        {live && (
          <label className="space-y-1">
            <span className={label}>Closes</span>
            <input type="datetime-local" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} className={field} />
          </label>
        )}
        {live && (
          <label className="space-y-1">
            <span className={label}>Time limit per participant (minutes)</span>
            <input type="number" min={1} max={1440} value={limit} onChange={(e) => setLimit(e.target.value)} className={field} />
          </label>
        )}
      </div>
      <div className="space-y-2">
        <p className={label}>After the quiz closes, participants see</p>
        <Toggle checked={board} onChange={setBoard}>The leaderboard (top players)</Toggle>
        <Toggle checked={answers} onChange={setAnswers}>The correct answers to every question</Toggle>
      </div>
      {problem && (
        <p role="alert" className="text-sm font-semibold text-rose-600 dark:text-rose-300">
          {problem}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-nova-600 px-4 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          Save changes
        </button>
        <button type="button" onClick={onDone} className="h-10 rounded-xl px-3 text-sm font-semibold text-muted">
          Cancel
        </button>
      </div>
    </section>
  );
}

function ReopenForm({ view, onDone }: { view: SelfHostView; onDone: () => void }) {
  const router = useRouter();
  const span = view.opensAt && view.closesAt ? Math.max(view.closesAt - view.opensAt, 60 * 60_000) : 7 * 24 * 60 * 60_000;
  const [opensAt, setOpensAt] = useState(() => localInput(Date.now()));
  const [closesAt, setClosesAt] = useState(() => localInput(Date.now() + Math.min(span, 90 * 24 * 60 * 60_000 - 60_000)));
  const [limit, setLimit] = useState(String(Math.round(view.timeLimitMs / 60_000)));
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const go = () => {
    const o = new Date(opensAt).getTime();
    const c = new Date(closesAt).getTime();
    const mins = Number(limit);
    if (!Number.isFinite(o) || !Number.isFinite(c)) return setProblem('Choose when it opens and closes.');
    if (!Number.isFinite(mins) || mins < 1 || mins > 1440) return setProblem('The time limit must be 1–1440 minutes.');
    startTransition(async () => {
      const r = await reopenSelfAction(view.id, { opensAtMs: o, closesAtMs: c, timeLimitMinutes: mins });
      if (!r.ok) return setProblem(r.error);
      router.push(`/self/${r.id}`);
    });
  };

  return (
    <section aria-label="Run again" className="glass-panel space-y-4 rounded-3xl p-6">
      <div>
        <h2 className="font-display text-xl font-bold">Run this quiz again</h2>
        <p className="mt-1 text-sm text-muted">
          Opens a fresh copy with a new link and no participants, keeping the same questions and settings. This one stays as it is.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="space-y-1">
          <span className={label}>Opens</span>
          <input type="datetime-local" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} className={field} />
        </label>
        <label className="space-y-1">
          <span className={label}>Closes</span>
          <input type="datetime-local" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} className={field} />
        </label>
        <label className="space-y-1">
          <span className={label}>Time limit (minutes)</span>
          <input type="number" min={1} max={1440} value={limit} onChange={(e) => setLimit(e.target.value)} className={field} />
        </label>
      </div>
      {problem && (
        <p role="alert" className="text-sm font-semibold text-rose-600 dark:text-rose-300">
          {problem}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={go}
          disabled={pending}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-nova-600 px-4 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          Open new session
        </button>
        <button type="button" onClick={onDone} className="h-10 rounded-xl px-3 text-sm font-semibold text-muted">
          Cancel
        </button>
      </div>
    </section>
  );
}

export function SelfHostPanel({ view, timeZone, canHost }: { view: SelfHostView; timeZone: string; canHost: boolean }) {
  const router = useRouter();
  const [joinUrl, setJoinUrl] = useState('');
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [typed, setTyped] = useState('');
  const [showQr, setShowQr] = useState(false);
  const [panel, setPanel] = useState<'none' | 'settings' | 'reopen'>('none');
  const [pending, startTransition] = useTransition();
  const [now, setNow] = useState(view.serverNow);
  const live = view.state !== 'closed';

  useEffect(() => {
    const url = `${window.location.origin}/${view.pin}`;
    setJoinUrl(url);
    QRCode.toString(url, { type: 'svg', margin: 0, color: { dark: '#14112b', light: '#ffffff' } })
      .then((svg) => setQr(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`))
      .catch(() => setQr(''));
  }, [view.pin]);

  useEffect(() => {
    if (!live) return;
    const poll = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, POLL_MS);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [live, router]);

  const copy = async () => {
    await navigator.clipboard.writeText(joinUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const share = async () => {
    const text = `Take the quiz "${view.title}": ${joinUrl}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: view.title, text: `Take the quiz "${view.title}"`, url: joinUrl });
        return;
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };

  const quizName = view.title.trim() || 'Untitled quiz';
  const close = () =>
    startTransition(async () => {
      if (!confirmMatches(typed, quizName)) return;
      await closeSelfAction(view.id);
      setConfirmClose(false);
      router.refresh();
    });

  const submitted = view.participants.filter((p) => p.submitted).length;
  const working = view.participants.length - submitted;
  const outline =
    'inline-flex h-10 items-center gap-2 rounded-xl border border-app bg-surface px-4 text-sm font-semibold transition hover:-translate-y-0.5 hover:border-nova-400';
  const stateBadge =
    view.state === 'open'
      ? { text: 'Open', tone: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200' }
      : view.state === 'upcoming'
        ? { text: 'Scheduled', tone: 'bg-sun-500/20 text-amber-800 dark:text-amber-200' }
        : { text: 'Closed', tone: 'bg-surface-2 text-muted' };

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-app">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Dashboard
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl font-bold">{view.title}</h1>
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${stateBadge.tone}`}>{stateBadge.text}</span>
        </div>
        <p className="mt-1 text-sm text-muted">
          Self-paced · {view.questionCount} {view.questionCount === 1 ? 'question' : 'questions'} · {minutes(view.timeLimitMs)} per participant
        </p>
      </div>

      {live && (
        <section className="glass-panel space-y-4 rounded-3xl p-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.14em] text-muted">Quiz link</p>
            <p className="mt-1 text-sm text-muted">
              Send this link to participants. They can start any time while the quiz is open; each gets {minutes(view.timeLimitMs)}.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded-xl bg-surface-2 px-3 py-2 text-base font-semibold">{joinUrl.replace(/^https?:\/\//, '')}</code>
            <button type="button" onClick={copy} className={outline}>
              {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
              {copied ? 'Copied' : 'Copy link'}
            </button>
            <button type="button" onClick={share} className={outline}>
              <Share2 className="size-4" aria-hidden="true" />
              Share
            </button>
            <button type="button" onClick={() => setShowQr((v) => !v)} aria-expanded={showQr} className={outline}>
              <QrCode className="size-4" aria-hidden="true" />
              {showQr ? 'Hide QR code' : 'QR code'}
            </button>
          </div>
          {showQr && qr && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt={`QR code for ${joinUrl}`} className="size-44 rounded-2xl bg-white p-3 shadow-soft" />
          )}
          <p className="text-xs text-muted">
            PIN {view.pin} also works on the Join page.
          </p>
        </section>
      )}

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-surface p-4 shadow-soft">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[.14em] text-muted">
            <CalendarClock className="size-4" aria-hidden="true" />
            {view.state === 'upcoming' ? 'Opens' : 'Opened'}
          </p>
          <p className="mt-1 font-semibold">{view.opensAt ? formatDateTime(new Date(view.opensAt), timeZone) : '—'}</p>
        </div>
        <div className="rounded-2xl bg-surface p-4 shadow-soft">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[.14em] text-muted">
            <Timer className="size-4" aria-hidden="true" />
            {live ? 'Closes' : 'Closed'}
          </p>
          <p className="mt-1 font-semibold">{view.closesAt ? formatDateTime(new Date(view.closesAt), timeZone) : '—'}</p>
        </div>
        <div className="rounded-2xl bg-surface p-4 shadow-soft">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[.14em] text-muted">
            <Users className="size-4" aria-hidden="true" />
            Participants
          </p>
          <p className="mt-1 font-semibold">
            {view.participants.length} joined · {submitted} submitted{working > 0 && live ? ` · ${working} in progress` : ''}
          </p>
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        {panel !== 'settings' && !confirmClose && (
          <button type="button" onClick={() => setPanel('settings')} className={outline}>
            <Settings2 className="size-4" aria-hidden="true" />
            Edit settings
          </button>
        )}
        <a href={`/api/self-sessions/${view.id}/export`} className={outline}>
          <Download className="size-4" aria-hidden="true" />
          Download results (CSV)
        </a>
        {canHost && panel !== 'reopen' && !confirmClose && (
          <button type="button" onClick={() => setPanel('reopen')} className={outline}>
            <RotateCcw className="size-4" aria-hidden="true" />
            Run again
          </button>
        )}
        {live ? (
          confirmClose ? (
            <div role="alertdialog" aria-label="Close the quiz now?" className="w-full max-w-lg space-y-3 rounded-2xl border border-rose-300 p-4">
              <p className="text-sm font-semibold">
                Close the quiz now? Nobody new can join, and anyone still answering is submitted with what they’ve saved. This can’t be undone.
              </p>
              <TypeToConfirm expected={quizName} value={typed} onChange={setTyped} onEnter={close} />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={close}
                  disabled={pending || !confirmMatches(typed, quizName)}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-rose-600 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                  Close quiz
                </button>
                <button type="button" onClick={() => setConfirmClose(false)} className="h-10 rounded-xl px-3 text-sm font-semibold text-muted">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setTyped('');
                setConfirmClose(true);
              }}
              className={outline}
            >
              <Square className="size-4" aria-hidden="true" />
              Close now
            </button>
          )
        ) : (
          <Link href={`/reports/${view.id}`} className={outline}>
            <BarChart3 className="size-4" aria-hidden="true" />
            View report
          </Link>
        )}
      </div>

      {panel === 'settings' && <SettingsEditor key={`${view.title}|${view.closesAt}|${view.timeLimitMs}`} view={view} onDone={() => setPanel('none')} />}
      {panel === 'reopen' && <ReopenForm view={view} onDone={() => setPanel('none')} />}
      {view.shuffleEach && (
        <p className="text-sm text-muted">Each participant gets the questions and options in their own order.</p>
      )}

      <section className="overflow-x-auto rounded-3xl bg-surface shadow-soft">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Participants</caption>
          <thead className="bg-surface-2 text-xs uppercase tracking-[.1em] text-muted">
            <tr>
              <th scope="col" className="px-4 py-3">Participant</th>
              <th scope="col" className="px-4 py-3">Progress</th>
              <th scope="col" className="px-4 py-3 text-right">Time taken</th>
              <th scope="col" className="px-4 py-3 text-right" title="How many times they left the quiz page while answering">Left page</th>
              <th scope="col" className="px-4 py-3 text-right">Score</th>
              <th scope="col" className="px-4 py-3 text-right">Correct</th>
            </tr>
          </thead>
          <tbody>
            {view.participants.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted">
                  {live ? 'Nobody has started yet. This page updates on its own.' : 'Nobody took part.'}
                </td>
              </tr>
            )}
            {view.participants.map((p) => {
              const left = p.deadlineAt - now;
              return (
                <tr key={p.nickname} className="border-t border-app">
                  <td className="px-4 py-3 font-semibold">
                    <span aria-hidden="true" className="mr-2">
                      {p.avatar}
                    </span>
                    {p.nickname}
                  </td>
                  <td className="px-4 py-3">
                    {p.submitted ? (
                      <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-bold text-emerald-800 dark:text-emerald-200">
                        Submitted
                      </span>
                    ) : (
                      <span className="text-muted">
                        {p.answered}/{view.questionCount} answered{left > 0 ? ` · ${minutes(left)} left` : ''}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {clock(p.submitted ? p.timeTakenMs : Math.max(0, Math.min(now, p.deadlineAt) - p.startedAt))}
                  </td>
                  <td className={`px-4 py-3 text-right tabular-nums ${p.tabSwitches > 0 ? 'font-bold text-amber-700 dark:text-amber-300' : 'text-muted'}`}>
                    {p.tabSwitches}
                  </td>
                  <td className="px-4 py-3 text-right font-bold tabular-nums">{p.score ?? '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{p.correctCount ?? '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
