import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import type { ClientMessage, GameResults, ServerMessage } from '@thinkwise/shared';

const PORT = 4555;
const RESULTS_PORT = 4556;
const WS_URL = `ws://127.0.0.1:${PORT}/ws`;
let server: ChildProcess;
let receiver: Server;
const reports: { auth: string | undefined; body: GameResults }[] = [];

before(async () => {
  receiver = createServer((req, res) => {
    let raw = '';
    req.on('data', (c: Buffer) => (raw += c));
    req.on('end', () => {
      reports.push({ auth: req.headers.authorization, body: JSON.parse(raw) as GameResults });
      res.writeHead(204).end();
    });
  });
  await new Promise<void>((resolve) => receiver.listen(RESULTS_PORT, '127.0.0.1', resolve));
  const cwd = fileURLToPath(new URL('..', import.meta.url));
  server = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
    cwd,
    env: {
      ...process.env,
      PORT: String(PORT),
      NODE_ENV: 'test',
      RESULTS_URL: `http://127.0.0.1:${RESULTS_PORT}/results`,
    },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server did not start')), 15_000);
    server.stdout!.on('data', (d: Buffer) => {
      if (d.toString().includes('listening')) {
        clearTimeout(timer);
        resolve();
      }
    });
  });
});

after(() => {
  server.kill();
  receiver.close();
});

type Msg<T extends ServerMessage['t']> = Extract<ServerMessage, { t: T }>;

class Client {
  ws: WebSocket;
  inbox: ServerMessage[] = [];
  private waiters: Array<() => void> = [];

  constructor() {
    this.ws = new WebSocket(WS_URL);
    this.ws.on('message', (raw) => {
      this.inbox.push(JSON.parse(raw.toString()) as ServerMessage);
      for (const w of this.waiters.splice(0)) w();
    });
  }

  open() {
    return new Promise<void>((resolve, reject) => {
      this.ws.once('open', () => resolve());
      this.ws.once('error', reject);
    });
  }

  send(msg: ClientMessage) {
    this.ws.send(JSON.stringify(msg));
  }

  /** Waits for the next message of a type that arrives after `since` (an inbox index). */
  async next<T extends ServerMessage['t']>(t: T, since = 0, timeoutMs = 5_000): Promise<Msg<T>> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const found = this.inbox.slice(since).find((m) => m.t === t);
      if (found) return found as Msg<T>;
      if (Date.now() > deadline) throw new Error(`timed out waiting for ${t}; got ${this.inbox.map((m) => m.t).join(',')}`);
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 100);
        this.waiters.push(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
  }

  mark() {
    return this.inbox.length;
  }

  close() {
    this.ws.close();
  }
}

async function host() {
  const c = new Client();
  await c.open();
  c.send({ t: 'host:create' });
  const ready = await c.next('host:ready');
  return { c, ready };
}

