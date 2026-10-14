import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { feedbackFormUsage, getDb, getFeedbackForm } from '@thinkwise/db';
import { requireUser } from '@/lib/session';
import { FormEditor } from './FormEditor';

export const metadata: Metadata = { title: 'Edit feedback form · ThinkWise' };

export default async function EditFeedbackFormPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/feedback/forms/${id}`);
  const db = getDb();
  const [form, usage] = await Promise.all([getFeedbackForm(db, user.id, id), feedbackFormUsage(db, user.id, id)]);
  if (!form) notFound();

  return <FormEditor key={form.id} usage={usage} form={{ id: form.id, title: form.title, description: form.description, fields: form.fields }} />;
}
