import { and, desc, eq, gt, inArray, sql, type SQL } from 'drizzle-orm';
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
const Stage = z.enum(['before', 'after']);
export type FeedbackStage = z.infer<typeof Stage>;

export interface EventFormForPlayer {
  id: string;
  version: number;
  title: string;
  description: string;
  fields: FormField[];
}

/** What a participant needs: no answers, scores or host details. `ref` is the game session. */
export interface PlayEventInfo {
  ref: string;
  eventId: string;
  title: string;
  description: string;
  identity: EventIdentity;
  required: boolean;
  before: EventFormForPlayer | null;
  after: EventFormForPlayer | null;
}

function formIdsFor(flow: EventFlow, formId: string | null, afterFormId: string | null) {
  return {
    before: flow === 'before' || flow === 'both' || flow === 'optional' ? formId : null,
    after: flow === 'after' ? formId : flow === 'both' ? afterFormId : null,
  };
}

// The newest recent game wins: a game server restart can leave old rows marked live, and PINs get reused.
const RECENT = sql`now() - interval '12 hours'`;

async function eventInfo(db: Db, where: SQL): Promise<PlayEventInfo | null> {
  const [row] = await db
    .select({
      ref: gameSessions.id,
      eventId: feedbackEvents.id,
      title: feedbackEvents.title,
      description: feedbackEvents.description,
      flow: feedbackEvents.flow,
      identity: feedbackEvents.identity,
      feedbackRequired: feedbackEvents.feedbackRequired,
      formId: feedbackEvents.formId,
      afterFormId: feedbackEvents.afterFormId,
    })
    .from(gameSessions)
    .leftJoin(feedbackEvents, eq(feedbackEvents.id, gameSessions.eventId))
    .where(and(where, gt(gameSessions.createdAt, RECENT)))
    .orderBy(desc(gameSessions.createdAt))
    .limit(1);
  if (!row?.eventId || !row.flow || !row.identity) return null;
  const ids = formIdsFor(row.flow, row.formId, row.afterFormId);
  const wanted = [ids.before, ids.after].filter((x): x is string => !!x);
  if (!wanted.length) return null;
  const forms = await db
    .select({
      id: feedbackForms.id,
      version: feedbackForms.version,
      title: feedbackForms.title,
      description: feedbackForms.description,
      fields: feedbackForms.fields,
    })
    .from(feedbackForms)
    .where(inArray(feedbackForms.id, wanted));
  const pick = (id: string | null): EventFormForPlayer | null => {
    const f = forms.find((x) => x.id === id);
    if (!f) return null;
    const fields = FormFields.safeParse(f.fields);
    return { ...f, fields: fields.success ? fields.data : [] };
  };
  const before = pick(ids.before);
  const after = pick(ids.after);
  if (!before && !after) return null;
  return {
    ref: row.ref,
    eventId: row.eventId,
    title: row.title ?? '',
    description: row.description ?? '',
    identity: row.identity,
    required: row.flow === 'optional' ? false : !!row.feedbackRequired,
    before,
    after,
  };
}

/** The event behind a running game's PIN, if it collects feedback. */
export async function getEventForPin(db: Db, pin: string) {
  if (!Pin.safeParse(pin).success) return null;
  return eventInfo(db, and(eq(gameSessions.pin, pin), eq(gameSessions.status, 'live'))!);
}

/** The same, by game session, so after-quiz feedback still works once the game has ended. */
export async function getEventForRef(db: Db, ref: string) {
  if (!Uuid.safeParse(ref).success) return null;
  return eventInfo(db, eq(gameSessions.id, ref));
}

export type SubmitFeedbackResult = { ok: true } | { ok: false; error: 'not_found' | 'bad_request' } | { ok: false; error: 'invalid'; problems: Record<string, AnswerProblem> };

/** Stores a participant's feedback for one stage. Retries with the same client id are stored once. */
export async function submitEventFeedback(
  db: Db,
  input: { ref: unknown; stage: unknown; clientId: unknown; nickname: unknown; answers: unknown },
): Promise<SubmitFeedbackResult> {
  const clientId = ClientId.safeParse(input.clientId);
  const stage = Stage.safeParse(input.stage);
  if (typeof input.ref !== 'string' || !clientId.success || !stage.success) return { ok: false, error: 'bad_request' };
  const event = await getEventForRef(db, input.ref);
  const form = event?.[stage.data];
  if (!event || !form) return { ok: false, error: 'not_found' };
  const checked = checkFeedback(form.fields, input.answers);
  if (!checked.ok) return { ok: false, error: 'invalid', problems: checked.problems };
  const nickname = event.identity === 'anonymous' || typeof input.nickname !== 'string' ? '' : input.nickname.trim().slice(0, NICKNAME_MAX);
  await db
    .insert(feedbackSubmissions)
    .values({
      eventId: event.eventId,
      sessionId: event.ref,
      formId: form.id,
      formVersion: form.version,
      stage: stage.data,
      clientId: clientId.data,
      nickname: nickname || null,
      answers: checked.answers,
    })
    .onConflictDoNothing();
  return { ok: true };
}