async function player(pin: string, nickname: string) {
  const c = new Client();
  await c.open();
  c.send({ t: 'player:join', pin, nickname, avatar: '🦊' });
  const ready = await c.next('player:ready');
  return { c, ready };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('full game: scoring, reveal, leaderboard, final and no answer leaks', async () => {
  const { c: h, ready } = await host();
  assert.equal(ready.questionCount, 5);
  const a = await player(ready.pin, 'Asha');
  const b = await player(ready.pin, 'Bilal');
  const c = await player(ready.pin, 'Chen');

  // Leaderboard auto-show is turned off so each phase is driven explicitly.
  h.send({ t: 'host:settings', settings: { leaderboardAfterEach: false } });
  await h.next('settings', h.mark() - 1);

  let mark = a.c.mark();
  h.send({ t: 'host:start' });
  const q1 = await a.c.next('question', mark);
  assert.equal(q1.question.index, 0);
  assert.equal(q1.question.options.length, 4);
  assert.ok(!('correct' in q1.question), 'question must not include the answer');
  assert.ok(!JSON.stringify(q1).includes('"correct"'), 'no correct field anywhere in question payload');
  assert.ok(q1.timer.remainingMs > 19_000 && q1.timer.remainingMs <= 20_000);

  // Asha answers right immediately, Bilal answers wrong, Chen answers right after ~1s.
  mark = a.c.mark();
  // Let the full player list that follows a new question go out first.
  await sleep(300);
  const answeredMark = h.mark();
  a.c.send({ t: 'player:answer', index: 0, choice: 1 });
  await a.c.next('answer:ok', mark);
  b.c.send({ t: 'player:answer', index: 0, choice: 0 });
  await sleep(1000);
  const answeredIds = h.inbox
    .slice(answeredMark)
    .flatMap((m) => (m.t === 'answered' ? m.ids : []))
    .sort();
  assert.deepEqual(answeredIds, [a.ready.playerId, b.ready.playerId].sort(), 'hosts hear who answered without the full list');
  assert.ok(!h.inbox.slice(answeredMark).some((m) => m.t === 'lobby'), 'answers no longer resend the whole player list');
  const hostMark = h.mark();
  c.c.send({ t: 'player:answer', index: 0, choice: 1 });

  // Everyone answered, so the question closes early without waiting for the timer.
  const reveal = await h.next('reveal', hostMark, 3000);
  assert.deepEqual(reveal.correct, [1]);
  assert.deepEqual(reveal.counts, [1, 2, 0, 0]);
  assert.equal(reveal.answered, 3);

  const ra = await a.c.next('result');
  const rb = await b.c.next('result');
  const rc = await c.c.next('result');
  assert.equal(ra.isCorrect, true);
  assert.ok(ra.points >= 990 && ra.points <= 1000, `fast answer should score ~1000, got ${ra.points}`);
  assert.equal(rb.isCorrect, false);
  assert.equal(rb.points, 0);
  assert.equal(rc.isCorrect, true);
  assert.ok(rc.points < ra.points && rc.points >= 950, `slower answer scores less, got ${rc.points}`);
  assert.equal(ra.rank, 1);
  assert.equal(rc.rank, 2);
  assert.equal(rb.rank, 3);

  // Duplicate answers are ignored.
  mark = a.c.mark();
  a.c.send({ t: 'player:answer', index: 0, choice: 2 });
  await sleep(300);
  assert.equal(a.c.inbox.slice(mark).filter((m) => m.t === 'answer:ok').length, 0);

  // Leaderboard on demand.
  mark = a.c.mark();
  h.send({ t: 'host:leaderboard' });
  const lbA = await a.c.next('leaderboard', mark);
  assert.equal(lbA.top[0]!.nickname, 'Asha');
  assert.deepEqual(lbA.me, { rank: 1, score: ra.score });

  // Q2 (true/false): Asha right again -> streak bonus of +10%.
  mark = a.c.mark();
  h.send({ t: 'host:next' });
  const q2 = await a.c.next('question', mark);
  assert.equal(q2.question.type, 'tf');
  assert.deepEqual(q2.question.options, ['True', 'False']);
  a.c.send({ t: 'player:answer', index: 1, choice: 0 });
  b.c.send({ t: 'player:answer', index: 1, choice: 0 });
  c.c.send({ t: 'player:answer', index: 1, choice: 1 });
  const r2a = await a.c.next('result', mark);
  const r2b = await b.c.next('result', mark);
  assert.ok(r2a.points >= 1080 && r2a.points <= 1100, `streak bonus expected ~1100, got ${r2a.points}`);
  assert.ok(r2b.points >= 980 && r2b.points <= 1000, `no streak for Bilal, got ${r2b.points}`);

  // Q3: pause, extend, resume and reveal-now.
  mark = h.mark();
  h.send({ t: 'host:next' });
  await h.next('question', mark);
  mark = h.mark();
  h.send({ t: 'host:pause', paused: true });
  const paused = await h.next('timer', mark);
  assert.equal(paused.timer.paused, true);
  assert.equal(paused.timer.endsAt, null);
  mark = h.mark();
  h.send({ t: 'host:extend' });
  const extended = await h.next('timer', mark);
  assert.ok(extended.timer.remainingMs > paused.timer.remainingMs + 9_000);
  assert.equal(extended.timer.durationMs, 30_000);
  mark = h.mark();
  h.send({ t: 'host:pause', paused: false });
  const resumed = await h.next('timer', mark);
  assert.equal(resumed.timer.paused, false);
  assert.ok(resumed.timer.endsAt !== null);
  mark = a.c.mark();
  h.send({ t: 'host:reveal' });
  const r3a = await a.c.next('result', mark);
  assert.equal(r3a.answer, null, 'no answer recorded');
  assert.equal(r3a.points, 0);

  // End the game early.
  mark = a.c.mark();
  h.send({ t: 'host:end' });
  const fa = await a.c.next('final', mark);
  const fh = await h.next('final');
  assert.equal(fh.podium[0]!.nickname, 'Asha');
  assert.equal(fa.me!.rank, 1);
  assert.equal(fa.me!.correctCount, 2);
  assert.equal(fa.questionCount, 5);
  assert.equal(fa.total, 3);

  // Finished games reject new joiners.
  const late = new Client();
  await late.open();
  late.send({ t: 'pin:check', pin: ready.pin });
  const err = await late.next('error');
  assert.equal(err.code, 'game_over');

  for (const x of [h, a.c, b.c, c.c, late]) x.close();
});

test('reconnect mid-question keeps score and answered state; host resume restores phase', async () => {
  const { c: h, ready } = await host();
  const a = await player(ready.pin, 'Dev');
  const b = await player(ready.pin, 'Esha');
  let mark = a.c.mark();
  h.send({ t: 'host:start' });
  await a.c.next('question', mark);
  a.c.send({ t: 'player:answer', index: 0, choice: 1 });
  await a.c.next('answer:ok', mark);

  // Dev's phone drops and reconnects with the token.
  a.c.close();
  await sleep(200);
  const again = new Client();
  await again.open();
  again.send({ t: 'player:resume', pin: ready.pin, playerToken: a.ready.playerToken });
  const readyAgain = await again.next('player:ready');
  assert.equal(readyAgain.nickname, 'Dev');
  const q = await again.next('question');
  assert.deepEqual(q.myAnswer, { choices: [1] }, 'resumed player sees their locked-in answer');

  // Host tab reloads and resumes into the live question.
  const h2 = new Client();
  await h2.open();
  h2.send({ t: 'host:resume', gameId: ready.gameId, hostToken: ready.hostToken });
  await h2.next('host:ready');
  const hq = await h2.next('question');
  assert.equal(hq.question.index, 0);
  const progress = await h2.next('progress');
  assert.equal(progress.answered, 1);

  // A wrong host token is rejected.
  const intruder = new Client();
  await intruder.open();
  intruder.send({ t: 'host:resume', gameId: ready.gameId, hostToken: 'x'.repeat(36) });
  assert.equal((await intruder.next('error')).code, 'session_expired');

  // Players cannot drive the game.
  mark = b.c.mark();
  b.c.send({ t: 'host:next' });
  assert.equal((await b.c.next('error', mark)).code, 'not_authorized');

  // Kicking the last unanswered player closes the question.
  mark = h.mark();
  h.send({ t: 'host:kick', playerId: b.ready.playerId });
  const reveal = await h.next('reveal', mark, 3000);
  assert.equal(reveal.total, 1);

  for (const x of [h, h2, again, b.c, intruder]) x.close();
});

test('late joiner receives the live question; answers for the wrong question are ignored', async () => {
  const { c: h, ready } = await host();
  const a = await player(ready.pin, 'Farah');
  h.send({ t: 'host:start' });
  await a.c.next('question');

  const late = await player(ready.pin, 'Gopal');
  const lq = await late.c.next('question');
  assert.equal(lq.question.index, 0);
  assert.equal(lq.myAnswer, null);

  const mark = late.c.mark();
  late.c.send({ t: 'player:answer', index: 3, choice: 0 });
  await sleep(300);
  assert.equal(late.c.inbox.slice(mark).filter((m) => m.t === 'answer:ok').length, 0);

  for (const x of [h, a.c, late.c]) x.close();
});

test('projector screen is read-only; soundtrack, recent feed and panel scores behave', async () => {
  const { c: h, ready } = await host();
  const a = await player(ready.pin, 'Hari');
  const quiet = await player(ready.pin, 'Indu');

  const screen = new Client();
  await screen.open();
  screen.send({ t: 'screen:join', gameId: ready.gameId, screenKey: 'y'.repeat(36) });
  assert.equal((await screen.next('error')).code, 'session_expired', 'wrong screen key rejected');
  screen.close();

  const s = new Client();
  await s.open();
  s.send({ t: 'screen:join', gameId: ready.gameId, screenKey: ready.screenKey });
  const sready = await s.next('screen:ready');
  assert.equal(sready.pin, ready.pin);
  assert.ok(!('hostToken' in sready), 'screen never receives the host token');

  let mark = s.mark();
  s.send({ t: 'host:start' });
  assert.equal((await s.next('error', mark)).code, 'not_authorized', 'screen cannot control the game');

  // The host's screen key must not let a screen act as host.
  const hijack = new Client();
  await hijack.open();
  hijack.send({ t: 'host:resume', gameId: ready.gameId, hostToken: ready.screenKey });
  assert.equal((await hijack.next('error')).code, 'session_expired');

  mark = a.c.mark();
  h.send({ t: 'host:settings', settings: { soundtrack: 'orbit' } });
  assert.equal((await a.c.next('soundtrack', mark)).track, 'orbit');
  assert.equal((await s.next('settings', mark)).settings.soundtrack, 'orbit');

  mark = s.mark();
  h.send({ t: 'host:start' });
  await s.next('question', mark);
  const amark = a.c.mark();
  a.c.send({ t: 'player:answer', index: 0, choice: 1 });
  await a.c.next('answer:ok', amark);
  const progress = await s.next('progress', mark);
  assert.deepEqual(progress.recent.map((r) => r.nickname), ['Hari']);

  // While the question is open the host panel shows "answered" but not the new score.
  const hari = async (since: number) => {
    for (;;) {
      const msg = await h.next('lobby', since);
      since = h.inbox.indexOf(msg) + 1;
      const row = msg.players.find((p) => p.nickname === 'Hari');
      if (row && (row.answered || row.score > 0)) return { row, since };
    }
  };
  const open = await hari(0);
  assert.equal(open.row.answered, true);
  assert.equal(open.row.score, 0, 'score is hidden until the reveal');

  mark = s.mark();
  h.send({ t: 'host:reveal' });
  await s.next('reveal', mark);
  const revealed = await hari(open.since);
  assert.ok(revealed.row.score > 0, 'score shown after the reveal');
  assert.equal(revealed.row.answered, false);

  for (const x of [h, a.c, quiet.c, s, hijack]) x.close();
});

test('POST /games: secret required, quiz validated, game playable without leaking answers', async () => {
  const url = `http://127.0.0.1:${PORT}/games`;
  const quiz = {
    title: 'Saved quiz',
    questions: [
      { type: 'mc', text: 'Two plus two?', options: ['3', '4', '5'], correct: [1], timeLimitMs: 10_000, points: 500 },
      { type: 'tf', text: 'Ice is cold.', options: ['True', 'False'], correct: [0], timeLimitMs: 5_000, points: 1000 },
    ],
  };
  const post = (body: unknown, auth?: string) =>
    fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(auth ? { authorization: auth } : {}) },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });

  assert.equal((await post({ quiz })).status, 401, 'no secret');
  assert.equal((await post({ quiz }, 'Bearer wrong-secret')).status, 401, 'wrong secret');
  const auth = 'Bearer dev-only-realtime-secret';
  assert.equal((await post('{not json', auth)).status, 400);
  assert.equal((await post({ quiz: { ...quiz, questions: [] } }, auth)).status, 422, 'empty quiz');
  const badIndex = { ...quiz, questions: [{ ...quiz.questions[0], correct: [7] }] };
  assert.equal((await post({ quiz: badIndex }, auth)).status, 422, 'correct index outside options');
  const badTime = { ...quiz, questions: [{ ...quiz.questions[0], timeLimitMs: 12_345 }] };
  assert.equal((await post({ quiz: badTime }, auth)).status, 422, 'unsupported time limit');
  assert.equal((await post({ quiz, pad: 'x'.repeat(600 * 1024) }, auth).catch(() => ({ status: 413 }))).status, 413);

  const res = await post({ quiz }, auth);
  assert.equal(res.status, 201);
  const created = (await res.json()) as { gameId: string; pin: string; hostToken: string };
  assert.match(created.pin, /^\d{6}$/);

  const h = new Client();
  await h.open();
  h.send({ t: 'host:resume', gameId: created.gameId, hostToken: created.hostToken });
  const ready = await h.next('host:ready');
  assert.equal(ready.quizTitle, 'Saved quiz');
  assert.equal(ready.questionCount, 2);

  const p = await player(created.pin, 'Jaya');
  let mark = p.c.mark();
  h.send({ t: 'host:start' });
  const q = await p.c.next('question', mark);
  assert.deepEqual(q.question.options, ['3', '4', '5']);
  assert.equal(q.timer.durationMs, 10_000);
  assert.ok(!JSON.stringify(q).includes('"correct"'));
  mark = p.c.mark();
  p.c.send({ t: 'player:answer', index: 0, choice: 1 });
  const r = await p.c.next('result', mark);
  assert.equal(r.isCorrect, true);
  assert.ok(r.points > 450 && r.points <= 500, `custom points value used, got ${r.points}`);

  assert.equal((await post({ quiz, settings: { autoAdvance: 'yes' } }, auth)).status, 422, 'settings validated');
  const auto = (await (await post({ quiz, settings: { autoAdvance: true } }, auth)).json()) as typeof created;
  const h2 = new Client();
  await h2.open();
  h2.send({ t: 'host:resume', gameId: auto.gameId, hostToken: auto.hostToken });
  const autoSettings = await h2.next('settings');
  assert.equal(autoSettings.settings.autoAdvance, true, 'starting settings applied');

  for (const x of [h, h2, p.c]) x.close();
});

