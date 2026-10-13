import type { Metadata } from 'next';
import Link from 'next/link';
import { BarChart3, Users } from 'lucide-react';
import { getDb, listSessions } from '@thinkwise/db';
import { requireUser } from '@/lib/session';
import { getTimeZone } from '@/lib/timeZone';
import { formatDateTime } from '@/lib/time';
import { MODE_LABELS, StatusBadge } from '@/components/SessionBits';

export const metadata: Metadata = { title: 'Reports · ThinkWise' };

export default async function ReportsPage() {
  const user = await requireUser('/reports');
  const [sessions, timeZone] = await Promise.all([listSessions(getDb(), user.id, 200), getTimeZone()]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold">Reports</h1>
          <p className="text-muted">Every game you’ve hosted from a saved quiz, built from the answers players gave.</p>
        </div>
      </div>

      {sessions.length === 0 ? (
        <div className="flex flex-col items-center rounded-3xl border border-dashed border-app bg-surface px-6 py-14 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-nova-100 text-nova-700 dark:bg-nova-900/60 dark:text-nova-200">
            <BarChart3 className="size-7" aria-hidden="true" />
          </span>
          <h2 className="mt-4 font-display text-lg font-bold">No sessions yet</h2>
          <p className="mt-1 max-w-md text-sm text-muted">Host one of your quizzes and its results will appear here when the game ends.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-app bg-surface shadow-soft">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-xs uppercase tracking-wider text-muted">
              <tr>
                <th scope="col" className="px-5 py-3">Session</th>
                <th scope="col" className="hidden px-5 py-3 sm:table-cell">Date</th>
                <th scope="col" className="hidden px-5 py-3 md:table-cell">Mode</th>
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
                  <td className="hidden px-5 py-3.5 text-muted sm:table-cell">
                    <time dateTime={s.createdAt.toISOString()}>{formatDateTime(s.createdAt, timeZone)}</time>
                  </td>
                  <td className="hidden px-5 py-3.5 md:table-cell">{MODE_LABELS[s.mode]}</td>
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
      )}
    </div>
  );
}
