'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createFeedbackForm, getDb, saveFeedbackForm } from '@thinkwise/db';
import { FeedbackFormSave } from '@thinkwise/shared';
import { requireUser } from '@/lib/session';

export async function createFeedbackFormAction() {
  const user = await requireUser();
  const id = await createFeedbackForm(getDb(), user);
  revalidatePath('/feedback');
  redirect(`/feedback/forms/${id}`);
}

export type FormSaveResult = { ok: true; version: number } | { ok: false; error: string };

export async function saveFeedbackFormAction(id: string, input: unknown): Promise<FormSaveResult> {
  const user = await requireUser();
  const parsed = FeedbackFormSave.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Some of this form couldn’t be saved.' };
  const saved = await saveFeedbackForm(getDb(), user.id, id, parsed.data);
  if (!saved) return { ok: false, error: 'This form no longer exists.' };
  revalidatePath('/feedback');
  return { ok: true, version: saved.version };
}