test('multi-select needs exactly the right set; typed answers match loosely; both are reported', async () => {
  const auth = 'Bearer dev-only-realtime-secret';
  const quiz = {
    title: 'New types',
    questions: [
      { type: 'multi', text: 'Mammals?', options: ['Dolphin', 'Shark', 'Bat'], correct: [0, 2], timeLimitMs: 10_000, points: 1000 },
      { type: 'text', text: 'Symbol for gold?', options: [], correct: [], accepted: ['Au', 'Aurum'], timeLimitMs: 10_000, points: 1000 },
      { type: 'text', text: 'Exact case?', options: [], correct: [], accepted: ['pH'], caseSensitive: true, timeLimitMs: 10_000, points: 1000 },
    ],
  };
  const post = (body: unknown) =>
    fetch(`http://127.0.0.1:${PORT}/games`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: auth }, body: JSON.stringify(body) });
  const noAccepted = { ...quiz, questions: [{ ...quiz.questions[1], accepted: [] }] };
  assert.equal((await post({ quiz: noAccepted })).status, 422, 'type answer needs an accepted answer');

  const created = (await (await post({ quiz })).json()) as { gameId: string; pin: string; hostToken: string };
  const h = new Client();
  await h.open();
  h.send({ t: 'host:resume', gameId: created.gameId, hostToken: created.hostToken });
  await h.next('host:ready');
  const a = await player(created.pin, 'Ira');
  const b = await player(created.pin, 'Jo');

  let markA = a.c.mark();
  let markB = b.c.mark();
  let markH = h.mark();
  h.send({ t: 'host:start' });
  const q1 = await a.c.next('question', markA);
  assert.equal(q1.question.type, 'multi');
  assert.ok(!JSON.stringify(q1).includes('"correct"'));
  a.c.send({ t: 'player:answer', index: 0, choice: 0 });
  assert.equal((await a.c.next('error', markA)).code, 'bad_request', 'multi-select needs a list of choices');
  a.c.send({ t: 'player:answer', index: 0, choices: [2, 0, 2] });
  assert.deepEqual((await a.c.next('answer:ok', markA)).answer, { choices: [0, 2] });
  b.c.send({ t: 'player:answer', index: 0, choices: [0] });
  const reveal1 = await h.next('reveal', markH);
  assert.deepEqual(reveal1.counts, [2, 0, 1]);
  assert.equal(reveal1.rightCount, 1);
  assert.equal((await a.c.next('result', markA)).isCorrect, true);
  const rb1 = await b.c.next('result', markB);
  assert.equal(rb1.isCorrect, false, 'a partly right selection scores nothing');
  assert.deepEqual(rb1.answer, { choices: [0] });

  markA = a.c.mark();
  markB = b.c.mark();
  markH = h.mark();
  h.send({ t: 'host:next' });
  const q2 = await a.c.next('question', markA);
  assert.deepEqual(q2.question.options, []);
  assert.ok(!JSON.stringify(q2).includes('Aurum'), 'accepted answers are not sent with the question');
  b.c.send({ t: 'player:answer', index: 1, text: '   ' });
  assert.equal((await b.c.next('error', markB)).code, 'bad_request', 'blank text rejected');
  a.c.send({ t: 'player:answer', index: 1, text: '  aURUM ' });
  b.c.send({ t: 'player:answer', index: 1, text: 'Ag' });
  const reveal2 = await h.next('reveal', markH);
  assert.deepEqual(reveal2.accepted, ['Au', 'Aurum']);
  assert.equal(reveal2.rightCount, 1);
  const ra2 = await a.c.next('result', markA);
  assert.equal(ra2.isCorrect, true);
  assert.deepEqual(ra2.answer, { choices: [], text: 'aURUM' });
  assert.deepEqual(ra2.accepted, ['Au', 'Aurum']);
  assert.equal((await b.c.next('result', markB)).isCorrect, false);

  markA = a.c.mark();
  h.send({ t: 'host:next' });
  await a.c.next('question', markA);
  a.c.send({ t: 'player:answer', index: 2, text: 'PH' });
  b.c.send({ t: 'player:answer', index: 2, text: 'pH' });
  assert.equal((await a.c.next('result', markA)).isCorrect, false, 'case matters when asked');

  h.send({ t: 'host:end' });
  const deadline = Date.now() + 3_000;
  while (!reports.some((r) => r.body.gameId === created.gameId) && Date.now() < deadline) await sleep(50);
  const report = reports.find((r) => r.body.gameId === created.gameId)!.body;
  assert.deepEqual(report.questions[1]!.accepted, ['Au', 'Aurum']);
  const ira = report.players.find((p) => p.nickname === 'Ira')!;
  assert.deepEqual(ira.answers.find((x) => x.q === 0), { q: 0, choices: [0, 2], isCorrect: true, points: ira.answers[0]!.points, timeMs: ira.answers[0]!.timeMs });
  assert.equal(ira.answers.find((x) => x.q === 1)?.text, 'aURUM');

  for (const x of [h, a.c, b.c]) x.close();
});

