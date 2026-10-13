import { and, desc, eq, ilike, isNotNull, isNull, ne, or, sql, type SQL } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  DESCRIPTION_MAX,
  DraftQuestions,
  PlayableQuiz,
  QUIZ_TITLE_MAX,
  QuizSettings,
  defaultQuizSettings,
  newQuestion,
  toPlayable,
  type DraftQuestion,
  type QuizCheck,
} from '@thinkwise/shared';
import type { Db } from './client';
import { auditLog, favourites, quizzes, users } from './schema';

const QuizId = z.uuid();

export const QuizSave = z.object({
  title: z.string().max(QUIZ_TITLE_MAX),
  description: z.string().max(DESCRIPTION_MAX),
  questions: DraftQuestions,
  settings: QuizSettings.optional(),
});
export type QuizSave = z.input<typeof QuizSave>;

export type QuizStatus = 'draft' | 'published';

export const LIBRARY_SCOPES = ['mine', 'drafts', 'published', 'favorites', 'org', 'public', 'archived'] as const;
export type LibraryScope = (typeof LIBRARY_SCOPES)[number];
export type Visibility = QuizSettings['visibility'];

export interface QuizSummary {
  id: string;
  title: string;
  questionCount: number;
  status: QuizStatus;
  favourite: boolean;
  archived: boolean;
  owned: boolean;
  authorName: string;
  visibility: Visibility;
  updatedAt: Date;
}

export interface QuizDoc {
  id: string;
  title: string;
  description: string;
  questions: DraftQuestion[];
  settings: QuizSettings;
  status: QuizStatus;
  publishedAt: Date | null;
  updatedAt: Date;
}

function validId(id: string) {
  return QuizId.safeParse(id).success;
}

const SEARCH_MAX = 100;

const visibilitySql = sql<Visibility>`coalesce(${quizzes.settings}->>'visibility', 'private')`;

/** Other hosts may see a quiz only once it's published, not archived, and not private. Only the published copy is shown. */
const shared = and(eq(quizzes.status, 'published'), isNull(quizzes.archivedAt), sql`${visibilitySql} in ('public', 'unlisted')`);

function displayTitle(userId: string) {
  return sql<string>`case when ${quizzes.ownerId} = ${userId} then ${quizzes.title} else coalesce(${quizzes.published}->>'title', ${quizzes.title}) end`;
}

