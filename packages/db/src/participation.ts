import { createHash } from 'node:crypto';
import { and, desc, eq, lt } from 'drizzle-orm';
import { z } from 'zod';
import { AVATARS, NICKNAME_MAX, type GameResults, type PlayableQuiz } from '@thinkwise/shared';
import type { Db } from './client';
import { gameSessions, liveAttempts, selfAttempts, sessionPlayers } from './schema';

const Id = z.uuid();
export const ParticipantProfile = z.object({
  nickname: z.string().trim().min(1).max(NICKNAME_MAX).regex(/^[\p{L}\p{M}\p{N} _.'-]+$/u),
  avatar: z.enum(AVATARS),
  language: z.string().max(40),
});

export async function selfTokenOwner(db: Db, userId: string, token: string) {
  const [row] = await db.select({ id: selfAttempts.id }).from(selfAttempts).where(and(
    eq(selfAttempts.userId, userId),
    eq(selfAttempts.tokenHash, createHash('sha256').update(token).digest('hex')),
  )).limit(1);
  return Boolean(row);
}

export async function participantSessionByPin(db: Db, pin: string, mode: 'live' | 'self') {
  if (!/^\d{6,7}$/.test(pin)) return null;
  const [row] = await db.select().from(gameSessions).where(and(eq(gameSessions.pin, pin), eq(gameSessions.mode, mode)))
    .orderBy(desc(gameSessions.createdAt)).limit(1);
  return row ?? null;
}

export async function liveAttemptForUser(db: Db, sessionId: string, userId: string) {
  if (!Id.safeParse(sessionId).success) return null;
  const [row] = await db.select().from(liveAttempts)
    .where(and(eq(liveAttempts.sessionId, sessionId), eq(liveAttempts.userId, userId))).limit(1);
  return row ?? null;
}

export async function startLiveAttempt(
  db: Db, sessionId: string, userId: string, profile: z.infer<typeof ParticipantProfile>,
) {
  const existing = await liveAttemptForUser(db, sessionId, userId);
  if (existing) return existing;
  const [row] = await db.insert(liveAttempts).values({ sessionId, userId, ...profile })
    .onConflictDoNothing().returning();
  return row ?? await liveAttemptForUser(db, sessionId, userId);
}

export interface ParticipantHistoryRow {
  id: string;
  title: string;
  pin: string;
  mode: 'live' | 'self';
  language: string;
  startedAt: Date;
  status: string;
  score: number | null;
}

export async function participantHistory(db: Db, userId: string, before?: Date) {
  const ownSelf = await db.select({
    id: gameSessions.id, title: gameSessions.title, pin: gameSessions.pin,
    language: selfAttempts.language, startedAt: selfAttempts.startedAt, submittedAt: selfAttempts.submittedAt,
    score: selfAttempts.score, closesAt: gameSessions.closesAt, timeLimitMs: gameSessions.timeLimitMs, status: gameSessions.status,
  }).from(selfAttempts).innerJoin(gameSessions, eq(gameSessions.id, selfAttempts.sessionId))
    .where(and(eq(selfAttempts.userId, userId), before ? lt(selfAttempts.startedAt, before) : undefined))
    .orderBy(desc(selfAttempts.startedAt)).limit(51);
  const ownLive = await db.select({
    id: gameSessions.id, title: gameSessions.title, pin: gameSessions.pin,
    language: liveAttempts.language, startedAt: liveAttempts.startedAt,
    status: gameSessions.status, score: sessionPlayers.score,
  }).from(liveAttempts).innerJoin(gameSessions, eq(gameSessions.id, liveAttempts.sessionId))
    .leftJoin(sessionPlayers, and(eq(sessionPlayers.sessionId, liveAttempts.sessionId), eq(sessionPlayers.userId, userId)))
    .where(and(eq(liveAttempts.userId, userId), before ? lt(liveAttempts.startedAt, before) : undefined))
    .orderBy(desc(liveAttempts.startedAt)).limit(51);
  const rows: ParticipantHistoryRow[] = [
    ...ownSelf.map((r) => {
      const expired = r.status !== 'live' || Date.now() >= Math.min(
        r.closesAt?.getTime() ?? Infinity, r.timeLimitMs ? r.startedAt.getTime() + r.timeLimitMs : Infinity,
      );
      return { ...r, mode: 'self' as const, status: r.submittedAt ? 'Submitted' : expired ? 'Time ended' : 'In progress',
        score: r.submittedAt ? r.score : null };
    }),
    ...ownLive.map((r) => ({ ...r, mode: 'live' as const,
      status: r.status === 'ended' ? 'Completed' : r.status === 'abandoned' || r.startedAt.getTime() < Date.now() - 12 * 60 * 60_000
        ? 'Interrupted' : 'In progress', score: r.score ?? null })),
  ];
  return rows.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime()).slice(0, 51);
}

export async function participantLiveResult(db: Db, userId: string, id: string) {
  if (!Id.safeParse(id).success) return null;
  const attempt = await liveAttemptForUser(db, id, userId);
  if (!attempt) return null;
  const [session] = await db.select().from(gameSessions).where(eq(gameSessions.id, id)).limit(1);
  if (!session) return null;
  const [player] = await db.select().from(sessionPlayers).where(and(eq(sessionPlayers.sessionId, id), eq(sessionPlayers.userId, userId))).limit(1);
  const quiz = session.quiz as PlayableQuiz | null;
  const showReview = session.status === 'ended' && quiz?.rules.showCorrect === true;
  return {
    title: session.title, pin: session.pin, status: session.status, language: attempt.language,
    nickname: attempt.nickname, avatar: attempt.avatar, startedAt: attempt.startedAt,
    score: player?.score ?? null, correctCount: player?.correctCount ?? null,
    rank: player?.rank ?? null, players: session.playerCount,
    questionsAsked: session.questionsAsked,
    review: showReview ? {
      questions: session.questions as GameResults['questions'],
      answers: (player?.answers ?? []) as GameResults['players'][number]['answers'],
    } : null,
  };
}
