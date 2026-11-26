import type { Metadata } from 'next';
import { Search } from 'lucide-react';
import { getDb, listAdminRunningSessions, listUsersForAdmin } from '@thinkwise/db';
import { requireSiteAdmin } from '@/lib/session';
import { getTimeZone } from '@/lib/timeZone';
import { formatDate } from '@/lib/time';
import { AdminUsers } from './AdminUsers';
import { AdminActiveGames } from './AdminActiveGames';
import { Pager, parsePage } from '@/components/Pager';

export const metadata: Metadata = { title: 'Admin · ThinkWise' };

const PAGE_SIZE = 50;

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  await requireSiteAdmin('/admin');
  const { q = '', page: rawPage } = await searchParams;
  const page = parsePage(rawPage);
  const [timeZone, rows, games] = await Promise.all([
    getTimeZone(),
    listUsersForAdmin(getDb(), String(q), PAGE_SIZE + 1, (page - 1) * PAGE_SIZE),
    listAdminRunningSessions(getDb()),
  ]);
  const hasNext = rows.length > PAGE_SIZE;
  const users = rows.slice(0, PAGE_SIZE);
  const dates = Object.fromEntries(users.map((u) => [u.id, formatDate(new Date(u.createdAt), timeZone)]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Admin</h1>
        <p className="text-muted">Choose who can create and host quizzes.</p>
      </div>
      <p className="text-sm text-muted">
        Admins can create, host and run live and self-paced quizzes. Everyone else can join and take quizzes. Site admins are fixed and
        always keep access.
      </p>
      <AdminActiveGames games={games} />
      <div className="flex flex-wrap items-end justify-between gap-3 border-t border-app pt-6">
        <div>
          <h2 className="font-display text-xl font-bold">Users</h2>
          <p className="text-sm text-muted">{users.length} shown on this page</p>
        </div>
      </div>
      <form className="flex max-w-md gap-2" role="search">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Search by name, email or phone</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input
            name="q"
            defaultValue={String(q)}
            placeholder="Search by name, email or phone"
            className="h-10 w-full rounded-xl border border-app bg-surface pl-9 pr-3 text-sm"
          />
        </label>
        <button type="submit" className="h-10 shrink-0 rounded-xl bg-nova-600 px-4 text-sm font-semibold text-white">
          Search
        </button>
      </form>
      <AdminUsers users={users} dates={dates} />
      <Pager basePath="/admin" params={{ q: String(q) }} page={page} hasNext={hasNext} />
    </div>
  );
}