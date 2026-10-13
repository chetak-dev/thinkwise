import type { Metadata } from 'next';
import Link from 'next/link';
import { BookOpenCheck, Search } from 'lucide-react';
import { LIBRARY_SCOPES, getDb, listQuizzes, sessionCounts, type LibraryScope } from '@thinkwise/db';
import { requireUser } from '@/lib/session';
import { QuizCard } from '@/components/QuizCard';
import { NewQuizButton } from '@/components/NewQuizButton';
import { LibraryImportButton } from '@/components/LibraryImportButton';

export const metadata: Metadata = { title: 'Library · ThinkWise' };

const TABS: { scope: LibraryScope; label: string; empty: string }[] = [
  { scope: 'mine', label: 'My quizzes', empty: 'Start with a blank quiz. Everything you type is saved automatically.' },
  { scope: 'drafts', label: 'Drafts', empty: 'Quizzes you haven’t published yet will show up here.' },
  { scope: 'published', label: 'Published', empty: 'Publish a finished quiz from the editor and it will appear here.' },
  { scope: 'favorites', label: 'Favourites', empty: 'Tap the heart on any quiz to keep it close at hand.' },
  { scope: 'org', label: 'Organisation', empty: 'Quizzes your colleagues publish as Public or Unlisted will appear here.' },
  { scope: 'public', label: 'Public', empty: 'Quizzes that hosts publish as Public will appear here.' },
  { scope: 'archived', label: 'Archived', empty: 'Archived quizzes are tucked away here, ready to restore.' },
];

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ q?: string; scope?: string }> }) {
  const user = await requireUser('/library');
  const params = await searchParams;
  const q = (params.q ?? '').trim().slice(0, 100);
  const scope: LibraryScope = (LIBRARY_SCOPES as readonly string[]).includes(params.scope ?? '')
    ? (params.scope as LibraryScope)
    : 'mine';
  const tab = TABS.find((t) => t.scope === scope)!;
  const quizzes = await listQuizzes(getDb(), user.id, { scope, q, orgId: user.orgId });
  const counts = await sessionCounts(getDb(), user.id, quizzes.map((x) => x.id));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold">Library</h1>
          <p className="text-muted">Everything you’ve written, saved and tucked away.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <LibraryImportButton />
          <NewQuizButton />
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <nav aria-label="Library sections" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
          {TABS.map((t) => {
            const active = t.scope === scope;
            return (
              <Link
                key={t.scope}
                href={`/library?scope=${t.scope}`}
                aria-current={active ? 'page' : undefined}
                className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition ${
                  active ? 'bg-ink-900 text-white dark:bg-white dark:text-ink-900' : 'bg-surface text-muted hover:text-app'
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
        <form role="search" className="relative w-full lg:w-72">
          <input type="hidden" name="scope" value={scope} />
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
          <label htmlFor="library-search" className="sr-only">
            Search quizzes
          </label>
          <input
            id="library-search"
            name="q"
            defaultValue={q}
            maxLength={100}
            placeholder="Search title, subject or tag"
            className="h-10 w-full rounded-xl border border-app bg-surface pl-9 pr-3 text-sm focus:border-nova-400 focus:outline-none focus:ring-4 focus:ring-nova-500/15"
          />
        </form>
      </div>

      {quizzes.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {quizzes.map((quiz) => (
            <QuizCard
              key={quiz.id}
              quiz={{
                id: quiz.id,
                title: quiz.title,
                questionCount: quiz.questionCount,
                status: quiz.status,
                favourite: quiz.favourite,
                archived: quiz.archived,
                owned: quiz.owned,
                authorName: quiz.authorName,
                visibility: quiz.visibility,
                sessions: counts.get(quiz.id) ?? 0,
                updatedAt: quiz.updatedAt.toISOString(),
              }}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center rounded-3xl border border-dashed border-app bg-surface px-6 py-14 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-nova-100 text-nova-700 dark:bg-nova-900/60 dark:text-nova-200">
            <BookOpenCheck className="size-7" aria-hidden="true" />
          </span>
          {q ? (
            <>
              <h2 className="mt-4 font-display text-lg font-bold">No quizzes match “{q}”</h2>
              <p className="mt-1 text-sm text-muted">Try a different word, or clear the search.</p>
            </>
          ) : scope === 'org' && !user.orgId ? (
            <>
              <h2 className="mt-4 font-display text-lg font-bold">You’re not in an organisation</h2>
              <p className="mt-1 max-w-md text-sm text-muted">Join or create one to share quizzes with colleagues.</p>
            </>
          ) : scope === 'mine' ? (
            <>
              <h2 className="mt-4 font-display text-lg font-bold">Write your first quiz</h2>
              <p className="mb-5 mt-1 max-w-md text-sm text-muted">{tab.empty}</p>
              <NewQuizButton label="Create a quiz" />
            </>
          ) : (
            <>
              <h2 className="mt-4 font-display text-lg font-bold">Nothing in {tab.label} yet</h2>
              <p className="mt-1 max-w-md text-sm text-muted">{tab.empty}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