test('question extras: image and hint go out with the question, explanation only at reveal, penalties never go below zero', async () => {
  const url = `http://127.0.0.1:${PORT}/games`;
  const auth = 'Bearer dev-only-realtime-secret';
  const base = { type: 'mc', options: ['A1', 'A2', 'A3'], correct: [1], timeLimitMs: 10_000, points: 1000 };
  const quiz = {
    title: 'Extras',
    questions: [
      {
        ...base,
        text: 'First?',
        imageUrl: 'https://example.com/pic.png',
        hint: 'Think of the middle one',
        explanation: 'Because it is the second option.',
        penalty: 100,
      },
      { ...base, text: 'Second?', penalty: 500 },
    ],
  };
  const post = (body: unknown) =>
    fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: auth }, body: JSON.stringify(body) });

  const unsafe = { ...quiz, questions: [{ ...quiz.questions[0], imageUrl: 'javascript:alert(1)' }] };
  assert.equal((await post({ quiz: unsafe })).status, 422, 'non-http image links rejected');
  const badPenalty = { ...quiz, questions: [{ ...quiz.questions[0], penalty: 7 }] };
  assert.equal((await post({ quiz: badPenalty })).status, 422, 'unsupported penalty rejected');

  const created = (await (await post({ quiz })).json()) as { gameId: string; pin: string; hostToken: string };
  const h = new Client();
  await h.open();
  h.send({ t: 'host:resume', gameId: created.gameId, hostToken: created.hostToken });
  await h.next('host:ready');
  const a = await player(created.pin, 'Asha');
  const b = await player(created.pin, 'Bilal');

  let markA = a.c.mark();
  let markB = b.c.mark();
  let markH = h.mark();
  h.send({ t: 'host:start' });
  const q1 = await a.c.next('question', markA);
  assert.equal(q1.question.imageUrl, 'https://example.com/pic.png');
  assert.equal(q1.question.hint, 'Think of the middle one');
  assert.equal(q1.question.penalty, 100);
  assert.ok(!JSON.stringify(q1).includes('second option'), 'explanation not sent before the reveal');
  assert.ok(!JSON.stringify(q1).includes('"correct"'));

  a.c.send({ t: 'player:answer', index: 0, choice: 1 });
  b.c.send({ t: 'player:answer', index: 0, choice: 0 });
  const reveal = await h.next('reveal', markH);
  assert.equal(reveal.explanation, 'Because it is the second option.');
  const ra = await a.c.next('result', markA);
  const rb = await b.c.next('result', markB);
  assert.equal(ra.explanation, 'Because it is the second option.');
  assert.ok(ra.points > 900);
  assert.equal(rb.isCorrect, false);
  assert.equal(rb.points, 0, 'penalty floored at a score of zero');
  assert.equal(rb.score, 0);

  markA = a.c.mark();
  markB = b.c.mark();
  h.send({ t: 'host:next' });
  const q2 = await a.c.next('question', markA);
  assert.equal(q2.question.imageUrl, undefined);
  assert.equal(q2.question.hint, undefined);
  a.c.send({ t: 'player:answer', index: 1, choice: 2 });
  b.c.send({ t: 'player:answer', index: 1, choice: 1 });
  const ra2 = await a.c.next('result', markA);
  assert.equal(ra2.points, -500, 'wrong answer loses the penalty');
  assert.equal(ra2.score, ra.score - 500);
  assert.equal(ra2.explanation, undefined);

  for (const x of [h, a.c, b.c]) x.close();
});

