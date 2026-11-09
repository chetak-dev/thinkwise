import type { Metadata } from 'next';
import Link from 'next/link';
import { History } from 'lucide-react';
import { getDb, participantHistory } from '@thinkwise/db';
import { requireUser } from '@/lib/session';
import { getTimeZone } from '@/lib/timeZone';
import { formatDateTime } from '@/lib/time';

export const metadata: Metadata = { title: 'My quiz history · ThinkWise' };

const PAGE = 50;

const STATUS_CLASS: Record<string, string> = {
  Submitted: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200',
  Completed: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200',
  'In progress': 'bg-sun-500/20 text-amber-900 dark:text-amber-100',
};

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ before?: string }> }) {
  const user = await requireUser('/history');
  const { before } = await searchParams;
  const beforeMs = before && /^\d{1,15}$/.test(before) ? Number(before) : undefined;
  const [rows, timeZone] = await Promise.all([
    participantHistory(getDb(), user.id, beforeMs ? new Date(beforeMs) : undefined),
    getTimeZone(),
  ]);
  const shown = rows.slice(0, PAGE);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">My quiz history</h1>
        <p className="text-muted">Every quiz you’ve taken with this account. Each quiz can be taken once.</p>
      </div>

      {shown.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-app bg-surface p-10 text-center">
          <History className="size-8 text-muted" aria-hidden="true" />
          <p className="font-semibold">No quizzes yet</p>
          <p className="text-sm text-muted">Enter a game PIN to join your first quiz.</p>
          <Link href="/play" className="rounded-xl bg-nova-600 px-4 py-2 text-sm font-semibold text-white">
            Join a quiz
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-app bg-surface shadow-soft">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-xs uppercase tracking-wider text-muted">
              <tr>
                <th scope="col" className="px-5 py-3">Quiz</th>
                <th scope="col" className="hidden px-5 py-3 md:table-cell">Language</th>
                <th scope="col" className="hidden px-5 py-3 sm:table-cell">Started</th>
                <th scope="col" className="px-5 py-3">Status</th>
                <th scope="col" className="px-5 py-3 text-right">Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {shown.map((r) => (
                <tr key={`${r.mode}-${r.id}`}>
                  <td className="px-5 py-3.5">
                    <Link
                      href={r.mode === 'self' ? `/play/self?pin=${r.pin}` : `/history/${r.id}`}
                      className="font-semibold text-nova-700 hover:underline dark:text-nova-300"
                    >
                      {r.title}
                    </Link>
                    <p className="text-xs text-muted">{r.mode === 'self' ? 'Self-paced' : 'Live'}</p>
                  </td>
                  <td className="hidden px-5 py-3.5 md:table-cell">{r.language || '—'}</td>
                  <td className="hidden whitespace-nowrap px-5 py-3.5 text-muted sm:table-cell">
                    <time dateTime={r.startedAt.toISOString()}>{formatDateTime(r.startedAt, timeZone)}</time>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS_CLASS[r.status] ?? 'bg-surface-2 text-muted'}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right font-bold tabular-nums">{r.score ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > PAGE && (
        <Link
          href={`/history?before=${shown[shown.length - 1]!.startedAt.getTime()}`}
          className="text-sm font-semibold text-nova-700 underline dark:text-nova-300"
        >
          Older quizzes
        </Link>
      )}
    </div>
  );
}
