import { and, desc, eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { FeedbackFormSave, FormFields, newField, type FormField } from '@thinkwise/shared';
import type { Db } from './client';
import { auditLog, feedbackForms } from './schema';

const FormId = z.uuid();

export interface FeedbackFormSummary {
  id: string;
  title: string;
  fieldCount: number;
  version: number;
  updatedAt: Date;
}

export interface FeedbackFormDoc {
  id: string;
  title: string;
  description: string;
  fields: FormField[];
  version: number;
  updatedAt: Date;
}

export async function listFeedbackForms(db: Db, ownerId: string, limit = 100): Promise<FeedbackFormSummary[]> {
  return db
    .select({
      id: feedbackForms.id,
      title: feedbackForms.title,
      fieldCount: sql<number>`jsonb_array_length(${feedbackForms.fields})::int`,
      version: feedbackForms.version,
      updatedAt: feedbackForms.updatedAt,
    })
    .from(feedbackForms)
    .where(eq(feedbackForms.ownerId, ownerId))
    .orderBy(desc(feedbackForms.updatedAt))
    .limit(limit);
}

export async function createFeedbackForm(db: Db, owner: { id: string; orgId: string | null }) {
  const fields = [newField('rating', randomUUID(), randomUUID)];
  fields[0]!.label = 'How would you rate today’s session?';
  fields[0]!.required = true;
  const [row] = await db
    .insert(feedbackForms)
    .values({ ownerId: owner.id, orgId: owner.orgId, fields })
    .returning({ id: feedbackForms.id });
  await db.insert(auditLog).values({ orgId: owner.orgId, userId: owner.id, action: 'feedback_form.create', meta: { formId: row!.id } });
  return row!.id;
}

export async function getFeedbackForm(db: Db, ownerId: string, id: string): Promise<FeedbackFormDoc | null> {
  if (!FormId.safeParse(id).success) return null;
  const [row] = await db
    .select({
      id: feedbackForms.id,
      title: feedbackForms.title,
      description: feedbackForms.description,
      fields: feedbackForms.fields,
      version: feedbackForms.version,
      updatedAt: feedbackForms.updatedAt,
    })
    .from(feedbackForms)
    .where(and(eq(feedbackForms.id, id), eq(feedbackForms.ownerId, ownerId)))
    .limit(1);
  if (!row) return null;
  const fields = FormFields.safeParse(row.fields);
  return { ...row, fields: fields.success ? fields.data : [] };
}

/** Returns the new version and updatedAt, or null if the form doesn't exist or isn't owned by this user. */
export async function saveFeedbackForm(db: Db, ownerId: string, id: string, input: FeedbackFormSave) {
  if (!FormId.safeParse(id).success) return null;
  const data = FeedbackFormSave.parse(input);
  const [row] = await db
    .update(feedbackForms)
    .set({
      title: data.title,
      description: data.description,
      fields: data.fields,
      version: sql`${feedbackForms.version} + 1`,
      updatedAt: new Date(),
    })
    .where(and(eq(feedbackForms.id, id), eq(feedbackForms.ownerId, ownerId)))
    .returning({ version: feedbackForms.version, updatedAt: feedbackForms.updatedAt });
  return row ?? null;
}

export async function deleteFeedbackForm(db: Db, owner: { id: string; orgId: string | null }, id: string) {
  if (!FormId.safeParse(id).success) return false;
  const [row] = await db
    .delete(feedbackForms)
    .where(and(eq(feedbackForms.id, id), eq(feedbackForms.ownerId, owner.id)))
    .returning({ id: feedbackForms.id });
  if (!row) return false;
  await db.insert(auditLog).values({ orgId: owner.orgId, userId: owner.id, action: 'feedback_form.delete', meta: { formId: id } });
  return true;
}
