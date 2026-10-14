import { and, desc, eq, gt, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  FormFields,
  NICKNAME_MAX,
  checkFeedback,
  type AnswerProblem,
  type EventFlow,
  type EventIdentity,
  type FeedbackAnswers,
  type FormField,
} from '@thinkwise/shared';
import type { Db } from './client';
import { feedbackEvents, feedbackForms, feedbackSubmissions, gameSessions, sessionPlayers } from './schema';

const Uuid = z.uuid();
const Pin = z.string().regex(/^\d{6}$/);
const ClientId = z.string().regex(/^[A-Za-z0-9-]{8,64}$/);

/** What a participant needs before the lobby: no answers, scores or host details. */
export interface LiveEventForm {
  sessionId: string;
  eventId: string;
  title: string;
  description: string;
  flow: EventFlow;
  identity: EventIdentity;
  feedbackRequired: boolean;
  form: { id: string; version: number; title: string; description: string; fields: FormField[] };
}

/** The pre-lobby form for the live event game with this PIN, if there is one. */
export async function getLiveEventForm(db: Db, pin: string): Promise<LiveEventForm | null> {
  if (!Pin.safeParse(pin).success) return null;
  const [row] = await db
    .select({
      sessionId: gameSessions.id,
      eventId: feedbackEvents.id,
      title: feedbackEvents.title,
      description: feedbackEvents.description,
      flow: feedbackEvents.flow,
      identity: feedbackEvents.identity,
      feedbackRequired: feedbackEvents.feedbackRequired,
      formId: feedbackForms.id,
      formVersion: feedbackForms.version,
      formTitle: feedbackForms.title,
      formDescription: feedbackForms.description,
      fields: feedbackForms.fields,
    })
    .from(gameSessions)
    .leftJoin(feedbackEvents, eq(feedbackEvents.id, gameSessions.eventId))
    .leftJoin(feedbackForms, eq(feedbackForms.id, feedbackEvents.formId))
    // The newest recent game wins: a game server restart can leave old rows marked live, and PINs get reused.
    .where(and(eq(gameSessions.pin, pin), eq(gameSessions.status, 'live'), gt(gameSessions.createdAt, sql`now() - interval '12 hours'`)))
    .orderBy(desc(gameSessions.createdAt))
    .limit(1);
  if (!row?.eventId || !row.formId || !row.flow || !row.identity || row.formVersion === null) return null;
  // Forms after the quiz come in a later step; these flows ask before the lobby.
  if (!(row.flow === 'before' || row.flow === 'both' || row.flow === 'optional')) return null;
  const fields = FormFields.safeParse(row.fields);
  return {
    sessionId: row.sessionId,
    eventId: row.eventId,
    title: row.title ?? '',
    description: row.description ?? '',
    flow: row.flow,
    identity: row.identity,
    feedbackRequired: row.flow === 'optional' ? false : !!row.feedbackRequired,
    form: {
      id: row.formId,
      version: row.formVersion,
      title: row.formTitle ?? '',
      description: row.formDescription ?? '',
      fields: fields.success ? fields.data : [],
    },
  };
}

export type SubmitFeedbackResult = { ok: true } | { ok: false; error: 'not_found' | 'bad_request' } | { ok: false; error: 'invalid'; problems: Record<string, AnswerProblem> };

/** Stores a participant's pre-lobby feedback. Retries with the same client id are stored once. */
export async function submitEventFeedback(
  db: Db,
  input: { pin: unknown; clientId: unknown; nickname: unknown; answers: unknown },
): Promise<SubmitFeedbackResult> {
  const clientId = ClientId.safeParse(input.clientId);
  if (typeof input.pin !== 'string' || !clientId.success) return { ok: false, error: 'bad_request' };
  const event = await getLiveEventForm(db, input.pin);
  if (!event) return { ok: false, error: 'not_found' };
  const checked = checkFeedback(event.form.fields, input.answers);
  if (!checked.ok) return { ok: false, error: 'invalid', problems: checked.problems };
  const nickname = event.identity === 'anonymous' || typeof input.nickname !== 'string' ? '' : input.nickname.trim().slice(0, NICKNAME_MAX);
  await db
    .insert(feedbackSubmissions)
    .values({
      eventId: event.eventId,
      sessionId: event.sessionId,
      formId: event.form.id,
      formVersion: event.form.version,
      stage: 'before',
      clientId: clientId.data,
      nickname: nickname || null,
      answers: checked.answers,
    })
    .onConflictDoNothing();
  return { ok: true };
}