test('quiz rules: accuracy scoring, no streak bonus, hidden answers and leaderboard, consistent option shuffle', async () => {
  const url = `http://127.0.0.1:${PORT}/games`;
  const auth = 'Bearer dev-only-realtime-secret';
  const mc = (text: string) => ({
    type: 'mc',
    text,
    options: ['Right', 'Wrong 1', 'Wrong 2', 'Wrong 3', 'Wrong 4', 'Wrong 5'],
    correct: [0],
    timeLimitMs: 10_000,
    points: 500,
    explanation: 'Secret reasoning',
  });
  const quiz = {
    title: 'Rules',
    questions: [mc('One?'), mc('Two?')],
    rules: {
      scoring: 'accuracy',
      streakBonus: false,
      showCorrect: false,
      showLeaderboard: false,
      gamification: false,
      shuffleOptions: true,
      graceMs: 250,
      welcomeMessage: 'Welcome, class!',
      completionMessage: 'Well done everyone',
      themeColour: '#0ea595',
    },
  };
  const post = (body: unknown) =>
    fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: auth }, body: JSON.stringify(body) });
  assert.equal((await post({ quiz: { ...quiz, rules: { ...quiz.rules, graceMs: 123 } } })).status, 422, 'grace period validated');
  assert.equal((await post({ quiz: { ...quiz, rules: { ...quiz.rules, themeColour: 'red;' } } })).status, 422, 'colour validated');

  const created = (await (await post({ quiz })).json()) as { gameId: string; pin: string; hostToken: string };
  const h = new Client();
  await h.open();
  h.send({ t: 'host:resume', gameId: created.gameId, hostToken: created.hostToken });
  const ready = await h.next('host:ready');
  assert.equal(ready.rules.welcomeMessage, 'Welcome, class!');
  assert.equal(ready.rules.themeColour, '#0ea595');
  assert.equal(ready.rules.showLeaderboard, false);
  assert.ok(!('graceMs' in ready.rules) && !('shuffleOptions' in ready.rules), 'only display rules are sent');
  assert.equal((await h.next('settings')).settings.leaderboardAfterEach, false, 'per-question leaderboard off');

  const p = await player(created.pin, 'Kiran');
  assert.equal(p.ready.rules.completionMessage, 'Well done everyone');

  let mark = p.c.mark();
  let markH = h.mark();
  h.send({ t: 'host:start' });
  const scores: number[] = [];
  for (let i = 0; i < 2; i++) {
    const q = await p.c.next('question', mark);
    assert.deepEqual([...q.question.options].sort(), [...quiz.questions[0]!.options].sort());
    const choice = q.question.options.indexOf('Right');
    mark = p.c.mark();
    markH = h.mark();
    p.c.send({ t: 'player:answer', index: i, choice });
    const r = await p.c.next('result', mark);
    assert.equal(r.isCorrect, true, 'correct answer follows the shuffle');
    assert.equal(r.points, 500, 'accuracy only, no streak bonus');
    assert.deepEqual(r.correct, [], 'correct answer hidden');
    assert.equal(r.explanation, undefined);
    const reveal = await h.next('reveal', markH);
    assert.deepEqual(reveal.correct, []);
    assert.equal(reveal.explanation, undefined);
    scores.push(r.score);
    h.send({ t: 'host:leaderboard' });
    await sleep(150);
    assert.ok(!h.inbox.slice(markH).some((m) => m.t === 'leaderboard'), 'no leaderboard phase');
    mark = p.c.mark();
    h.send({ t: 'host:next' });
  }
  assert.deepEqual(scores, [500, 1000]);
  const fin = await p.c.next('final', mark);
  assert.deepEqual(fin.podium, [], 'no podium when the leaderboard is off');
  assert.equal(fin.me?.score, 1000);

  for (const x of [h, p.c]) x.close();
});

