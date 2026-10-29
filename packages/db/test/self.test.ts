import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { PlayableQuiz } from '@thinkwise/shared';

process.env.PGLITE_DIR = 'memory://';
delete process.env.DATABASE_URL;

const { openDb } = await import('../src/client');
const { migrateHandle } = await import('../src/migrate');
const auth = await import('../src/auth');
const s = await import('../src/sessions');
const self = await import('../src/selfSessions');
const logic = await import('../src/selfPaced');

const handle = openDb();
const db = handle.db;
let host: { id: string; orgId: string | null };
let other: { id: string; orgId: string | null };

before(async () => {
  await migrateHandle(handle);
  const a = await auth.registerUser(db, { name: 'Sita', email: 'sita@example.com', password: 'sita-pass-1' });
  const b = await auth.registerUser(db, { name: 'Ravi', email: 'ravi@example.com', password: 'ravi-pass-1' });
  if (!a.ok || !b.ok) throw new Error('setup failed');
  host = a.user;
  other = b.user;
});

const quiz = PlayableQuiz.parse({
  title: 'Self quiz',
  questions: [
    { type: 'mc', text: 'One?', options: ['A', 'B', 'C'], correct: [1], timeLimitMs: 20_000, points: 1000 },
    { type: 'text', text: 'Capital of Odisha?', options: [], correct: [], accepted: ['Bhubaneswar'], timeLimitMs: 20_000, points: 1000 },
    { type: 'poll', text: 'Fun?', options: ['Yes', 'No'], correct: [], timeLimitMs: 20_000, points: 0 },
    { type: 'tf', text: 'Sky is blue?', options: ['True', 'False'], correct: [0], timeLimitMs: 20_000, points: 1000, penalty: 250 },
  ],
  rules: { scoring: 'accuracy', streakBonus: false },
});

// Relative to the real clock: listing sessions closes overdue ones by the real time.
const T0 = new Date();
const at = (ms: number) => new Date(T0.getTime() + ms);
const MIN = 60_000;

async function open(limitMs = 10 * MIN, closesInMs = 60 * MIN) {
  return self.createSelfSession(db, host, { quizId: null, title: quiz.title, quiz, opensAt: T0, closesAt: at(closesInMs), timeLimitMs: limitMs });
}

test('scoring follows the quiz rules: accuracy, penalties never below zero, polls unscored', () => {
  const r = logic.scoreAttempt(quiz, {
    '0': { o: 0, a: { choice: 1 }, t: 1000 },
    '1': { o: 0, a: { text: ' bhubaneswar ' }, t: 1000 },
    '2': { o: 0, a: { choice: 0 }, t: 1000 },
    '3': { o: 0, a: { choice: 1 }, t: 1000 },
  });
  assert.equal(r.correctCount, 2);
  assert.equal(r.score, 2000 - 250);
  assert.equal(r.answered, 4);
  const lone = logic.scoreAttempt(quiz, { '3': { o: 0, a: { choice: 1 }, t: 10 } });
  assert.equal(lone.score, 0, 'a penalty never takes the score below zero');
  const speedy = logic.scoreAttempt({ ...quiz, rules: { ...quiz.rules, scoring: 'speed' } }, { '0': { o: 0, a: { choice: 1 }, t: 20_000 } });
  assert.equal(speedy.score, 500, 'answering at the time limit earns half the points');
  assert.equal(logic.judgeAnswer(quiz.questions[0]!, { choice: 7 }), null, 'answers must fit the question');
});

