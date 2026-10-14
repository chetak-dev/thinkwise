import type { Metadata } from 'next';
import { getDb, listFeedbackForms, listQuizzes } from '@thinkwise/db';
import { requireUser } from '@/lib/session';
import { NewEventForm } from './NewEventForm';

export const metadata: Metadata = { title: 'New interactive event · ThinkWise' };

export default async function NewEventPage() {
  const user = await requireUser('/feedback/new');
  const db = getDb();
  const [quizzes, forms] = await Promise.all([listQuizzes(db, user.id, { scope: 'mine' }), listFeedbackForms(db, user.id)]);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <p className="text-xs font-bold uppercase tracking-[.16em] text-nova-600 dark:text-nova-300">New interactive event</p>
        <h1 className="mt-1 font-display text-3xl font-bold">Build one smooth journey</h1>
        <p className="mt-1 text-muted">Feedback and a live quiz behind a single link, PIN and QR code.</p>
      </div>
      <NewEventForm
        quizzes={quizzes.map((q) => ({ id: q.id, title: q.title, count: q.questionCount }))}
        forms={forms.map((f) => ({ id: f.id, title: f.title, count: f.fieldCount }))}
      />
    </div>
  );
}