test('saved-quiz games report results once when they end; the sample quiz never reports', async () => {
  const sample = await host();
  const sp = await player(sample.ready.pin, 'Sam');
  sample.c.send({ t: 'host:start' });
  await sp.c.next('question');
  sample.c.send({ t: 'host:end' });
  await sp.c.next('final');

  const quiz = {
    title: 'Reported',
    questions: [
      { type: 'mc', text: 'First?', options: ['A', 'B'], correct: [1], timeLimitMs: 10_000, points: 1000 },
      { type: 'mc', text: 'Second?', options: ['C', 'D'], correct: [0], timeLimitMs: 10_000, points: 1000 },
      { type: 'mc', text: 'Never asked?', options: ['E', 'F'], correct: [0], timeLimitMs: 10_000, points: 1000 },
    ],
  };
  const res = await fetch(`http://127.0.0.1:${PORT}/games`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer dev-only-realtime-secret' },
    body: JSON.stringify({ quiz }),
  });
  const created = (await res.json()) as { gameId: string; pin: string; hostToken: string };
  const h = new Client();
  await h.open();
  h.send({ t: 'host:resume', gameId: created.gameId, hostToken: created.hostToken });
  await h.next('host:ready');
  const a = await player(created.pin, 'Ana');
  const b = await player(created.pin, 'Bo');

  let mark = a.c.mark();
  h.send({ t: 'host:start' });
  await a.c.next('question', mark);
  a.c.send({ t: 'player:answer', index: 0, choice: 1 });
  b.c.send({ t: 'player:answer', index: 0, choice: 0 });
  await a.c.next('result', mark);
  mark = a.c.mark();
  h.send({ t: 'host:next' });
  await a.c.next('question', mark);
  a.c.send({ t: 'player:answer', index: 1, choice: 0 });
  mark = a.c.mark();
  h.send({ t: 'host:end' });
  await a.c.next('final', mark);
  h.send({ t: 'host:end' });

  const deadline = Date.now() + 3_000;
  while (!reports.some((r) => r.body.gameId === created.gameId) && Date.now() < deadline) await sleep(50);
  await sleep(300);
  const mine = reports.filter((r) => r.body.gameId === created.gameId);
  assert.equal(mine.length, 1, 'reported exactly once');
  assert.ok(!reports.some((r) => r.body.questions.some((q) => q.text.includes('Red Planet'))), 'sample quiz not reported');
  const report = mine[0]!;
  assert.equal(report.auth, 'Bearer dev-only-realtime-secret');
  assert.equal(report.body.status, 'ended');
  assert.equal(report.body.questionsAsked, 2, 'only questions actually asked count');
  assert.equal(report.body.questions.length, 3);
  const ana = report.body.players.find((p) => p.nickname === 'Ana')!;
  const bo = report.body.players.find((p) => p.nickname === 'Bo')!;
  assert.equal(ana.rank, 1);
  assert.equal(ana.correctCount, 2);
  assert.equal(ana.answers.length, 2);
  assert.ok(ana.answers.every((x) => x.timeMs >= 0 && x.timeMs <= 10_000));
  assert.equal(bo.answers.length, 1, 'unanswered questions are simply absent');
  assert.equal(bo.answers[0]?.isCorrect, false);

  for (const x of [sample.c, sp.c, h, a.c, b.c]) x.close();
});

test('numeric answers allow the margin; blanks give partial credit unless it is switched off', async () => {
  const quiz = {
    title: 'Numbers and blanks',
    rules: { scoring: 'accuracy', streakBonus: false },
    questions: [
      { type: 'numeric', text: 'Pi to two places?', options: [], correct: [], numericAnswer: 3.14, tolerance: 0.01, timeLimitMs: 10_000, points: 1000 },
      { type: 'blanks', text: 'The ___ sat on the ___ in the ___.', options: [], correct: [], blanks: [['cat'], ['mat', 'rug'], ['hall']], timeLimitMs: 10_000, points: 1000, penalty: 100 },
      { type: 'blanks', text: 'Red ___ and green ___', options: [], correct: [], blanks: [['apple'], ['pear']], partialCredit: false, timeLimitMs: 10_000, points: 1000, penalty: 100 },
    ],
  };
  const res = await fetch(`http://127.0.0.1:${PORT}/games`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer dev-only-realtime-secret' },
    body: JSON.stringify({ quiz }),
  });
  assert.equal(res.status, 201);
  const created = (await res.json()) as { gameId: string; pin: string; hostToken: string };
  const h = new Client();
  await h.open();
  h.send({ t: 'host:resume', gameId: created.gameId, hostToken: created.hostToken });
  await h.next('host:ready');
  const a = await player(created.pin, 'Ravi');
  const b = await player(created.pin, 'Sana');

  let markA = a.c.mark();
  let markB = b.c.mark();
  let markH = h.mark();
  h.send({ t: 'host:start' });
  const q1 = await a.c.next('question', markA);
  assert.ok(!JSON.stringify(q1).includes('3.14'), 'the number is not sent with the question');
  a.c.send({ t: 'player:answer', index: 0, text: '3.14' });
  assert.equal((await a.c.next('error', markA)).code, 'bad_request', 'numeric needs a number');
  a.c.send({ t: 'player:answer', index: 0, number: 3.149 });
  b.c.send({ t: 'player:answer', index: 0, number: 3.2 });
  const reveal1 = await h.next('reveal', markH);
  assert.deepEqual(reveal1.numeric, { answer: 3.14, tolerance: 0.01 });
  const ra1 = await a.c.next('result', markA);
  assert.equal(ra1.isCorrect, true, 'inside the margin');
  assert.deepEqual(ra1.answer, { choices: [], number: 3.149 });
  assert.equal((await b.c.next('result', markB)).isCorrect, false);

  markA = a.c.mark();
  markB = b.c.mark();
  markH = h.mark();
  h.send({ t: 'host:next' });
  await a.c.next('question', markA);
  a.c.send({ t: 'player:answer', index: 1, blanks: ['cat', 'mat'] });
  assert.equal((await a.c.next('error', markA)).code, 'bad_request', 'one entry per blank');
  a.c.send({ t: 'player:answer', index: 1, blanks: [' CAT ', 'Rug', 'kitchen'] });
  b.c.send({ t: 'player:answer', index: 1, blanks: ['dog', 'sofa', 'park'] });
  const ra2 = await a.c.next('result', markA);
  assert.equal(ra2.isCorrect, false);
  assert.equal(ra2.partsRight, 2);
  assert.equal(ra2.points, 667, 'two of three blanks earn two thirds of the points');
  assert.deepEqual(ra2.blankAnswers, [['cat'], ['mat', 'rug'], ['hall']]);
  const rb2 = await b.c.next('result', markB);
  assert.equal(rb2.partsRight, 0);
  assert.equal(rb2.points, 0, 'penalty floored at zero');
  assert.equal((await h.next('reveal', markH)).rightCount, 0);

  markA = a.c.mark();
  h.send({ t: 'host:next' });
  await a.c.next('question', markA);
  a.c.send({ t: 'player:answer', index: 2, blanks: ['apple', 'plum'] });
  b.c.send({ t: 'player:answer', index: 2, blanks: ['apple', 'pear'] });
  const ra3 = await a.c.next('result', markA);
  assert.equal(ra3.points, -100, 'without partial credit a partly right answer is wrong');

  h.send({ t: 'host:end' });
  const deadline = Date.now() + 3_000;
  while (!reports.some((r) => r.body.gameId === created.gameId) && Date.now() < deadline) await sleep(50);
  const report = reports.find((r) => r.body.gameId === created.gameId)!.body;
  assert.equal(report.questions[0]!.numericAnswer, 3.14);
  assert.deepEqual(report.questions[1]!.blanks, [['cat'], ['mat', 'rug'], ['hall']]);
  const ravi = report.players.find((p) => p.nickname === 'Ravi')!;
  assert.equal(ravi.answers.find((x) => x.q === 0)?.number, 3.149);
  assert.deepEqual(ravi.answers.find((x) => x.q === 1)?.blanks, ['CAT', 'Rug', 'kitchen']);

  for (const x of [h, a.c, b.c]) x.close();
});

