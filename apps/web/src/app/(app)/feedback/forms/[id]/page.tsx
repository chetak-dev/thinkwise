import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getDb, getFeedbackForm } from '@thinkwise/db';
import { requireUser } from '@/lib/session';
import { FormEditor } from './FormEditor';

export const metadata: Metadata = { title: 'Edit feedback form · ThinkWise' };

export default async function EditFeedbackFormPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/feedback/forms/${id}`);
  const form = await getFeedbackForm(getDb(), user.id, id);
  if (!form) notFound();

  return <FormEditor key={form.id} form={{ id: form.id, title: form.title, description: form.description, fields: form.fields }} />;
}
