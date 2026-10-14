import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { GameResults, SessionStatus } from '@thinkwise/shared';
import type { Db } from './client';
import { auditLog, gameSessions, quizzes, sessionPlayers } from './schema';

const SessionId = z.uuid();

export interface SessionSummary {
  id: string;
  quizId: string | null;
  title: string;
  pin: string;
  mode: 'live' | 'self';
  status: SessionStatus;
  playerCount: number;
  questionCount: number;
  questionsAsked: number;
  createdAt: Date;
  startedAt: Date | null;
  endedAt: Date | null;
}

const summaryColumns = {
  id: gameSessions.id,
  quizId: gameSessions.quizId,
  title: gameSessions.title,
  pin: gameSessions.pin,
  mode: gameSessions.mode,
  status: gameSessions.status,
  playerCount: gameSessions.playerCount,
  questionCount: gameSessions.questionCount,
  questionsAsked: gameSessions.questionsAsked,
  createdAt: gameSessions.createdAt,
  startedAt: gameSessions.startedAt,
  endedAt: gameSessions.endedAt,
};

/** Called when a host opens a lobby for a saved quiz. */
export async function createGameSession(
  db: Db,
  host: { id: string; orgId: string | null },
  game: {
    gameId: string;
    pin: string;
    quizId: string | null;
    title: string;
    questionCount: number;
    mode?: 'live' | 'self';
    eventId?: string | null;
  },
) {
  await db.insert(gameSessions).values({
    id: game.gameId,
    hostId: host.id,
    orgId: host.orgId,
    quizId: game.quizId,
    eventId: game.eventId ?? null,
    title: game.title,
    pin: game.pin,
    questionCount: game.questionCount,
    mode: game.mode ?? 'live',
  });
  await db.insert(auditLog).values({ orgId: host.orgId, userId: host.id, action: 'session.create', meta: { sessionId: game.gameId } });
}

/** Stores final results once. Returns false for unknown games and for games already recorded. */
export async function recordResults(db: Db, results: GameResults) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(gameSessions)
      .set({
        status: results.status,
        questionsAsked: results.questionsAsked,
        playerCount: results.players.length,
        questions: results.questions,
        startedAt: results.startedAt ? new Date(results.startedAt) : null,
        endedAt: new Date(results.endedAt),
      })
      .where(and(eq(gameSessions.id, results.gameId), eq(gameSessions.status, 'live')))
      .returning({ id: gameSessions.id });
    if (!row) return false;
    if (results.players.length) {
      await tx.insert(sessionPlayers).values(
        results.players.map((p) => ({
          sessionId: results.gameId,
          nickname: p.nickname,
          avatar: p.avatar,
          score: p.score,
          rank: p.rank,
          correctCount: p.correctCount,
          answers: p.answers,
        })),
      );
    }
    return true;
  });
}

export async function listSessions(db: Db, hostId: string, limit = 50): Promise<SessionSummary[]> {
  return db
    .select(summaryColumns)
    .from(gameSessions)
    .where(eq(gameSessions.hostId, hostId))
    .orderBy(desc(gameSessions.createdAt))
    .limit(limit);
}

/** Each launch of an interactive event, newest first. */
export async function listEventSessions(db: Db, hostId: string, eventId: string, limit = 100): Promise<SessionSummary[]> {
  if (!SessionId.safeParse(eventId).success) return [];
  return db
    .select(summaryColumns)
    .from(gameSessions)
    .where(and(eq(gameSessions.hostId, hostId), eq(gameSessions.eventId, eventId)))
    .orderBy(desc(gameSessions.createdAt))
    .limit(limit);
}

export interface SessionPlayer {
  nickname: string;
  avatar: string;
  score: number;
  rank: number;
  correctCount: number;
  answers: GameResults['players'][number]['answers'];
}

export interface SessionReport extends SessionSummary {
  questions: GameResults['questions'];
  players: SessionPlayer[];
}

export async function getSessionReport(db: Db, hostId: string, id: string): Promise<SessionReport | null> {
  if (!SessionId.safeParse(id).success) return null;
  const [row] = await db
    .select({ ...summaryColumns, questions: gameSessions.questions })
    .from(gameSessions)
    .where(and(eq(gameSessions.id, id), eq(gameSessions.hostId, hostId)))
    .limit(1);
  if (!row) return null;
  const players = await db
    .select({
      nickname: sessionPlayers.nickname,
      avatar: sessionPlayers.avatar,
      score: sessionPlayers.score,
      rank: sessionPlayers.rank,
      correctCount: sessionPlayers.correctCount,
      answers: sessionPlayers.answers,
    })
    .from(sessionPlayers)
    .where(eq(sessionPlayers.sessionId, id))
    .orderBy(sessionPlayers.rank);
  return {
    ...row,
    questions: (row.questions as GameResults['questions'] | null) ?? [],
    players: players.map((p) => ({ ...p, answers: p.answers as SessionPlayer['answers'] })),
  };
}

/** Finished-or-live session counts per quiz, for "N sessions" on quiz cards. */
export async function sessionCounts(db: Db, hostId: string, quizIds: string[]) {
  if (quizIds.length === 0) return new Map<string, number>();
  const rows = await db
    .select({ quizId: gameSessions.quizId, n: sql<number>`count(*)::int` })
    .from(gameSessions)
    .where(and(eq(gameSessions.hostId, hostId), inArray(gameSessions.quizId, quizIds)))
    .groupBy(gameSessions.quizId);
  return new Map(rows.map((r) => [r.quizId!, r.n]));
}

export async function dashboardStats(db: Db, hostId: string, recent = 8) {
  const [quizRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(quizzes)
    .where(and(eq(quizzes.ownerId, hostId), sql`${quizzes.archivedAt} is null`));
  const sessions = await listSessions(db, hostId, recent);
  return {
    quizzes: quizRow?.n ?? 0,
    sessions,
    participants: sessions.reduce((sum, s) => sum + s.playerCount, 0),
  };
}