test('put in order arrives shuffled and scores by position; ratings never change scores or streaks', async () => {
  const items = ['Mercury', 'Venus', 'Earth', 'Mars'];
  const quiz = {
    title: 'Order and rate',
    rules: { scoring: 'accuracy' },
    questions: [
      { type: 'order', text: 'From the Sun', options: items, correct: [0, 1, 2, 3], timeLimitMs: 10_000, points: 1000 },
      { type: 'rating', text: 'Enjoying it?', options: [], correct: [], ratingMin: 0, ratingMax: 10, timeLimitMs: 10_000, points: 0 },
      { type: 'mc', text: 'Streak check', options: ['A', 'B'], correct: [0], timeLimitMs: 10_000, points: 1000 },
    ],
  };
  const post = (body: unknown) =>
    fetch(`http://127.0.0.1:${PORT}/games`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer dev-only-realtime-secret' },
      body: JSON.stringify(body),
    });
  const badScale = { ...quiz, questions: [{ ...quiz.questions[1], ratingMax: 2 }] };
  assert.equal((await post({ quiz: badScale })).status, 422, 'rating scale validated');
  const created = (await (await post({ quiz })).json()) as { gameId: string; pin: string; hostToken: string };
  const h = new Client();
  await h.open();
  h.send({ t: 'host:resume', gameId: created.gameId, hostToken: created.hostToken });
  const ready = await h.next('host:ready');
  assert.equal(ready.questionCount, 3);
  const a = await player(created.pin, 'Tara');
  const b = await player(created.pin, 'Uday');

  let markA = a.c.mark();
  let markB = b.c.mark();
  let markH = h.mark();
  h.send({ t: 'host:start' });
  const q1 = await a.c.next('question', markA);
  assert.deepEqual([...q1.question.options].sort(), [...items].sort());
  assert.notDeepEqual(q1.question.options, items, 'never shown in the right order');
  const right = items.map((it) => q1.question.options.indexOf(it));
  a.c.send({ t: 'player:answer', index: 0, choices: [0, 0, 1, 2] });
  assert.equal((await a.c.next('error', markA)).code, 'bad_request', 'must be a full arrangement');
  a.c.send({ t: 'player:answer', index: 0, choices: right });
  // Uday swaps the last two.
  b.c.send({ t: 'player:answer', index: 0, choices: [right[0]!, right[1]!, right[3]!, right[2]!] });
  const reveal1 = await h.next('reveal', markH);
  assert.deepEqual(reveal1.correct, right, 'reveal gives the right sequence');
  const ra1 = await a.c.next('result', markA);
  assert.equal(ra1.isCorrect, true);
  assert.equal(ra1.points, 1000);
  const rb1 = await b.c.next('result', markB);
  assert.equal(rb1.isCorrect, false);
  assert.equal(rb1.partsRight, 2);
  assert.equal(rb1.points, 500, 'half the items in place earns half the points');

  markA = a.c.mark();
  markB = b.c.mark();
  markH = h.mark();
  h.send({ t: 'host:next' });
  const q2 = await a.c.next('question', markA);
  assert.deepEqual(q2.question.scale, { min: 0, max: 10 });
  a.c.send({ t: 'player:answer', index: 1, number: 11 });
  assert.equal((await a.c.next('error', markA)).code, 'bad_request', 'outside the scale');
  a.c.send({ t: 'player:answer', index: 1, number: 9 });
  b.c.send({ t: 'player:answer', index: 1, number: 9 });
  const reveal2 = await h.next('reveal', markH);
  assert.equal(reveal2.counts.length, 11);
  assert.equal(reveal2.counts[9], 2);
  const ra2 = await a.c.next('result', markA);
  assert.equal(ra2.points, 0);
  assert.equal(ra2.score, 1000, 'ratings leave scores alone');

  markA = a.c.mark();
  h.send({ t: 'host:next' });
  await a.c.next('question', markA);
  a.c.send({ t: 'player:answer', index: 2, choice: 0 });
  b.c.send({ t: 'player:answer', index: 2, choice: 0 });
  assert.equal((await a.c.next('result', markA)).points, 1100, 'the streak survived the rating question');

  markA = a.c.mark();
  h.send({ t: 'host:end' });
  const fin = await a.c.next('final', markA);
  assert.equal(fin.questionCount, 2, 'only scored questions count towards "correct"');
  assert.equal(fin.me?.correctCount, 2);

  const deadline = Date.now() + 3_000;
  while (!reports.some((r) => r.body.gameId === created.gameId) && Date.now() < deadline) await sleep(50);
  const report = reports.find((r) => r.body.gameId === created.gameId)!.body;
  assert.equal(report.questions[1]!.ratingMax, 10);
  const tara = report.players.find((p) => p.nickname === 'Tara')!;
  assert.deepEqual(tara.answers.find((x) => x.q === 0)?.choices, right);
  assert.equal(tara.answers.find((x) => x.q === 1)?.number, 9);

  for (const x of [h, a.c, b.c]) x.close();
});

