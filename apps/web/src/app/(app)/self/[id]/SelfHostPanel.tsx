'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import { ArrowLeft, BarChart3, CalendarClock, Check, Copy, Loader2, Square, Timer, Users } from 'lucide-react';
import type { SelfHostView } from '@thinkwise/db';
import { formatDateTime } from '@/lib/time';
import { closeSelfAction, setSelfClosesAtAction } from './actions';

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

export function SelfHostPanel({ view, timeZone }: { view: SelfHostView; timeZone: string }) {
  const router = useRouter();
  const [joinUrl, setJoinUrl] = useState('');
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [editing, setEditing] = useState(false);
  const [closesAt, setClosesAt] = useState(() => (view.closesAt ? localInput(view.closesAt) : ''));
  const [problem, setProblem] = useState<string | null>(null);
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

  const close = () =>
    startTransition(async () => {
      await closeSelfAction(view.id);
      setConfirmClose(false);
      router.refresh();
    });

  const saveClosesAt = () => {
    const ms = new Date(closesAt).getTime();
    if (!Number.isFinite(ms) || ms <= Date.now()) {
      setProblem('Choose a time in the future.');
      return;
    }
    startTransition(async () => {
      const { ok } = await setSelfClosesAtAction(view.id, ms);
      if (!ok) {
        setProblem('Couldn’t change the closing time. It must be after the opening time and within 90 days.');
        return;
      }
      setProblem(null);
      setEditing(false);
      router.refresh();
    });
  };

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
        <section className="glass-panel grid gap-6 rounded-3xl p-6 md:grid-cols-[1fr_auto]">
          <div className="space-y-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.14em] text-muted">Quiz PIN</p>
              <p className="font-display text-5xl font-bold tabular-nums tracking-[0.12em]">{view.pin}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <code className="rounded-xl bg-surface-2 px-3 py-2 text-sm font-semibold">{joinUrl.replace(/^https?:\/\//, '')}</code>
              <button type="button" onClick={copy} className={outline}>
                {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
                {copied ? 'Copied' : 'Copy link'}
              </button>
            </div>
            <p className="text-sm text-muted">
              Share the link, QR code or PIN. Participants can start any time while the quiz is open; each gets {minutes(view.timeLimitMs)}.
            </p>
          </div>
          {qr && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt={`QR code for ${joinUrl}`} className="size-44 rounded-2xl bg-white p-3 shadow-soft" />
          )}
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
          {editing ? (
            <div className="mt-1 space-y-2">
              <input
                type="datetime-local"
                value={closesAt}
                onChange={(e) => setClosesAt(e.target.value)}
                aria-label="New closing time"
                className="h-10 w-full rounded-xl border border-app bg-surface px-2 text-sm"
              />
              <div className="flex gap-2">
                <button type="button" onClick={saveClosesAt} disabled={pending} className="rounded-lg bg-nova-600 px-3 py-1.5 text-sm font-semibold text-white">
                  Save
                </button>
                <button type="button" onClick={() => setEditing(false)} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-muted">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <p className="mt-1 font-semibold">
              {view.closesAt ? formatDateTime(new Date(view.closesAt), timeZone) : '—'}
              {live && (
                <button type="button" onClick={() => setEditing(true)} className="ml-2 text-sm text-nova-700 underline dark:text-nova-300">
                  Change
                </button>
              )}
            </p>
          )}
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
      {problem && (
        <p role="alert" className="text-sm font-semibold text-rose-600 dark:text-rose-300">
          {problem}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {live ? (
          confirmClose ? (
            <div role="alertdialog" aria-label="Close the quiz now?" className="flex flex-wrap items-center gap-2 rounded-2xl border border-rose-300 p-2 pl-4">
              <span className="text-sm font-semibold">Close now? Anyone still answering is submitted with what they’ve saved.</span>
              <button
                type="button"
                onClick={close}
                disabled={pending}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-rose-600 px-4 text-sm font-semibold text-white"
              >
                {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                Close quiz
              </button>
              <button type="button" onClick={() => setConfirmClose(false)} className="h-10 rounded-xl px-3 text-sm font-semibold text-muted">
                Cancel
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmClose(true)} className={outline}>
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

      <section className="overflow-hidden rounded-3xl bg-surface shadow-soft">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Participants</caption>
          <thead className="bg-surface-2 text-xs uppercase tracking-[.1em] text-muted">
            <tr>
              <th scope="col" className="px-4 py-3">Participant</th>
              <th scope="col" className="px-4 py-3">Progress</th>
              <th scope="col" className="px-4 py-3 text-right">Score</th>
              <th scope="col" className="px-4 py-3 text-right">Correct</th>
            </tr>
          </thead>
          <tbody>
            {view.participants.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted">
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