function searchFilter(q: string, userId: string): SQL | undefined {
  const term = q.trim().slice(0, SEARCH_MAX);
  if (!term) return undefined;
  // Treat the user's text literally: escape LIKE wildcards.
  const pattern = `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  return or(
    ilike(displayTitle(userId), pattern),
    ilike(sql`${quizzes.settings}->>'subject'`, pattern),
    ilike(sql`${quizzes.settings}->>'tags'`, pattern),
  );
}

export async function listQuizzes(
  db: Db,
  userId: string,
  {
    scope = 'mine',
    q = '',
    limit = 100,
    orgId = null,
  }: { scope?: LibraryScope; q?: string; limit?: number; orgId?: string | null } = {},
): Promise<QuizSummary[]> {
  const fav = and(eq(favourites.quizId, quizzes.id), eq(favourites.userId, userId));
  const owned = eq(quizzes.ownerId, userId);
  const live = isNull(quizzes.archivedAt);
  const byScope: Record<LibraryScope, SQL | undefined> = {
    mine: and(owned, live),
    drafts: and(owned, live, eq(quizzes.status, 'draft')),
    published: and(owned, live, eq(quizzes.status, 'published')),
    favorites: and(isNotNull(favourites.quizId), or(and(owned, live), shared)),
    org: orgId ? and(eq(quizzes.orgId, orgId), ne(quizzes.ownerId, userId), shared) : sql`false`,
    public: and(shared, sql`${visibilitySql} = 'public'`),
    archived: and(owned, isNotNull(quizzes.archivedAt)),
  };
  return db
    .select({
      id: quizzes.id,
      title: displayTitle(userId),
      questionCount: sql<number>`case when ${quizzes.ownerId} = ${userId}
        then jsonb_array_length(${quizzes.questions})
        else coalesce(jsonb_array_length(${quizzes.published}->'questions'), 0) end::int`,
      status: quizzes.status,
      favourite: sql<boolean>`${favourites.quizId} is not null`,
      archived: sql<boolean>`${quizzes.archivedAt} is not null`,
      owned: sql<boolean>`${quizzes.ownerId} = ${userId}`,
      authorName: users.name,
      visibility: visibilitySql,
      updatedAt: quizzes.updatedAt,
    })
    .from(quizzes)
    .innerJoin(users, eq(users.id, quizzes.ownerId))
    .leftJoin(favourites, fav)
    .where(and(byScope[scope], searchFilter(q, userId)))
    .orderBy(desc(quizzes.updatedAt))
    .limit(limit);
}

export async function countQuizzes(db: Db, ownerId: string) {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(quizzes)
    .where(and(eq(quizzes.ownerId, ownerId), isNull(quizzes.archivedAt)));
  return row?.n ?? 0;
}

/** Returns false if the quiz isn't one the user may favourite (their own, or one shared with them). */
export async function setFavourite(db: Db, userId: string, quizId: string, on: boolean) {
  if (!validId(quizId)) return false;
  const [quiz] = await db
    .select({ id: quizzes.id })
    .from(quizzes)
    .where(and(eq(quizzes.id, quizId), or(eq(quizzes.ownerId, userId), shared)))
    .limit(1);
  if (!quiz) return false;
  if (on) await db.insert(favourites).values({ userId, quizId }).onConflictDoNothing();
  else await db.delete(favourites).where(and(eq(favourites.userId, userId), eq(favourites.quizId, quizId)));
  return true;
}

export async function setArchived(db: Db, owner: { id: string; orgId: string | null }, id: string, archived: boolean) {
  if (!validId(id)) return false;
  const [row] = await db
    .update(quizzes)
    .set({ archivedAt: archived ? new Date() : null })
    .where(and(eq(quizzes.id, id), eq(quizzes.ownerId, owner.id)))
    .returning({ id: quizzes.id });
  if (!row) return false;
  await db
    .insert(auditLog)
    .values({ orgId: owner.orgId, userId: owner.id, action: archived ? 'quiz.archive' : 'quiz.unarchive', meta: { quizId: id } });
  return true;
}

export async function createQuiz(
  db: Db,
  owner: { id: string; orgId: string | null },
  title = 'Untitled quiz',
  questions?: DraftQuestion[],
) {
  const start = questions?.length ? DraftQuestions.parse(questions) : [newQuestion('mc')];
  const [row] = await db
    .insert(quizzes)
    .values({ ownerId: owner.id, orgId: owner.orgId, title: title.slice(0, QUIZ_TITLE_MAX), questions: start })
    .returning({ id: quizzes.id });
  await db
    .insert(auditLog)
    .values({ orgId: owner.orgId, userId: owner.id, action: questions?.length ? 'quiz.import' : 'quiz.create', meta: { quizId: row!.id } });
  return row!.id;
}

export async function getQuiz(db: Db, ownerId: string, id: string): Promise<QuizDoc | null> {
  if (!validId(id)) return null;
  const [row] = await db
    .select({
      id: quizzes.id,
      title: quizzes.title,
      description: quizzes.description,
      questions: quizzes.questions,
      settings: quizzes.settings,
      status: quizzes.status,
      publishedAt: quizzes.publishedAt,
      updatedAt: quizzes.updatedAt,
    })
    .from(quizzes)
    .where(and(eq(quizzes.id, id), eq(quizzes.ownerId, ownerId)))
    .limit(1);
  if (!row) return null;
  const questions = DraftQuestions.safeParse(row.questions);
  const settings = QuizSettings.safeParse(row.settings ?? {});
  return {
    ...row,
    questions: questions.success ? questions.data : [],
    settings: settings.success ? settings.data : defaultQuizSettings(),
  };
}

/** Returns the new updatedAt, or null if the quiz doesn't exist or isn't owned by this user. */
export async function saveQuiz(db: Db, ownerId: string, id: string, input: QuizSave): Promise<Date | null> {
  if (!validId(id)) return null;
  const data = QuizSave.parse(input);
  const [row] = await db
    .update(quizzes)
    .set({
      title: data.title,
      description: data.description,
      questions: data.questions,
      ...(data.settings ? { settings: data.settings } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(quizzes.id, id), eq(quizzes.ownerId, ownerId)))
    .returning({ updatedAt: quizzes.updatedAt });
  return row?.updatedAt ?? null;
}

export async function duplicateQuiz(db: Db, owner: { id: string; orgId: string | null }, id: string) {
  const source = await getQuiz(db, owner.id, id);
  if (!source) return null;
  const title = `${source.title} (copy)`.slice(0, QUIZ_TITLE_MAX);
  const [row] = await db
    .insert(quizzes)
    .values({
      ownerId: owner.id,
      orgId: owner.orgId,
      title,
      description: source.description,
      questions: source.questions,
      settings: source.settings,
    })
    .returning({ id: quizzes.id });
  await db.insert(auditLog).values({ orgId: owner.orgId, userId: owner.id, action: 'quiz.duplicate', meta: { from: id, quizId: row!.id } });
  return row!.id;
}

export async function deleteQuiz(db: Db, owner: { id: string; orgId: string | null }, id: string) {
  if (!validId(id)) return false;
  const deleted = await db
    .delete(quizzes)
    .where(and(eq(quizzes.id, id), eq(quizzes.ownerId, owner.id)))
    .returning({ id: quizzes.id });
  if (deleted.length === 0) return false;
  await db.insert(auditLog).values({ orgId: owner.orgId, userId: owner.id, action: 'quiz.delete', meta: { quizId: id } });
  return true;
}

export type PublishResult =
  | { ok: true; publishedAt: Date }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'not_ready'; check: Extract<QuizCheck, { ok: false }> };

/** Freezes the current draft as the published version. Only quizzes that could be hosted can be published. */
export async function publishQuiz(db: Db, owner: { id: string; orgId: string | null }, id: string): Promise<PublishResult> {
  const quiz = await getQuiz(db, owner.id, id);
  if (!quiz) return { ok: false, reason: 'not_found' };
  const check = toPlayable(quiz.title, quiz.questions, quiz.settings);
  if (!check.ok) return { ok: false, reason: 'not_ready', check };
  const publishedAt = new Date();
  const [row] = await db
    .update(quizzes)
    .set({
      status: 'published',
      published: { ...check.quiz, description: quiz.description.trim() },
      publishedAt,
    })
    .where(and(eq(quizzes.id, id), eq(quizzes.ownerId, owner.id)))
    .returning({ id: quizzes.id });
  if (!row) return { ok: false, reason: 'not_found' };
  await db.insert(auditLog).values({ orgId: owner.orgId, userId: owner.id, action: 'quiz.publish', meta: { quizId: id } });
  return { ok: true, publishedAt };
}

const PublishedSnapshot = PlayableQuiz.extend({ description: z.string().default('') });
export type PublishedSnapshot = z.infer<typeof PublishedSnapshot>;

export interface SharedQuizView {
  id: string;
  owned: boolean;
  authorName: string;
  visibility: Visibility;
  favourite: boolean;
  publishedAt: Date | null;
  quiz: PublishedSnapshot;
}

/**
 * The published copy of a quiz as another host (or the owner) may see it.
 * Returns 'draft_only' when the owner opens a quiz that has never been published.
 */
export async function getSharedQuiz(db: Db, viewerId: string, id: string): Promise<SharedQuizView | 'draft_only' | null> {
  if (!validId(id)) return null;
  const [row] = await db
    .select({
      id: quizzes.id,
      ownerId: quizzes.ownerId,
      authorName: users.name,
      visibility: visibilitySql,
      published: quizzes.published,
      publishedAt: quizzes.publishedAt,
      favourite: sql<boolean>`${favourites.quizId} is not null`,
    })
    .from(quizzes)
    .innerJoin(users, eq(users.id, quizzes.ownerId))
    .leftJoin(favourites, and(eq(favourites.quizId, quizzes.id), eq(favourites.userId, viewerId)))
    .where(and(eq(quizzes.id, id), or(eq(quizzes.ownerId, viewerId), shared)))
    .limit(1);
  if (!row) return null;
  const owned = row.ownerId === viewerId;
  const snapshot = PublishedSnapshot.safeParse(row.published);
  if (!snapshot.success) return owned ? 'draft_only' : null;
  return {
    id: row.id,
    owned,
    authorName: row.authorName,
    visibility: row.visibility,
    favourite: row.favourite,
    publishedAt: row.publishedAt,
    quiz: snapshot.data,
  };
}

/** The published copy, ready for the game server; null if the viewer may not host it. */
export async function getHostablePublished(db: Db, viewerId: string, id: string) {
  const view = await getSharedQuiz(db, viewerId, id);
  if (!view || view === 'draft_only') return null;
  return PlayableQuiz.parse(view.quiz);
}

/** Copies a shared quiz's published version into the viewer's library as a private draft. */
export async function copyQuiz(db: Db, viewer: { id: string; orgId: string | null }, id: string) {
  const view = await getSharedQuiz(db, viewer.id, id);
  if (!view || view === 'draft_only') return null;
  const { quiz } = view;
  const questions: DraftQuestion[] = quiz.questions.map((q) => ({
    ...newQuestion(q.type, randomUUID()),
    text: q.text,
    options: [...q.options],
    correct: [...q.correct],
    timeLimitMs: q.timeLimitMs,
    points: q.points,
    imageUrl: q.imageUrl,
    penalty: q.penalty,
    hint: q.hint,
    explanation: q.explanation,
  }));
  const settings = QuizSettings.parse({ ...quiz.rules, visibility: 'private' });
  const [row] = await db
    .insert(quizzes)
    .values({
      ownerId: viewer.id,
      orgId: viewer.orgId,
      title: quiz.title.slice(0, QUIZ_TITLE_MAX),
      description: quiz.description,
      questions: DraftQuestions.parse(questions),
      settings,
    })
    .returning({ id: quizzes.id });
  await db.insert(auditLog).values({ orgId: viewer.orgId, userId: viewer.id, action: 'quiz.copy', meta: { from: id, quizId: row!.id } });
  return row!.id;
}