test('polls count picks, take one or several options and never change scores', async () => {
  const quiz = {
    title: 'Polls',
    questions: [
      { type: 'poll', text: 'Favourite?', options: ['Red', 'Blue', 'Green'], correct: [], timeLimitMs: 10_000, points: 0 },
      { type: 'poll', text: 'Any you like?', options: ['Tea', 'Coffee'], correct: [], allowMultiple: true, timeLimitMs: 10_000, points: 0 },
    ],
  };
  const res = await fetch(`http://127.0.0.1:${PORT}/games`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer dev-only-realtime-secret' },
    body: JSON.stringify({ quiz }),
  });
  const created = (await res.json()) as { gameId: string; pin: string; hostToken: string };
  const h = new Client();
  await h.open();
  h.send({ t: 'host:resume', gameId: created.gameId, hostToken: created.hostToken });
  assert.equal((await h.next('host:ready')).questionCount, 2);
  const a = await player(created.pin, 'Vani');
  const b = await player(created.pin, 'Wasim');

  let markA = a.c.mark();
  let markB = b.c.mark();
  let markH = h.mark();
  h.send({ t: 'host:start' });
  const q1 = await a.c.next('question', markA);
  assert.equal(q1.question.multiple, undefined);
  a.c.send({ t: 'player:answer', index: 0, choices: [0, 1] });
  assert.equal((await a.c.next('error', markA)).code, 'bad_request', 'single-choice polls take one pick');
  a.c.send({ t: 'player:answer', index: 0, choice: 1 });
  b.c.send({ t: 'player:answer', index: 0, choice: 1 });
  const reveal1 = await h.next('reveal', markH);
  assert.deepEqual(reveal1.counts, [0, 2, 0]);
  assert.deepEqual(reveal1.correct, []);
  const ra1 = await a.c.next('result', markA);
  assert.deepEqual([ra1.isCorrect, ra1.points, ra1.score], [false, 0, 0]);
  await b.c.next('result', markB);

  markA = a.c.mark();
  markB = b.c.mark();
  markH = h.mark();
  h.send({ t: 'host:next' });
  const q2 = await a.c.next('question', markA);
  assert.equal(q2.question.multiple, true);
  a.c.send({ t: 'player:answer', index: 1, choices: [1, 0, 1] });
  b.c.send({ t: 'player:answer', index: 1, choices: [1] });
  const reveal2 = await h.next('reveal', markH);
  assert.deepEqual(reveal2.counts, [1, 2]);

  markA = a.c.mark();
  h.send({ t: 'host:end' });
  const fin = await a.c.next('final', markA);
  assert.equal(fin.questionCount, 0, 'polls never count towards "correct"');
  assert.deepEqual([fin.me?.score, fin.me?.correctCount], [0, 0]);

  const deadline = Date.now() + 3_000;
  while (!reports.some((r) => r.body.gameId === created.gameId) && Date.now() < deadline) await sleep(50);
  const report = reports.find((r) => r.body.gameId === created.gameId)!.body;
  const vani = report.players.find((p) => p.nickname === 'Vani')!;
  assert.deepEqual(vani.answers.find((x) => x.q === 0)?.choices, [1]);
  assert.deepEqual(vani.answers.find((x) => x.q === 1)?.choices, [0, 1], 'duplicates dropped and sorted');

  for (const x of [h, a.c, b.c]) x.close();
});

test('a host connection can open a fresh lobby and stops hearing the old game', async () => {
  const { c: h, ready: first } = await host();
  const a = await player(first.pin, 'Kiran');
  let mark = h.mark();
  h.send({ t: 'host:create' });
  const second = await h.next('host:ready', mark);
  assert.notEqual(second.gameId, first.gameId);
  assert.notEqual(second.pin, first.pin);

  mark = h.mark();
  const b = await player(first.pin, 'Lata');
  await sleep(500);
  const leaked = h.inbox.slice(mark).filter((m) => m.t === 'lobby' && m.players.some((p) => p.nickname === 'Lata'));
  assert.equal(leaked.length, 0, 'old game no longer reaches this host');

  mark = h.mark();
  h.send({ t: 'host:resume', gameId: first.gameId, hostToken: first.hostToken });
  const back = await h.next('host:ready', mark);
  assert.equal(back.gameId, first.gameId);

  for (const x of [h, a.c, b.c]) x.close();
});

// Keep last: it deliberately uses up 127.0.0.1's wrong-PIN allowance.
test('a whole class on one network can join; only wrong PINs are rate limited', async () => {
  const { c: h, ready } = await host();
  const players = await Promise.all(Array.from({ length: 40 }, (_, i) => player(ready.pin, `Student ${i + 1}`)));
  assert.equal(players.length, 40, 'forty joins from one address all succeed');

  const guesser = new Client();
  await guesser.open();
  const wrong = ready.pin === '999999' ? '999998' : '999999';
  for (let i = 0; i < 20; i++) {
    const mark = guesser.mark();
    guesser.send({ t: 'pin:check', pin: wrong });
    assert.equal((await guesser.next('error', mark)).code, 'game_not_found');
    await sleep(110);
  }
  const mark = guesser.mark();
  guesser.send({ t: 'pin:check', pin: ready.pin });
  assert.equal((await guesser.next('error', mark)).code, 'rate_limited', 'twenty wrong PINs in a minute block further guesses');

  for (const x of [h, guesser, ...players.map((p) => p.c)]) x.close();
});