/** Submission totals for an owner's event, overall and per launch. */
export async function countEventFeedback(db: Db, ownerId: string, eventId: string) {
  if (!Uuid.safeParse(eventId).success) return { total: 0, bySession: {} as Record<string, number> };
  const rows = await db
    .select({ sessionId: feedbackSubmissions.sessionId, n: sql<number>`count(*)::int` })
    .from(feedbackSubmissions)
    .innerJoin(feedbackEvents, eq(feedbackEvents.id, feedbackSubmissions.eventId))
    .where(and(eq(feedbackSubmissions.eventId, eventId), eq(feedbackEvents.ownerId, ownerId)))
    .groupBy(feedbackSubmissions.sessionId);
  return { total: rows.reduce((sum, r) => sum + r.n, 0), bySession: Object.fromEntries(rows.map((r) => [r.sessionId, r.n])) };
}

export interface EventFeedbackExport {
  title: string;
  identity: EventIdentity;
  fields: FormField[];
  sessions: { id: string; pin: string; createdAt: Date }[];
  players: { sessionId: string; nickname: string; score: number; rank: number; correctCount: number }[];
  submissions: { sessionId: string; nickname: string | null; createdAt: Date; answers: FeedbackAnswers }[];
}

/** Everything the event spreadsheet needs, for the event's owner only. */
export async function getEventFeedbackExport(db: Db, ownerId: string, eventId: string): Promise<EventFeedbackExport | null> {
  if (!Uuid.safeParse(eventId).success) return null;
  const [event] = await db
    .select({ title: feedbackEvents.title, identity: feedbackEvents.identity, fields: feedbackForms.fields })
    .from(feedbackEvents)
    .leftJoin(feedbackForms, eq(feedbackForms.id, feedbackEvents.formId))
    .where(and(eq(feedbackEvents.id, eventId), eq(feedbackEvents.ownerId, ownerId)))
    .limit(1);
  if (!event) return null;
  const sessions = await db
    .select({ id: gameSessions.id, pin: gameSessions.pin, createdAt: gameSessions.createdAt })
    .from(gameSessions)
    .where(and(eq(gameSessions.eventId, eventId), eq(gameSessions.hostId, ownerId)))
    .orderBy(gameSessions.createdAt);
  const players = await db
    .select({
      sessionId: sessionPlayers.sessionId,
      nickname: sessionPlayers.nickname,
      score: sessionPlayers.score,
      rank: sessionPlayers.rank,
      correctCount: sessionPlayers.correctCount,
    })
    .from(sessionPlayers)
    .innerJoin(gameSessions, eq(gameSessions.id, sessionPlayers.sessionId))
    .where(and(eq(gameSessions.eventId, eventId), eq(gameSessions.hostId, ownerId)))
    .orderBy(sessionPlayers.rank);
  const submissions = await db
    .select({
      sessionId: feedbackSubmissions.sessionId,
      nickname: feedbackSubmissions.nickname,
      createdAt: feedbackSubmissions.createdAt,
      answers: feedbackSubmissions.answers,
    })
    .from(feedbackSubmissions)
    .where(eq(feedbackSubmissions.eventId, eventId))
    .orderBy(feedbackSubmissions.createdAt);
  const fields = FormFields.safeParse(event.fields ?? []);
  return {
    title: event.title,
    identity: event.identity,
    fields: fields.success ? fields.data : [],
    sessions,
    players,
    submissions: submissions.map((s) => ({ ...s, answers: (s.answers ?? {}) as FeedbackAnswers })),
  };
}
