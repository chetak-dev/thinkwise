import type { Metadata } from 'next';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { getDb, listActivity, listUsersForAdmin, type ActivityRow, type AdminUserRow } from '@thinkwise/db';
import { requireSiteAdmin } from '@/lib/session';
import { getTimeZone } from '@/lib/timeZone';
import { formatDate, formatDateTime } from '@/lib/time';
import { AdminUsers } from './AdminUsers';

export const metadata: Metadata = { title: 'Admin · ThinkWise' };

const PAGE = 100;

const LABELS: Record<string, string> = {
  'auth.register': 'Created an account',
  'admin.grant': 'Made an admin',
  'admin.revoke': 'Removed an admin',
  'quiz.create': 'Created a quiz',
  'quiz.import': 'Imported a quiz',
  'quiz.duplicate': 'Duplicated a quiz',
  'quiz.copy': 'Copied a shared quiz',
  'quiz.delete': 'Deleted a quiz',
  'quiz.publish': 'Published a quiz',
  'quiz.archive': 'Archived a quiz',
  'quiz.unarchive': 'Restored a quiz',
  'session.create': 'Started a session',
  'session.close': 'Closed a self-paced quiz',
  'session.settings': 'Changed self-paced settings',
  'feedback_form.create': 'Created a feedback form',
  'feedback_form.delete': 'Deleted a feedback form',
  'feedback_event.create': 'Created an event',
  'feedback_event.update': 'Edited an event',
  'feedback_event.delete': 'Deleted an event',
};

function detail(row: ActivityRow) {
  const email = row.meta?.targetEmail;
  return typeof email === 'string' ? email : '';
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; before?: string }> }) {
  await requireSiteAdmin('/admin');
  const { tab = 'admins', q = '', before } = await searchParams;
  const activity = tab === 'activity';
  const timeZone = await getTimeZone();
  const db = getDb();
  const beforeMs = before && /^\d{1,15}$/.test(before) ? Number(before) : undefined;
  const [users, log] = await Promise.all([
    activity ? Promise.resolve([] as AdminUserRow[]) : listUsersForAdmin(db, String(q), 200),
    activity ? listActivity(db, { limit: PAGE, before: beforeMs }) : Promise.resolve([] as ActivityRow[]),
  ]);
  const dates = Object.fromEntries(users.map((u) => [u.id, formatDate(new Date(u.createdAt), timeZone)]));
  const tabClass = (on: boolean) =>
    `rounded-xl px-4 py-2 text-sm font-semibold transition ${on ? 'bg-nova-600 text-white' : 'text-muted hover:bg-surface-2 hover:text-app'}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Admin</h1>
        <p className="text-muted">Choose who can host quizzes, and see what’s been happening across the site.</p>
      </div>
      <nav aria-label="Admin sections" className="flex gap-2">
        <Link href="/admin" aria-current={!activity ? 'page' : undefined} className={tabClass(!activity)}>
          Admins
        </Link>
        <Link href="/admin?tab=activity" aria-current={activity ? 'page' : undefined} className={tabClass(activity)}>
          Activity log
        </Link>
      </nav>

      {!activity ? (
        <>
          <p className="text-sm text-muted">
            Admins can host live and self-paced quizzes and launch events. Everyone else can still make and edit quizzes. Site admins
            are fixed and always keep access.
          </p>
          <form className="flex max-w-md gap-2" role="search">
            <label className="relative flex-1">
              <span className="sr-only">Search by name or email</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
              <input
                name="q"
                defaultValue={String(q)}
                placeholder="Search by name or email"
                className="h-10 w-full rounded-xl border border-app bg-surface pl-9 pr-3 text-sm"
              />
            </label>
            <button type="submit" className="h-10 rounded-xl bg-nova-600 px-4 text-sm font-semibold text-white">
              Search
            </button>
          </form>
          <AdminUsers users={users} dates={dates} />
        </>
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl border border-app bg-surface shadow-soft">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-left text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th scope="col" className="px-5 py-3">When</th>
                  <th scope="col" className="px-5 py-3">Who</th>
                  <th scope="col" className="px-5 py-3">What</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {log.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-5 py-8 text-center text-muted">
                      Nothing recorded yet.
                    </td>
                  </tr>
                )}
                {log.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap px-5 py-3 text-muted">
                      <time dateTime={new Date(r.at).toISOString()}>{formatDateTime(new Date(r.at), timeZone)}</time>
                    </td>
                    <td className="px-5 py-3">
                      <p className="font-semibold">{r.userName ?? 'Deleted account'}</p>
                      {r.userEmail && <p className="text-xs text-muted">{r.userEmail}</p>}
                    </td>
                    <td className="px-5 py-3">
                      {LABELS[r.action] ?? r.action}
                      {detail(r) && <span className="text-muted"> · {detail(r)}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {log.length === PAGE && (
            <Link
              href={`/admin?tab=activity&before=${log[log.length - 1]!.at}`}
              className="text-sm font-semibold text-nova-700 underline dark:text-nova-300"
            >
              Older entries
            </Link>
          )}
        </>
      )}
    </div>
  );
}
