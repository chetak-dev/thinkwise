import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { GameResults } from '@thinkwise/shared';

process.env.PGLITE_DIR = 'memory://';
delete process.env.DATABASE_URL;

const { openDb } = await import('../src/client');
const { migrateHandle } = await import('../src/migrate');
const auth = await import('../src/auth');
const q = await import('../src/quizzes');
const s = await import('../src/sessions');
const schema = await import('../src/schema');
const { eq } = await import('drizzle-orm');

const handle = openDb();
const db = handle.db;
let host: { id: string; orgId: string | null };
let other: { id: string; orgId: string | null };

before(async () => {
  await migrateHandle(handle);
  const a = await auth.registerUser(db, { name: 'Hana', email: 'hana@example.com', password: 'hana-pass-1' });
  const b = await auth.registerUser(db, { name: 'Ivo', email: 'ivo@example.com', password: 'ivo-pass-12' });
  if (!a.ok || !b.ok) throw new Error('setup failed');
  host = a.user;
  other = b.user;
});

const results = (gameId: string, overrides: Partial<GameResults> = {}): GameResults => ({
  gameId,
  status: 'ended',
  startedAt: Date.now() - 60_000,
  endedAt: Date.now(),
  questionsAsked: 2,
  questions: [
    { type: 'mc', text: 'One?', options: ['A', 'B'], correct: [1], points: 1000 },
    { type: 'tf', text: 'Two?', options: ['True', 'False'], correct: [0], points: 1000 },
  ],
  players: [
    { nickname: 'Asha', avatar: '🦊', score: 1800, rank: 1, correctCount: 2, answers: [
      { q: 0, choice: 1, isCorrect: true, points: 900, timeMs: 2100 },
      { q: 1, choice: 0, isCorrect: true, points: 900, timeMs: 1500 },
    ] },
    { nickname: 'Ben', avatar: '🐼', score: 0, rank: 2, correctCount: 0, answers: [{ q: 0, choice: 0, isCorrect: false, points: 0, timeMs: 4000 }] },
  ],
  ...overrides,
});

test('a hosted game becomes a session; results are stored once and only for the host', async () => {
  const quizId = await q.createQuiz(db, host, 'Reported quiz');
  const gameId = randomUUID();
  await s.createGameSession(db, host, { gameId, pin: '123456', quizId, title: 'Reported quiz', questionCount: 2 });

  let list = await s.listSessions(db, host.id);
  assert.equal(list[0]?.status, 'live');
  assert.equal(list[0]?.playerCount, 0);

  assert.equal(await s.recordResults(db, results(randomUUID())), false, 'unknown games are ignored');
  assert.equal(await s.recordResults(db, results(gameId)), true);
  assert.equal(await s.recordResults(db, results(gameId, { players: [] })), false, 'recorded only once');

  list = await s.listSessions(db, host.id);
  assert.equal(list[0]?.status, 'ended');
  assert.equal(list[0]?.playerCount, 2);
  assert.equal(list[0]?.questionsAsked, 2);

  const report = await s.getSessionReport(db, host.id, gameId);
  assert.equal(report?.players.length, 2);
  assert.equal(report?.players[0]?.nickname, 'Asha', 'ordered by rank');
  assert.equal(report?.players[0]?.answers[1]?.timeMs, 1500);
  assert.equal(report?.questions[0]?.text, 'One?');

  assert.equal(await s.getSessionReport(db, other.id, gameId), null, "another host can't read it");
  assert.deepEqual(await s.listSessions(db, other.id), []);
  assert.equal(await s.getSessionReport(db, host.id, 'nope'), null);

  const counts = await s.sessionCounts(db, host.id, [quizId]);
  assert.equal(counts.get(quizId), 1);
  const stats = await s.dashboardStats(db, host.id);
  assert.equal(stats.sessions.length, 1);
  assert.equal(stats.participants, 2);
  assert.ok(stats.quizzes >= 1);

  await q.deleteQuiz(db, host, quizId);
  assert.equal((await s.listSessions(db, host.id))[0]?.quizId, null, 'reports survive deleting the quiz');
});

test('a game left "live" by a server restart reads as not played once it is old', async () => {
  const gameId = randomUUID();
  await s.createGameSession(db, host, { gameId, pin: '654321', quizId: null, title: 'Lost game', questionCount: 1 });
  assert.equal((await s.getSessionReport(db, host.id, gameId))?.status, 'live');
  await db
    .update(schema.gameSessions)
    .set({ createdAt: new Date(Date.now() - 13 * 60 * 60 * 1000) })
    .where(eq(schema.gameSessions.id, gameId));
  assert.equal((await s.getSessionReport(db, host.id, gameId))?.status, 'abandoned');
  assert.equal((await s.listSessions(db, host.id)).find((x) => x.id === gameId)?.status, 'abandoned');
});
