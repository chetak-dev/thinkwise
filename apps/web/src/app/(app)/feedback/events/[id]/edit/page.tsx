import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getDb, getFeedbackEvent, listFeedbackForms, listQuizzes } from '@thinkwise/db';
import { requireUser } from '@/lib/session';
import { NewEventForm } from '../../../new/NewEventForm';

export const metadata: Metadata = { title: 'Edit event · ThinkWise' };

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/feedback/events/${id}/edit`);
  const db = getDb();
  const [event, quizzes, forms] = await Promise.all([
    getFeedbackEvent(db, user.id, id),
    listQuizzes(db, user.id, { scope: 'mine' }),
    listFeedbackForms(db, user.id),
  ]);
  if (!event) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <p className="text-xs font-bold uppercase tracking-[.16em] text-nova-600 dark:text-nova-300">Edit event</p>
        <h1 className="mt-1 break-words font-display text-3xl font-bold">{event.title}</h1>
        <p className="mt-1 text-muted">Changes apply to the next launch. Earlier launches keep their responses and reports.</p>
      </div>
      <NewEventForm
        eventId={event.id}
        initial={{
          title: event.title,
          description: event.description,
          quizId: event.quiz?.id ?? '',
          formId: event.form?.id ?? null,
          afterFormId: event.afterForm?.id ?? null,
          flow: event.flow,
          identity: event.identity,
          feedbackRequired: event.feedbackRequired,
          allowLateEntry: event.allowLateEntry,
        }}
        quizzes={quizzes.map((q) => ({ id: q.id, title: q.title, count: q.questionCount }))}
        forms={forms.map((f) => ({ id: f.id, title: f.title, count: f.fieldCount }))}
      />
    </div>
  );
}
