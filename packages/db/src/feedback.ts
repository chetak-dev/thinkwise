import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  FeedbackEventInput,
  FeedbackFormSave,
  FormFields,
  newField,
  type EventFlow,
  type EventIdentity,
  type FormField,
} from '@thinkwise/shared';
import type { Db } from './client';
import { auditLog, feedbackEvents, feedbackForms, feedbackSubmissions, gameSessions, quizzes } from './schema';

const Uuid = z.uuid();

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
  if (!Uuid.safeParse(id).success) return null;
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
  if (!Uuid.safeParse(id).success) return null;
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
  if (!Uuid.safeParse(id).success) return false;
  const [row] = await db
    .delete(feedbackForms)
    .where(and(eq(feedbackForms.id, id), eq(feedbackForms.ownerId, owner.id)))
    .returning({ id: feedbackForms.id });
  if (!row) return false;
  await db.insert(auditLog).values({ orgId: owner.orgId, userId: owner.id, action: 'feedback_form.delete', meta: { formId: id } });
  return true;
}

export interface FeedbackEventSummary {
  id: string;
  title: string;
  flow: EventFlow;
  quizTitle: string | null;
  launches: number;
  updatedAt: Date;
}

export interface EventForm {
  id: string;
  title: string;
  fieldCount: number;
}

export interface FeedbackEventDoc {
  id: string;
  title: string;
  description: string;
  flow: EventFlow;
  identity: EventIdentity;
  feedbackRequired: boolean;
  allowLateEntry: boolean;
  quiz: { id: string; title: string; questionCount: number } | null;
  form: EventForm | null;
  afterForm: EventForm | null;
  createdAt: Date;
}

export type CreateEventResult = { ok: true; id: string } | { ok: false; error: string };

/** Parses event input and checks the quiz and forms belong to this owner. */
async function checkEventInput(db: Db, ownerId: string, input: FeedbackEventInput) {
  const parsed = FeedbackEventInput.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'Check the event details.' };
  const e = parsed.data;
  const [quiz] = await db
    .select({ id: quizzes.id })
    .from(quizzes)
    .where(and(eq(quizzes.id, e.quizId), eq(quizzes.ownerId, ownerId), isNull(quizzes.archivedAt)))
    .limit(1);
  if (!quiz) return { ok: false as const, error: 'That quiz isn\u2019t available.' };
  const formIds = [e.formId, e.afterFormId].filter((x): x is string => !!x);
  if (formIds.length) {
    const owned = await db
      .select({ id: feedbackForms.id })
      .from(feedbackForms)
      .where(and(inArray(feedbackForms.id, formIds), eq(feedbackForms.ownerId, ownerId)));
    if (new Set(owned.map((f) => f.id)).size !== new Set(formIds).size) return { ok: false as const, error: 'That feedback form isn\u2019t available.' };
  }
  return { ok: true as const, event: e };
}

export async function createFeedbackEvent(
  db: Db,
  owner: { id: string; orgId: string | null },
  input: FeedbackEventInput,
): Promise<CreateEventResult> {
  const checked = await checkEventInput(db, owner.id, input);
  if (!checked.ok) return checked;
  const [row] = await db
    .insert(feedbackEvents)
    .values({ ownerId: owner.id, orgId: owner.orgId, ...checked.event })
    .returning({ id: feedbackEvents.id });
  await db.insert(auditLog).values({ orgId: owner.orgId, userId: owner.id, action: 'feedback_event.create', meta: { eventId: row!.id } });
  return { ok: true, id: row!.id };
}

/** Changes apply to future launches; earlier launches keep their responses. */
export async function updateFeedbackEvent(
  db: Db,
  owner: { id: string; orgId: string | null },
  id: string,
  input: FeedbackEventInput,
): Promise<CreateEventResult> {
  if (!Uuid.safeParse(id).success) return { ok: false, error: 'This event no longer exists.' };
  const checked = await checkEventInput(db, owner.id, input);
  if (!checked.ok) return checked;
  const [row] = await db
    .update(feedbackEvents)
    .set({ ...checked.event, updatedAt: new Date() })
    .where(and(eq(feedbackEvents.id, id), eq(feedbackEvents.ownerId, owner.id)))
    .returning({ id: feedbackEvents.id });
  if (!row) return { ok: false, error: 'This event no longer exists.' };
  await db.insert(auditLog).values({ orgId: owner.orgId, userId: owner.id, action: 'feedback_event.update', meta: { eventId: id } });
  return { ok: true, id };
}

