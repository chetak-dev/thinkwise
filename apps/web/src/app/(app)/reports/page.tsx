import type { Metadata } from 'next';
import Link from 'next/link';
import { BarChart3, Users } from 'lucide-react';
import { getDb, listSessions } from '@thinkwise/db';
import { requireHost } from '@/lib/session';
import { getTimeZone } from '@/lib/timeZone';
import { formatDateTime } from '@/lib/time';
import { MODE_LABELS, StatusBadge } from '@/components/SessionBits';
import { Pager, parsePage } from '@/components/Pager';

export const metadata: Metadata = { title: 'Reports · ThinkWise' };

const PAGE_SIZE = 50;

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await requireHost('/reports');
  const page = parsePage((await searchParams).page);
  const [rows, timeZone] = await Promise.all([
    listSessions(getDb(), user.id, PAGE_SIZE + 1, (page - 1) * PAGE_SIZE),
    getTimeZone(),
  ]);
  const hasNext = rows.length > PAGE_SIZE;
  const sessions = rows.slice(0, PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold">Reports</h1>
          <p className="text-muted">Every game you’ve hosted from a saved quiz, built from the answers players gave.</p>
        </div>
      </div>

      {sessions.length === 0 && page > 1 ? (
        <Pager basePath="/reports" params={{}} page={page} hasNext={false} />
      ) : sessions.length === 0 ? (
        <div className="flex flex-col items-center rounded-3xl border border-dashed border-app bg-surface px-6 py-14 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-nova-100 text-nova-700 dark:bg-nova-900/60 dark:text-nova-200">
            <BarChart3 className="size-7" aria-hidden="true" />
          </span>
          <h2 className="mt-4 font-display text-lg font-bold">No sessions yet</h2>
          <p className="mt-1 max-w-md text-sm text-muted">Host one of your quizzes and its results will appear here when the game ends.</p>
        </div>
      ) : (
        <>
          <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-2xl border border-app bg-surface shadow-soft sm:hidden">
            {sessions.map((s) => (
              <li key={s.id}>
                <Link href={`/reports/${s.id}`} className="block px-4 py-3.5 hover:bg-surface-2">
                  <span className="flex items-start justify-between gap-3">
                    <span className="min-w-0 break-words font-semibold">{s.title}</span>
                    <StatusBadge status={s.status} />
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
                    <time dateTime={s.createdAt.toISOString()}>{formatDateTime(s.createdAt, timeZone)}</time>
                    <span aria-hidden="true">·</span>
                    <span>{MODE_LABELS[s.mode]}</span>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1">
                      <Users className="size-3.5" aria-hidden="true" />
                      {s.playerCount} {s.playerCount === 1 ? 'player' : 'players'}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>PIN {s.pin}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        <div className="hidden overflow-x-auto rounded-2xl border border-app bg-surface shadow-soft sm:block">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-surface-2 text-left text-xs uppercase tracking-wider text-muted">
              <tr>
                <th scope="col" className="px-5 py-3">Session</th>
                <th scope="col" className="px-5 py-3">Date</th>
                <th scope="col" className="px-5 py-3">Mode</th>
                <th scope="col" className="px-5 py-3">Players</th>
                <th scope="col" className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {sessions.map((s) => (
                <tr key={s.id} className="hover:bg-surface-2">
                  <td className="px-5 py-3.5">
                    <Link href={`/reports/${s.id}`} className="font-semibold hover:text-nova-600">
                      {s.title}
                    </Link>
                    <p className="text-xs text-muted">PIN {s.pin}</p>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3.5 text-muted">
                    <time dateTime={s.createdAt.toISOString()}>{formatDateTime(s.createdAt, timeZone)}</time>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3.5">{MODE_LABELS[s.mode]}</td>
                  <td className="px-5 py-3.5">
                    <span className="flex items-center gap-1">
                      <Users className="size-4 text-muted" aria-hidden="true" />
                      {s.playerCount}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <StatusBadge status={s.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
          <Pager basePath="/reports" params={{}} page={page} hasNext={hasNext} />
        </>
      )}
    </div>
  );
}
