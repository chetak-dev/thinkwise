import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, ClipboardList, Plus, Rocket, Sparkles } from 'lucide-react';
import { getDb, listFeedbackEvents, listFeedbackForms } from '@thinkwise/db';
import { EVENT_FLOW_INFO } from '@thinkwise/shared';
import { requireUser } from '@/lib/session';
import { getTimeZone } from '@/lib/timeZone';
import { formatDate } from '@/lib/time';
import { createFeedbackFormAction } from './actions';

export const metadata: Metadata = { title: 'Feedback + Quiz · ThinkWise' };

const BUTTON =
  'inline-flex h-10 select-none items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.97]';

export default async function FeedbackPage() {
  const user = await requireUser('/feedback');
  const db = getDb();
  const [events, forms, timeZone] = await Promise.all([listFeedbackEvents(db, user.id), listFeedbackForms(db, user.id), getTimeZone()]);

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[.16em] text-nova-600 dark:text-nova-300">One link, start to finish</p>
          <h1 className="mt-1 font-display text-3xl font-bold">Feedback + Quiz</h1>
          <p className="mt-1 text-muted">
            Gather honest feedback, bring everyone into the lobby and run a live quiz, all from a single link with no extra PIN or sign-in.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/feedback/new"
            className={`${BUTTON} bg-[linear-gradient(100deg,#6d4aff,#ff5d73)] text-white shadow-lift hover:brightness-110`}
          >
            <Sparkles className="size-4" aria-hidden="true" />
            Create complete event
          </Link>
          <form action={createFeedbackFormAction} data-navigates>
            <button type="submit" className={`${BUTTON} border border-app bg-surface hover:border-nova-400 hover:text-nova-700 dark:hover:text-nova-300`}>
              <Plus className="size-4" aria-hidden="true" />
              New feedback form
            </button>
          </form>
        </div>
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="font-display text-xl font-bold">Interactive events</h2>
          <p className="text-sm text-muted">Feedback and a quiz, joined into one participant journey.</p>
        </div>
        {events.length === 0 ? (
          <div className="flex flex-col items-center rounded-3xl border border-dashed border-app bg-surface px-6 py-12 text-center">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-nova-100 text-nova-700 dark:bg-nova-900/60 dark:text-nova-200">
              <Sparkles className="size-7" aria-hidden="true" />
            </span>
            <h3 className="mt-4 font-display text-lg font-bold">Your first event will appear here</h3>
            <p className="mt-1 max-w-md text-sm text-muted">Build a feedback form below, then pair it with any quiz so participants move through both with one link.</p>
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {events.map((event) => (
              <li key={event.id}>
                <Link
                  href={`/feedback/events/${event.id}`}
                  className="flex h-full flex-col rounded-2xl border border-app bg-surface p-5 shadow-soft transition hover:-translate-y-0.5 hover:border-nova-300"
                >
                  <span className="self-start rounded-full bg-coral-500/10 px-2.5 py-0.5 text-xs font-bold text-coral-600 dark:text-coral-400">
                    {EVENT_FLOW_INFO[event.flow].badge}
                  </span>
                  <h3 className="mt-3 truncate font-display text-lg font-bold">{event.title}</h3>
                  <p className="mt-1 truncate text-sm text-muted">{event.quizTitle ? `Quiz: ${event.quizTitle}` : 'Quiz deleted'}</p>
                  <p className="mt-auto flex items-center justify-between pt-4 text-sm font-semibold text-nova-700 dark:text-nova-300">
                    <span className="flex items-center gap-1.5">
                      <Rocket className="size-4" aria-hidden="true" />
                      {event.launches === 0 ? 'Ready to launch' : `${event.launches} ${event.launches === 1 ? 'launch' : 'launches'}`}
                    </span>
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="font-display text-xl font-bold">Feedback forms</h2>
          <p className="text-sm text-muted">Reusable forms with conditional questions and upload limits.</p>
        </div>
        {forms.length === 0 ? (
          <div className="flex flex-col items-center rounded-3xl border border-dashed border-app bg-surface px-6 py-12 text-center">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-nova-100 text-nova-700 dark:bg-nova-900/60 dark:text-nova-200">
              <ClipboardList className="size-7" aria-hidden="true" />
            </span>
            <h3 className="mt-4 font-display text-lg font-bold">No feedback forms yet</h3>
            <p className="mt-1 max-w-md text-sm text-muted">Create a form to start collecting ratings, comments and more.</p>
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {forms.map((form) => (
              <li key={form.id}>
                <Link
                  href={`/feedback/forms/${form.id}`}
                  className="block h-full rounded-2xl border border-app bg-surface p-5 shadow-soft transition hover:-translate-y-0.5 hover:border-nova-300"
                >
                  <span className="rounded-full bg-nova-100 px-2.5 py-0.5 text-xs font-bold text-nova-700 dark:bg-nova-900/60 dark:text-nova-200">
                    v{form.version}
                  </span>
                  <h3 className="mt-3 truncate font-display text-lg font-bold">{form.title || 'Untitled feedback form'}</h3>
                  <p className="mt-1 text-sm text-muted">
                    {form.fieldCount} {form.fieldCount === 1 ? 'field' : 'fields'}
                  </p>
                  <p className="mt-3 text-xs text-muted">
                    Updated <time dateTime={form.updatedAt.toISOString()}>{formatDate(form.updatedAt, timeZone)}</time>
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
