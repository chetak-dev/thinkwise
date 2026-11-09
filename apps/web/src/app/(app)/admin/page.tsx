import type { Metadata } from 'next';
import { Search } from 'lucide-react';
import { getDb, listUsersForAdmin } from '@thinkwise/db';
import { requireSiteAdmin } from '@/lib/session';
import { getTimeZone } from '@/lib/timeZone';
import { formatDate } from '@/lib/time';
import { AdminUsers } from './AdminUsers';

export const metadata: Metadata = { title: 'Admin · ThinkWise' };

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireSiteAdmin('/admin');
  const { q = '' } = await searchParams;
  const [timeZone, users] = await Promise.all([getTimeZone(), listUsersForAdmin(getDb(), String(q), 200)]);
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
    </div>
  );
}