/** Submission totals for an owner's event: overall, per stage and per launch. */
export async function countEventFeedback(db: Db, ownerId: string, eventId: string) {
  const empty = { total: 0, before: 0, after: 0, bySession: {} as Record<string, number> };
  if (!Uuid.safeParse(eventId).success) return empty;
  const rows = await db
    .select({ sessionId: feedbackSubmissions.sessionId, stage: feedbackSubmissions.stage, n: sql<number>`count(*)::int` })
    .from(feedbackSubmissions)
    .innerJoin(feedbackEvents, eq(feedbackEvents.id, feedbackSubmissions.eventId))
    .where(and(eq(feedbackSubmissions.eventId, eventId), eq(feedbackEvents.ownerId, ownerId)))
    .groupBy(feedbackSubmissions.sessionId, feedbackSubmissions.stage);
  for (const r of rows) {
    empty.total += r.n;
    empty[r.stage] += r.n;
    empty.bySession[r.sessionId] = (empty.bySession[r.sessionId] ?? 0) + r.n;
  }
  return empty;
}

/** Live count for the host's lobby screen; null unless this host's game belongs to an event. */
export async function countGameFeedback(db: Db, hostId: string, gameId: string) {
  if (!Uuid.safeParse(gameId).success) return null;
  const [session] = await db
    .select({ eventId: gameSessions.eventId })
    .from(gameSessions)
    .where(and(eq(gameSessions.id, gameId), eq(gameSessions.hostId, hostId)))
    .limit(1);
  if (!session?.eventId) return null;
  const rows = await db
    .select({ stage: feedbackSubmissions.stage, n: sql<number>`count(*)::int` })
    .from(feedbackSubmissions)
    .where(eq(feedbackSubmissions.sessionId, gameId))
    .groupBy(feedbackSubmissions.stage);
  return { before: rows.find((r) => r.stage === 'before')?.n ?? 0, after: rows.find((r) => r.stage === 'after')?.n ?? 0 };
}

export interface EventFeedbackExport {
  title: string;
  identity: EventIdentity;
  beforeFields: FormField[];
  afterFields: FormField[];
  sessions: { id: string; pin: string; createdAt: Date }[];
  players: { sessionId: string; nickname: string; score: number; rank: number; correctCount: number }[];
  submissions: { sessionId: string; stage: FeedbackStage; nickname: string | null; createdAt: Date; answers: FeedbackAnswers }[];
}

/** Everything the event spreadsheet and summary need, for the event's owner only. */
export async function getEventFeedbackExport(db: Db, ownerId: string, eventId: string): Promise<EventFeedbackExport | null> {
  if (!Uuid.safeParse(eventId).success) return null;
  const [event] = await db
    .select({
      title: feedbackEvents.title,
      identity: feedbackEvents.identity,
      flow: feedbackEvents.flow,
      formId: feedbackEvents.formId,
      afterFormId: feedbackEvents.afterFormId,
    })
    .from(feedbackEvents)
    .where(and(eq(feedbackEvents.id, eventId), eq(feedbackEvents.ownerId, ownerId)))
    .limit(1);
  if (!event) return null;
  const ids = formIdsFor(event.flow, event.formId, event.afterFormId);
  const wanted = [ids.before, ids.after].filter((x): x is string => !!x);
  const forms = wanted.length
    ? await db.select({ id: feedbackForms.id, fields: feedbackForms.fields }).from(feedbackForms).where(inArray(feedbackForms.id, wanted))
    : [];
  const fieldsOf = (id: string | null) => {
    const parsed = FormFields.safeParse(forms.find((f) => f.id === id)?.fields ?? []);
    return parsed.success ? parsed.data : [];
  };
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
      stage: feedbackSubmissions.stage,
      nickname: feedbackSubmissions.nickname,
      createdAt: feedbackSubmissions.createdAt,
      answers: feedbackSubmissions.answers,
    })
    .from(feedbackSubmissions)
    .where(eq(feedbackSubmissions.eventId, eventId))
    .orderBy(feedbackSubmissions.createdAt);
  return {
    title: event.title,
    identity: event.identity,
    beforeFields: fieldsOf(ids.before),
    afterFields: fieldsOf(ids.after),
    sessions,
    players,
    submissions: submissions.map((s) => ({ ...s, answers: (s.answers ?? {}) as FeedbackAnswers })),
  };
}