test('participants join with the 7-digit PIN, save, change and submit; results wait for the close', async () => {
  const { id, pin } = await open();
  assert.match(pin, /^\d{7}$/);
  const info = await self.selfInfo(db, pin, at(MIN));
  assert.equal(info?.state, 'open');
  assert.equal(info?.questionCount, 4);
  assert.equal((await self.selfInfo(db, pin, at(-MIN)))?.state, 'upcoming');

  const joined = await self.joinSelf(db, pin, 'Arjun', '🦊', at(MIN));
  assert.ok(joined.ok);
  const token = joined.token;
  assert.deepEqual(await self.joinSelf(db, pin, ' arjun ', '🦊', at(MIN)), { ok: false, reason: 'name_taken' });
  assert.deepEqual(await self.joinSelf(db, pin, 'Bad avatar', 'x', at(MIN)), { ok: false, reason: 'invalid' });

  assert.ok((await self.openSelfQuestion(db, token, 0, at(MIN))).ok);
  assert.ok((await self.saveSelfAnswer(db, token, 0, { choice: 0 }, at(MIN + 1000))).ok);
  assert.ok((await self.saveSelfAnswer(db, token, 0, { choice: 1 }, at(MIN + 2000))).ok, 'answers can change');
  assert.deepEqual(await self.saveSelfAnswer(db, token, 1, { choice: 1 }, at(MIN)), { ok: false, reason: 'invalid' });
  assert.ok((await self.saveSelfAnswer(db, token, 1, { text: 'Bhubaneswar' }, at(MIN + 3000))).ok);
  assert.ok((await self.saveSelfAnswer(db, token, 1, null, at(MIN + 4000))).ok, 'answers can be cleared');

  let state = await self.selfPlayerState(db, token, at(2 * MIN));
  assert.deepEqual(state?.answers, { 0: { choices: [1] } });
  assert.equal(state?.deadlineAt, at(11 * MIN).getTime());
  assert.equal(state?.submitted, false);
  assert.equal(JSON.stringify(state?.questions).includes('correct'), false, 'questions never carry answers');

  assert.ok((await self.submitSelf(db, token, at(3 * MIN))).ok);
  assert.deepEqual(await self.saveSelfAnswer(db, token, 1, { text: 'x' }, at(3 * MIN)), { ok: false, reason: 'locked' });
  state = await self.selfPlayerState(db, token, at(3 * MIN));
  assert.equal(state?.result?.score, 1000);
  assert.equal(state?.result?.correctCount, 1);
  assert.equal(state?.final, null, 'answers and ranks wait until the session closes');

  const view = await self.selfHostView(db, host.id, id, at(3 * MIN));
  assert.equal(view?.participants.length, 1);
  assert.equal(view?.participants[0]?.score, 1000);
  assert.equal(await self.selfHostView(db, other.id, id, at(3 * MIN)), null, 'only the host sees it');
  assert.equal((await s.listRunningSessions(db, host.id))[0]?.id, id, 'open sessions show as running');
});

test('time running out submits the attempt; closing finalises results into the report', async () => {
  const { id, pin } = await open(5 * MIN, 30 * MIN);
  const a = await self.joinSelf(db, pin, 'Asha', '🐼', at(0));
  const b = await self.joinSelf(db, pin, 'Bala', '🦁', at(0));
  assert.ok(a.ok && b.ok);
  await self.saveSelfAnswer(db, a.token, 0, { choice: 1 }, at(1000));
  await self.saveSelfAnswer(db, a.token, 3, { choice: 0 }, at(2000));
  await self.saveSelfAnswer(db, b.token, 0, { choice: 1 }, at(1000));

  // Past Asha's personal limit (plus grace): locked and submitted with what she saved.
  assert.deepEqual(await self.saveSelfAnswer(db, a.token, 1, { text: 'x' }, at(6 * MIN)), { ok: false, reason: 'locked' });
  const late = await self.selfPlayerState(db, a.token, at(6 * MIN));
  assert.equal(late?.submitted, true);
  assert.equal(late?.result?.score, 2000);

  assert.equal(await self.closeSelfSession(db, other.id, id, at(7 * MIN)), false);
  assert.equal(await self.setSelfClosesAt(db, host.id, id, at(-MIN), at(7 * MIN)), false, 'no closing in the past');
  assert.ok(await self.setSelfClosesAt(db, host.id, id, at(8 * MIN), at(7 * MIN)));
  assert.equal((await self.selfInfo(db, pin, at(9 * MIN)))?.state, 'closed', 'closes on its own once the time passes');
  assert.deepEqual(await self.joinSelf(db, pin, 'Late', '🦊', at(9 * MIN)), { ok: false, reason: 'closed' });

  const report = await s.getSessionReport(db, host.id, id);
  assert.equal(report?.status, 'ended');
  assert.equal(report?.mode, 'self');
  assert.deepEqual(report?.players.map((p) => [p.nickname, p.rank, p.score]), [['Asha', 1, 2000], ['Bala', 2, 1000]]);
  assert.equal(report?.questions.length, 4);

  const final = await self.selfPlayerState(db, b.token, at(10 * MIN));
  assert.equal(final?.final?.rank, 2);
  assert.equal(final?.final?.players, 2);
  assert.deepEqual(final?.final?.review[0]?.correct, [1]);
  assert.equal(final?.final?.review[0]?.isCorrect, true);
});

test('a host can close a session early; an empty session counts as abandoned', async () => {
  const { id } = await open();
  assert.ok(await self.closeSelfSession(db, host.id, id, at(MIN)));
  assert.equal(await self.closeSelfSession(db, host.id, id, at(MIN)), false, 'only once');
  const report = await s.getSessionReport(db, host.id, id);
  assert.equal(report?.status, 'abandoned');
});
