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

test('only the host can pick a running game back up, and only while it is running', async () => {
  const quizId = await q.createQuiz(db, host, 'Running quiz');
  const gameId = randomUUID();
  await s.createGameSession(db, host, { gameId, pin: '111222', quizId, title: 'Running quiz', questionCount: 2, hostToken: 'secret-token' });
  assert.deepEqual(
    (await s.listRunningSessions(db, host.id)).map((x) => x.id),
    [gameId],
    'older games without a saved token are not offered',
  );
  assert.deepEqual(await s.getResumableSession(db, host.id, gameId), { gameId, hostToken: 'secret-token', quizId, source: 'draft' });
  assert.equal(await s.getResumableSession(db, other.id, gameId), null, "another host can't take over");
  assert.deepEqual(await s.listRunningSessions(db, other.id), []);

  await s.recordResults(db, results(gameId));
  assert.deepEqual(await s.listRunningSessions(db, host.id), []);
  assert.equal(await s.getResumableSession(db, host.id, gameId), null, 'finished games are not resumable');
});

test('signed-in live players: one attempt per account, results and review in their own history', async () => {
  const part = await import('../src/participation');
  const { PlayableQuiz } = await import('@thinkwise/shared');
  const quiz = PlayableQuiz.parse({
    title: 'Live bilingual',
    questions: [{
      type: 'mc', text: 'One?', options: ['A', 'B'], correct: [1], timeLimitMs: 20_000, points: 1000,
      translations: { English: { text: 'One?', options: ['A', 'B'] }, Odia: { text: 'ଏକ?', options: ['କ', 'ଖ'] } },
    }],
    rules: { showCorrect: true },
  });
  const gameId = randomUUID();
  await s.createGameSession(db, host, { gameId, pin: '765432', quizId: null, title: 'Live bilingual', questionCount: 1, quiz });
  const reg = await auth.registerUser(db, { name: 'Lina', email: 'lina@example.com', password: 'lina-pass-1' });
  assert.ok(reg.ok);
  const lina = reg.user;

  const session = await part.participantSessionByPin(db, '765432', 'live');
  assert.equal(session?.id, gameId);
  assert.equal(await part.participantSessionByPin(db, '765432', 'self'), null);
  const first = await part.startLiveAttempt(db, gameId, lina.id, { nickname: 'Lina', avatar: '🦊', language: 'Odia' });
  const second = await part.startLiveAttempt(db, gameId, lina.id, { nickname: 'Other', avatar: '🐼', language: 'English' });
  assert.equal(second?.id, first?.id, 'the same attempt, whatever language is asked for next');
  assert.equal(second?.language, 'Odia');
  const taken = await part.startLiveAttempt(db, gameId, other.id, { nickname: 'LINA', avatar: '🐼', language: 'English' });
  assert.equal(taken, null, 'nicknames stay unique in a game');

  let history = await part.participantHistory(db, lina.id);
  assert.deepEqual([history[0]?.mode, history[0]?.status, history[0]?.score], ['live', 'In progress', null]);
  assert.equal((await part.participantLiveResult(db, lina.id, gameId))?.review, null, 'no review while the game runs');

  await s.recordResults(db, results(gameId, {
    questionsAsked: 1,
    questions: [{ type: 'mc', text: 'One?', options: ['A', 'B'], correct: [1], points: 1000, translations: quiz.questions[0]!.translations }],
    players: [{ attemptId: first!.id, nickname: 'Lina', avatar: '🦊', score: 900, rank: 1, correctCount: 1,
      answers: [{ q: 0, choice: 1, isCorrect: true, points: 900, timeMs: 2000 }] }],
  }));
  history = await part.participantHistory(db, lina.id);
  assert.deepEqual([history[0]?.status, history[0]?.score, history[0]?.language], ['Completed', 900, 'Odia']);
  const mine = await part.participantLiveResult(db, lina.id, gameId);
  assert.equal(mine?.rank, 1);
  assert.equal(mine?.review?.answers[0]?.isCorrect, true);
  assert.equal(await part.participantLiveResult(db, other.id, gameId), null, 'only their own result');
});