/** Deletes the event and its responses; its game reports stay in Reports. */
export async function deleteFeedbackEvent(db: Db, owner: { id: string; orgId: string | null }, id: string) {
  if (!Uuid.safeParse(id).success) return false;
  const [row] = await db
    .delete(feedbackEvents)
    .where(and(eq(feedbackEvents.id, id), eq(feedbackEvents.ownerId, owner.id)))
    .returning({ id: feedbackEvents.id });
  if (!row) return false;
  await db.insert(auditLog).values({ orgId: owner.orgId, userId: owner.id, action: 'feedback_event.delete', meta: { eventId: id } });
  return true;
}

/** How a form is used, so the editor can warn before changing or deleting it. */
export async function feedbackFormUsage(db: Db, ownerId: string, formId: string) {
  if (!Uuid.safeParse(formId).success) return { events: 0, responses: 0 };
  const [events] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(feedbackEvents)
    .where(and(eq(feedbackEvents.ownerId, ownerId), or(eq(feedbackEvents.formId, formId), eq(feedbackEvents.afterFormId, formId))));
  const [responses] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(feedbackSubmissions)
    .innerJoin(feedbackForms, eq(feedbackForms.id, feedbackSubmissions.formId))
    .where(and(eq(feedbackSubmissions.formId, formId), eq(feedbackForms.ownerId, ownerId)));
  return { events: events?.n ?? 0, responses: responses?.n ?? 0 };
}

export async function listFeedbackEvents(db: Db, ownerId: string, limit = 100): Promise<FeedbackEventSummary[]> {
  return db
    .select({
      id: feedbackEvents.id,
      title: feedbackEvents.title,
      flow: feedbackEvents.flow,
      quizTitle: quizzes.title,
      launches: sql<number>`(select count(*) from ${gameSessions} where ${gameSessions.eventId} = ${feedbackEvents.id})::int`,
      updatedAt: feedbackEvents.updatedAt,
    })
    .from(feedbackEvents)
    .leftJoin(quizzes, eq(quizzes.id, feedbackEvents.quizId))
    .where(eq(feedbackEvents.ownerId, ownerId))
    .orderBy(desc(feedbackEvents.updatedAt))
    .limit(limit);
}

export async function getFeedbackEvent(db: Db, ownerId: string, id: string): Promise<FeedbackEventDoc | null> {
  if (!Uuid.safeParse(id).success) return null;
  const [row] = await db
    .select()
    .from(feedbackEvents)
    .where(and(eq(feedbackEvents.id, id), eq(feedbackEvents.ownerId, ownerId)))
    .limit(1);
  if (!row) return null;
  const [quiz] = row.quizId
    ? await db
        .select({ id: quizzes.id, title: quizzes.title, questionCount: sql<number>`jsonb_array_length(${quizzes.questions})::int` })
        .from(quizzes)
        .where(and(eq(quizzes.id, row.quizId), eq(quizzes.ownerId, ownerId)))
    : [];
  const formIds = [row.formId, row.afterFormId].filter((x): x is string => !!x);
  const forms = formIds.length
    ? await db
        .select({ id: feedbackForms.id, title: feedbackForms.title, fieldCount: sql<number>`jsonb_array_length(${feedbackForms.fields})::int` })
        .from(feedbackForms)
        .where(and(inArray(feedbackForms.id, formIds), eq(feedbackForms.ownerId, ownerId)))
    : [];
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    flow: row.flow,
    identity: row.identity,
    feedbackRequired: row.feedbackRequired,
    allowLateEntry: row.allowLateEntry,
    quiz: quiz ?? null,
    form: forms.find((f) => f.id === row.formId) ?? null,
    afterForm: forms.find((f) => f.id === row.afterFormId) ?? null,
    createdAt: row.createdAt,
  };
}
