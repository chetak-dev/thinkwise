import { createServer, type IncomingMessage } from 'node:http';
import { randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { WebSocketServer, WebSocket, type RawData } from 'ws';
import {
  ClientMessage,
  CLOSE_KICKED,
  CLOSE_REPLACED,
  PlayableQuiz,
  CLOUD_ANSWER_MAX,
  blanksRight,
  countWords,
  isAcceptedAnswer,
  isNumberMatch,
  isScored,
  normaliseAnswer,
  type AnswerKey,
  type CloudWord,
  type ErrorCode,
  type GameResults,
  type HostSettings,
  type LobbyPlayer,
  type PlayerAnswer,
  type PublicQuestion,
  type PublicRules,
  type RecentAnswer,
  type ServerMessage,
  type Standing,
  type TimerState,
} from '@thinkwise/shared';
import { SAMPLE_QUIZ, type Quiz } from './quiz.js';

const PORT = Number(process.env.PORT ?? 4000);
const IS_PROD = process.env.NODE_ENV === 'production';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
// Shared with the web app only; never sent to browsers.
const REALTIME_SECRET = process.env.REALTIME_SECRET ?? (IS_PROD ? '' : 'dev-only-realtime-secret');
const RESULTS_URL = process.env.RESULTS_URL ?? 'http://127.0.0.1:3000/api/internal/game-results';
const RESULTS_RETRY_MS = [0, 2_000, 10_000];
const MAX_QUIZ_BODY_BYTES = 512 * 1024;

const FLUSH_MS = 250;
const LARGE_GAME = 100;
const LARGE_LOBBY_FLUSH_MS = 1_000;
const HEARTBEAT_MS = 30_000;
const GAME_IDLE_TTL_MS = 2 * 60 * 60 * 1000;
const PIN_ATTEMPTS_PER_MINUTE = Number(process.env.PIN_ATTEMPTS_PER_MINUTE) || 20;
const EXTEND_MS = 10_000;
const REVEAL_TO_LEADERBOARD_MS = 4_000;
const AUTO_ADVANCE_MS = 5_000;
const LEADERBOARD_SIZE = 10;
const PODIUM_SIZE = 5;
const MAX_STREAK_STEPS = 5;
const RECENT_ANSWERS = 8;
const CLOUD_WORDS_SHOWN = 50;

type Phase = 'lobby' | 'question' | 'reveal' | 'leaderboard' | 'finished';

interface Answer {
  choices: number[];
  text?: string;
  number?: number;
  blanks?: string[];
  partsRight?: number;
  isCorrect: boolean;
  /** Share of the points earned before speed and streak: 1 when right, a fraction for partly right blanks. */
  credit: number;
  points: number;
  timeMs: number;
}

interface Player {
  id: string;
  token: string;
  nickname: string;
  avatar: string;
  socket: WebSocket | null;
  joinedAt: number;
  score: number;
  /** Score as of the last reveal; what the host panel shows. */
  shownScore: number;
  streak: number;
  correctCount: number;
  answers: Map<number, Answer>;
}

interface Game {
  id: string;
  pin: string;
  hostToken: string;
  screenKey: string;
  hosts: Set<WebSocket>;
  screens: Set<WebSocket>;
  players: Map<string, Player>;
  playersByToken: Map<string, Player>;
  locked: boolean;
  lobbyDirty: boolean;
  lastLobbyFlush: number;
  /** Players who answered since the last flush; hosts get these ids instead of the whole player list. */
  newlyAnswered: string[];
  lastActivity: number;
  quiz: Quiz;
  settings: HostSettings;
  phase: Phase;
  qIndex: number;
  durationMs: number;
  endsAt: number | null;
  pausedRemainingMs: number | null;
  counts: number[];
  /** Word cloud responses grouped ignoring case and spacing. */
  words: Map<string, CloudWord>;
  answered: number;
  recent: RecentAnswer[];
  progressDirty: boolean;
  standings: Standing[];
  ranks: Map<string, number>;
  closeTimer: ReturnType<typeof setTimeout> | null;
  phaseTimer: ReturnType<typeof setTimeout> | null;
  /** Saved-quiz games report their results to the web app; the sample quiz does not. */
  report: boolean;
  reported: boolean;
  startedAt: number | null;
}

type Role =
  | { kind: 'none' }
  | { kind: 'host'; game: Game }
  | { kind: 'screen'; game: Game }
  | { kind: 'player'; game: Game; player: Player };

interface Connection {
  role: Role;
  ip: string;
  alive: boolean;
  tokens: number;
  lastRefill: number;
}

const games = new Map<string, Game>();
const gamesByPin = new Map<string, Game>();
const connections = new Map<WebSocket, Connection>();
const pinAttempts = new Map<string, { count: number; windowStart: number }>();

// ---------- transport helpers ----------

function send(ws: WebSocket | null, msg: ServerMessage) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function sendRaw(ws: WebSocket | null, raw: string) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(raw);
}

// Hosts and projector screens see the same stage; only hosts may send commands.
function toHosts(game: Game, msg: ServerMessage) {
  toHostsRaw(game, JSON.stringify(msg));
}

function toHostsRaw(game: Game, raw: string) {
  for (const host of game.hosts) sendRaw(host, raw);
  for (const screen of game.screens) sendRaw(screen, raw);
}

function toPlayers(game: Game, msg: ServerMessage) {
  const raw = JSON.stringify(msg);
  for (const p of game.players.values()) sendRaw(p.socket, raw);
}

function fail(ws: WebSocket, code: ErrorCode, message: string) {
  send(ws, { t: 'error', code, message });
}

function sameSecret(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function newPin() {
  let pin: string;
  do pin = String(randomInt(100_000, 1_000_000));
  while (gamesByPin.has(pin));
  return pin;
}

function shuffled<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** One shuffle per game, so the host screen, projector and every phone agree on the order. */
function arrangeQuiz(quiz: Quiz): Quiz {
  const questions = quiz.rules.shuffleQuestions ? shuffled(quiz.questions) : quiz.questions;
  const reorder = (q: Quiz['questions'][number], order: number[]) => ({
    ...q,
    options: order.map((i) => q.options[i]!),
    correct: q.correct.map((c) => order.indexOf(c)),
  });
  return {
    ...quiz,
    questions: questions.map((q) => {
      if (q.type === 'order') {
        // Items always arrive mixed up, and never already in the right order.
        let order = shuffled(q.options.map((_, i) => i));
        for (let tries = 0; tries < 10 && order.every((v, i) => v === i); tries++) order = shuffled(order);
        return reorder(q, order);
      }
      if (!quiz.rules.shuffleOptions || q.type === 'tf' || q.options.length === 0) return q;
      return reorder(q, shuffled(q.options.map((_, i) => i)));
    }),
  };
}

function publicRules(game: Game): PublicRules {
  const r = game.quiz.rules;
  return {
    showLeaderboard: r.showLeaderboard,
    showCorrect: r.showCorrect,
    gamification: r.gamification,
    orgName: r.orgName,
    themeColour: r.themeColour,
    welcomeMessage: r.welcomeMessage,
    completionMessage: r.completionMessage,
  };
}

// ---------- game state views ----------

function lobbyPlayers(game: Game): LobbyPlayer[] {
  const open = game.phase === 'question';
  return [...game.players.values()].map((p) => ({
    id: p.id,
    nickname: p.nickname,
    avatar: p.avatar,
    connected: p.socket !== null,
    answered: open && p.answers.has(game.qIndex),
    score: p.shownScore,
  }));
}

function cloudWords(game: Game): { words?: CloudWord[] } {
  if (game.quiz.questions[game.qIndex]?.type !== 'cloud') return {};
  const words = [...game.words.values()].sort((a, b) => b.count - a.count).slice(0, CLOUD_WORDS_SHOWN);
  return { words };
}

function progressMsg(game: Game): ServerMessage {
  return {
    t: 'progress',
    answered: game.answered,
    total: game.players.size,
    counts: game.counts,
    recent: game.recent,
    ...cloudWords(game),
  };
}

function publicQuestion(game: Game): PublicQuestion {
  const q = game.quiz.questions[game.qIndex]!;
  return {
    index: game.qIndex,
    total: game.quiz.questions.length,
    type: q.type,
    text: q.text,
    options: q.options,
    ...(q.imageUrl ? { imageUrl: q.imageUrl } : {}),
    ...(q.hint ? { hint: q.hint } : {}),
    ...(q.penalty ? { penalty: q.penalty } : {}),
    ...(q.type === 'rating' ? { scale: { min: q.ratingMin, max: q.ratingMax } } : {}),
    ...(q.type === 'poll' && q.allowMultiple ? { multiple: true } : {}),
    ...(q.type === 'cloud' ? { maxWords: q.maxWords } : {}),
  };
}

function remainingMs(game: Game) {
  if (game.pausedRemainingMs !== null) return game.pausedRemainingMs;
  return game.endsAt === null ? 0 : Math.max(0, game.endsAt - Date.now());
}

function timerState(game: Game): TimerState {
  return {
    endsAt: game.pausedRemainingMs !== null ? null : game.endsAt,
    durationMs: game.durationMs,
    remainingMs: remainingMs(game),
    paused: game.pausedRemainingMs !== null,
    serverNow: Date.now(),
  };
}

function computeStandings(game: Game) {
  for (const p of game.players.values()) p.shownScore = p.score;
  game.lobbyDirty = true;
  const sorted = [...game.players.values()].sort((a, b) => b.score - a.score || a.joinedAt - b.joinedAt);
  game.standings = sorted.map((p, i) => ({
    id: p.id,
    nickname: p.nickname,
    avatar: p.avatar,
    score: p.score,
    rank: i + 1,
  }));
  game.ranks = new Map(game.standings.map((s) => [s.id, s.rank]));
}

function rankOf(game: Game, player: Player) {
  return game.ranks.get(player.id) ?? game.standings.length;
}

/** What counted as right for typed, numeric and blank questions; emptied when the quiz hides answers. */
function answerKey(q: Quiz['questions'][number], show: boolean): AnswerKey {
  if (q.type === 'text') return { accepted: show ? q.accepted : [] };
  if (q.type === 'numeric' && show && q.numericAnswer !== null) {
    return { numeric: { answer: q.numericAnswer, tolerance: q.tolerance } };
  }
  if (q.type === 'blanks') return { blankAnswers: show ? q.blanks : [] };
  return {};
}

function revealMsg(game: Game): ServerMessage {
  const q = game.quiz.questions[game.qIndex]!;
  const show = game.quiz.rules.showCorrect;
  let rightCount = 0;
  for (const p of game.players.values()) if (p.answers.get(game.qIndex)?.isCorrect) rightCount += 1;
  return {
    t: 'reveal',
    index: game.qIndex,
    correct: show ? q.correct : [],
    ...answerKey(q, show),
    counts: game.counts,
    ...cloudWords(game),
    answered: game.answered,
    rightCount,
    total: game.players.size,
    ...(show && q.explanation ? { explanation: q.explanation } : {}),
  };
}

function publicAnswer(answer: Answer): PlayerAnswer {
  if (answer.text !== undefined) return { choices: [], text: answer.text };
  if (answer.number !== undefined) return { choices: [], number: answer.number };
  if (answer.blanks !== undefined) return { choices: [], blanks: answer.blanks };
  return { choices: answer.choices };
}

function resultMsg(game: Game, player: Player, ranks: Map<string, number>): ServerMessage {
  const q = game.quiz.questions[game.qIndex]!;
  const show = game.quiz.rules.showCorrect;
  const answer = player.answers.get(game.qIndex);
  return {
    t: 'result',
    index: game.qIndex,
    correct: show ? q.correct : [],
    ...answerKey(q, show),
    answer: answer ? publicAnswer(answer) : null,
    ...(answer?.partsRight !== undefined ? { partsRight: answer.partsRight } : {}),
    isCorrect: answer?.isCorrect ?? false,
    points: answer?.points ?? 0,
    score: player.score,
    rank: ranks.get(player.id) ?? game.standings.length,
    total: game.players.size,
    ...(show && q.explanation ? { explanation: q.explanation } : {}),
  };
}

function leaderboardMsg(game: Game, player?: Player): ServerMessage {
  const top = game.standings.slice(0, LEADERBOARD_SIZE);
  return player
    ? { t: 'leaderboard', top, me: { rank: rankOf(game, player), score: player.score } }
    : { t: 'leaderboard', top };
}

function finalMsg(game: Game, player?: Player): ServerMessage {
  const base = {
    t: 'final' as const,
    podium: game.quiz.rules.showLeaderboard ? game.standings.slice(0, PODIUM_SIZE) : [],
    total: game.players.size,
    questionCount: game.quiz.questions.filter((q) => isScored(q.type)).length,
  };
  return player
    ? { ...base, me: { rank: rankOf(game, player), score: player.score, correctCount: player.correctCount } }
    : base;
}

// ---------- game flow ----------

function clearTimers(game: Game) {
  if (game.closeTimer) clearTimeout(game.closeTimer);
  if (game.phaseTimer) clearTimeout(game.phaseTimer);
  game.closeTimer = null;
  game.phaseTimer = null;
}

function scheduleClose(game: Game) {
  if (game.closeTimer) clearTimeout(game.closeTimer);
  game.closeTimer = null;
  if (game.pausedRemainingMs !== null) return;
  game.closeTimer = setTimeout(() => closeQuestion(game), remainingMs(game) + game.quiz.rules.graceMs);
}

function startQuestion(game: Game, index: number) {
  clearTimers(game);
  const q = game.quiz.questions[index]!;
  game.phase = 'question';
  game.qIndex = index;
  game.durationMs = q.timeLimitMs;
  game.endsAt = Date.now() + q.timeLimitMs;
  game.pausedRemainingMs = null;
  game.counts = q.type === 'rating' ? Array.from({ length: q.ratingMax - q.ratingMin + 1 }, () => 0) : q.options.map(() => 0);
  game.words = new Map();
  game.answered = 0;
  game.recent = [];
  game.progressDirty = true;
  game.lobbyDirty = true;
  scheduleClose(game);
  const msg: ServerMessage = { t: 'question', question: publicQuestion(game), timer: timerState(game) };
  toHosts(game, msg);
  toPlayers(game, msg);
}

function setPaused(game: Game, paused: boolean) {
  if (game.phase !== 'question') return;
  const isPaused = game.pausedRemainingMs !== null;
  if (paused && !isPaused) {
    game.pausedRemainingMs = remainingMs(game);
    game.endsAt = null;
  } else if (!paused && isPaused) {
    game.endsAt = Date.now() + game.pausedRemainingMs!;
    game.pausedRemainingMs = null;
  } else {
    return;
  }
  scheduleClose(game);
  broadcastTimer(game);
}

function extendTime(game: Game) {
  if (game.phase !== 'question') return;
  game.durationMs += EXTEND_MS;
  if (game.pausedRemainingMs !== null) game.pausedRemainingMs += EXTEND_MS;
  else if (game.endsAt !== null) game.endsAt += EXTEND_MS;
  scheduleClose(game);
  broadcastTimer(game);
}

function broadcastTimer(game: Game) {
  const msg: ServerMessage = { t: 'timer', timer: timerState(game) };
  toHosts(game, msg);
  toPlayers(game, msg);
}

type AnswerInput = Pick<Extract<ClientMessage, { t: 'player:answer' }>, 'choice' | 'choices' | 'text' | 'number' | 'blanks'>;
type ReadAnswer = Omit<Answer, 'points' | 'timeMs' | 'credit'> & { credit?: number };

/** Checks the answer has the shape the question type needs; null if it doesn't. */
function readAnswer(q: Quiz['questions'][number], input: AnswerInput): ReadAnswer | null {
  if (q.type === 'text') {
    if (input.text === undefined || !input.text.trim()) return null;
    const text = input.text.trim();
    return { choices: [], text, isCorrect: isAcceptedAnswer(text, q.accepted, q.caseSensitive) };
  }
  if (q.type === 'cloud') {
    const text = (input.text ?? '').trim().replace(/\s+/g, ' ');
    if (!text || text.length > CLOUD_ANSWER_MAX || countWords(text) > q.maxWords) return null;
    return { choices: [], text, isCorrect: false, credit: 0 };
  }
  if (q.type === 'numeric') {
    if (input.number === undefined || q.numericAnswer === null) return null;
    return { choices: [], number: input.number, isCorrect: isNumberMatch(input.number, q.numericAnswer, q.tolerance) };
  }
  if (q.type === 'blanks') {
    if (input.blanks === undefined || input.blanks.length !== q.blanks.length || !input.blanks.some((b) => b.trim())) return null;
    const blanks = input.blanks.map((b) => b.trim());
    const right = blanksRight(blanks, q.blanks, q.caseSensitive);
    const isCorrect = right === q.blanks.length;
    return { choices: [], blanks, partsRight: right, isCorrect, credit: isCorrect ? 1 : q.partialCredit ? right / q.blanks.length : 0 };
  }
  if (q.type === 'order') {
    const choices = input.choices ?? [];
    const n = q.options.length;
    if (choices.length !== n || new Set(choices).size !== n || choices.some((c) => c >= n)) return null;
    const right = choices.filter((c, i) => c === q.correct[i]).length;
    const isCorrect = right === n;
    return { choices, partsRight: right, isCorrect, credit: isCorrect ? 1 : q.partialCredit ? right / n : 0 };
  }
  if (q.type === 'rating') {
    const value = input.number;
    if (value === undefined || !Number.isInteger(value) || value < q.ratingMin || value > q.ratingMax) return null;
    return { choices: [], number: value, isCorrect: false, credit: 0 };
  }
  if (q.type === 'multi' || (q.type === 'poll' && q.allowMultiple)) {
    const choices = [...new Set(input.choices ?? [])].sort((a, b) => a - b);
    if (choices.length === 0 || choices.some((c) => c >= q.options.length)) return null;
    if (q.type === 'poll') return { choices, isCorrect: false, credit: 0 };
    const isCorrect = choices.length === q.correct.length && choices.every((c) => q.correct.includes(c));
    return { choices, isCorrect };
  }
  if (input.choice === undefined || input.choice >= q.options.length) return null;
  if (q.type === 'poll') return { choices: [input.choice], isCorrect: false, credit: 0 };
  return { choices: [input.choice], isCorrect: q.correct.includes(input.choice) };
}

function submitAnswer(ws: WebSocket, game: Game, player: Player, index: number, input: AnswerInput) {
  if (game.phase !== 'question' || index !== game.qIndex || player.answers.has(index)) return;
  const q = game.quiz.questions[index]!;
  const read = readAnswer(q, input);
  if (!read) return fail(ws, 'bad_request', 'Invalid answer.');
  if (game.endsAt !== null && Date.now() > game.endsAt + game.quiz.rules.graceMs) return;

  const elapsed = Math.min(game.durationMs, Math.max(0, game.durationMs - remainingMs(game)));
  const { isCorrect } = read;
  const credit = read.credit ?? (isCorrect ? 1 : 0);
  const rules = game.quiz.rules;
  let points = 0;
  if (credit > 0) {
    // Speed scoring: 50-100% of the points by speed. Streak bonus: +10% per prior consecutive correct answer.
    const speedFactor = rules.scoring === 'speed' ? 1 - 0.5 * (elapsed / game.durationMs) : 1;
    const streakFactor = rules.streakBonus && isCorrect ? 1 + Math.min(player.streak, MAX_STREAK_STEPS) * 0.1 : 1;
    points = Math.round(q.points * credit * speedFactor * streakFactor);
  }
  if (!isScored(q.type)) {
    // Opinions never touch scores or streaks.
  } else if (isCorrect) {
    player.streak += 1;
    player.correctCount += 1;
  } else {
    player.streak = 0;
    // Negative marking never takes a score below zero, and partly right answers aren't penalised.
    if (credit === 0) points = -Math.min(q.penalty, player.score);
  }
  player.score += points;
  const answer: Answer = { ...read, credit, points, timeMs: Math.round(elapsed) };
  player.answers.set(index, answer);
  if (q.type === 'rating') {
    const slot = read.number! - q.ratingMin;
    game.counts[slot] = (game.counts[slot] ?? 0) + 1;
  } else if (q.type === 'cloud') {
    const key = normaliseAnswer(read.text!);
    const entry = game.words.get(key);
    if (entry) entry.count += 1;
    else game.words.set(key, { text: read.text!, count: 1 });
  } else if (q.type !== 'order') {
    for (const c of read.choices) game.counts[c] = (game.counts[c] ?? 0) + 1;
  }
  game.answered += 1;
  game.recent = [{ id: player.id, nickname: player.nickname, avatar: player.avatar }, ...game.recent].slice(
    0,
    RECENT_ANSWERS,
  );
  game.progressDirty = true;
  game.newlyAnswered.push(player.id);
  send(ws, { t: 'answer:ok', index, answer: publicAnswer(answer) });
  closeIfEveryoneAnswered(game);
}

function closeIfEveryoneAnswered(game: Game) {
  if (game.phase !== 'question') return;
  let online = 0;
  for (const p of game.players.values()) {
    if (!p.socket) continue;
    online += 1;
    if (!p.answers.has(game.qIndex)) return;
  }
  if (online > 0) closeQuestion(game);
}

function closeQuestion(game: Game) {
  if (game.phase !== 'question') return;
  clearTimers(game);
  if (game.progressDirty && game.settings.liveCounts) toHosts(game, progressMsg(game));
  game.progressDirty = false;
  game.phase = 'reveal';
  game.endsAt = null;
  game.pausedRemainingMs = null;
  for (const p of game.players.values()) {
    if (!p.answers.has(game.qIndex)) p.streak = 0;
  }
  computeStandings(game);
  toHosts(game, revealMsg(game));
  for (const p of game.players.values()) send(p.socket, resultMsg(game, p, game.ranks));

  if (game.settings.leaderboardAfterEach && game.quiz.rules.showLeaderboard) {
    game.phaseTimer = setTimeout(() => showLeaderboard(game), REVEAL_TO_LEADERBOARD_MS);
  } else if (game.settings.autoAdvance) {
    game.phaseTimer = setTimeout(() => advance(game), AUTO_ADVANCE_MS);
  }
}

/** Sends hosts the shared message and each player the same message plus their own `me`, serialising the shared part once. */
function broadcastWithMe(game: Game, shared: ServerMessage, me: (p: Player) => object) {
  const raw = JSON.stringify(shared);
  toHostsRaw(game, raw);
  const head = raw.slice(0, -1);
  for (const p of game.players.values()) sendRaw(p.socket, `${head},"me":${JSON.stringify(me(p))}}`);
}

function showLeaderboard(game: Game) {
  if (game.phase !== 'reveal' || !game.quiz.rules.showLeaderboard) return;
  clearTimers(game);
  game.phase = 'leaderboard';
  broadcastWithMe(game, leaderboardMsg(game), (p) => ({ rank: rankOf(game, p), score: p.score }));
  if (game.settings.autoAdvance) {
    game.phaseTimer = setTimeout(() => advance(game), AUTO_ADVANCE_MS);
  }
}

function advance(game: Game) {
  if (game.phase !== 'reveal' && game.phase !== 'leaderboard') return;
  if (game.qIndex + 1 < game.quiz.questions.length) startQuestion(game, game.qIndex + 1);
  else finish(game);
}

function finish(game: Game) {
  if (game.phase === 'finished') return;
  clearTimers(game);
  game.phase = 'finished';
  game.endsAt = null;
  game.pausedRemainingMs = null;
  computeStandings(game);
  broadcastWithMe(game, finalMsg(game), (p) => ({ rank: rankOf(game, p), score: p.score, correctCount: p.correctCount }));
  reportResults(game);
}

function resultsPayload(game: Game): GameResults {
  const ranks = new Map(game.standings.map((s) => [s.id, s.rank]));
  return {
    gameId: game.id,
    status: game.startedAt === null ? 'abandoned' : 'ended',
    startedAt: game.startedAt,
    endedAt: Date.now(),
    questionsAsked: game.startedAt === null ? 0 : Math.max(0, game.qIndex + 1),
    questions: game.quiz.questions.map((q) => ({
      type: q.type,
      text: q.text,
      options: q.options,
      correct: q.correct,
      ...(q.type === 'text' ? { accepted: q.accepted } : {}),
      ...(q.type === 'numeric' && q.numericAnswer !== null ? { numericAnswer: q.numericAnswer, tolerance: q.tolerance } : {}),
      ...(q.type === 'blanks' ? { blanks: q.blanks } : {}),
      ...(q.type === 'rating' ? { ratingMin: q.ratingMin, ratingMax: q.ratingMax } : {}),
      points: q.points,
    })),
    players: [...game.players.values()].map((p) => ({
      nickname: p.nickname,
      avatar: p.avatar,
      score: p.score,
      rank: ranks.get(p.id) ?? game.players.size,
      correctCount: p.correctCount,
      answers: [...p.answers].map(([q, a]) => {
        const { choices, ...rest } = publicAnswer(a);
        const type = game.quiz.questions[q]?.type;
        const given =
          type === 'mc' || type === 'tf' ? { choice: choices[0] } : type === 'multi' || type === 'order' || type === 'poll' ? { choices } : rest;
        return { q, ...given, isCorrect: a.isCorrect, points: a.points, timeMs: a.timeMs };
      }),
    })),
  };
}

/** Hands results to the web app (fire and forget, a few retries). Only ever once per game. */
function reportResults(game: Game) {
  if (!game.report || game.reported || !REALTIME_SECRET) return;
  game.reported = true;
  const body = JSON.stringify(resultsPayload(game));
  const attempt = (i: number): void => {
    if (i >= RESULTS_RETRY_MS.length) {
      console.error(`Could not deliver results for game ${game.id}`);
      return;
    }
    setTimeout(() => {
      fetch(RESULTS_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${REALTIME_SECRET}` },
        body,
        signal: AbortSignal.timeout(8_000),
      })
        .then((res) => {
          if (res.status >= 500) attempt(i + 1);
        })
        .catch(() => attempt(i + 1));
    }, RESULTS_RETRY_MS[i]);
  };
  attempt(0);
}

function syncHost(ws: WebSocket, game: Game, asScreen = false) {
  if (asScreen) {
    send(ws, {
      t: 'screen:ready',
      pin: game.pin,
      quizTitle: game.quiz.title,
      questionCount: game.quiz.questions.length,
      rules: publicRules(game),
    });
  } else {
    send(ws, {
      t: 'host:ready',
      gameId: game.id,
      pin: game.pin,
      hostToken: game.hostToken,
      screenKey: game.screenKey,
      quizTitle: game.quiz.title,
      questionCount: game.quiz.questions.length,
      rules: publicRules(game),
    });
  }
  send(ws, { t: 'settings', settings: game.settings });
  send(ws, { t: 'lobby', locked: game.locked, players: lobbyPlayers(game) });
  switch (game.phase) {
    case 'question':
      send(ws, { t: 'question', question: publicQuestion(game), timer: timerState(game) });
      if (game.settings.liveCounts) send(ws, progressMsg(game));
      break;
    case 'reveal':
      send(ws, { t: 'question', question: publicQuestion(game), timer: timerState(game) });
      send(ws, revealMsg(game));
      break;
    case 'leaderboard':
      send(ws, leaderboardMsg(game));
      break;
    case 'finished':
      send(ws, finalMsg(game));
      break;
  }
}

function syncPlayer(game: Game, player: Player) {
  const ws = player.socket;
  send(ws, {
    t: 'player:ready',
    pin: game.pin,
    playerId: player.id,
    playerToken: player.token,
    nickname: player.nickname,
    avatar: player.avatar,
    score: player.score,
    rules: publicRules(game),
  });
  send(ws, { t: 'soundtrack', track: game.settings.soundtrack });
  switch (game.phase) {
    case 'lobby':
      send(ws, { t: 'lobby:count', count: game.players.size });
      break;
    case 'question': {
      const mine = player.answers.get(game.qIndex);
      send(ws, {
        t: 'question',
        question: publicQuestion(game),
        timer: timerState(game),
        myAnswer: mine ? publicAnswer(mine) : null,
      });
      break;
    }
    case 'reveal': {
      send(ws, { t: 'question', question: publicQuestion(game), timer: timerState(game), myAnswer: null });
      const ranks = new Map(game.standings.map((s) => [s.id, s.rank]));
      send(ws, resultMsg(game, player, ranks));
      break;
    }
    case 'leaderboard':
      send(ws, leaderboardMsg(game, player));
      break;
    case 'finished':
      send(ws, finalMsg(game, player));
      break;
  }
}

// Lobby and live-count updates are batched so a burst of N events costs O(N) sends rather than O(N²).
function flush() {
  const now = Date.now();
  for (const game of games.values()) {
    // The full player list is O(players) per send, so big games refresh it at most once a second.
    const lobbyEvery = game.players.size > LARGE_GAME ? LARGE_LOBBY_FLUSH_MS : 0;
    if (game.lobbyDirty && now - game.lastLobbyFlush >= lobbyEvery) {
      game.lobbyDirty = false;
      game.lastLobbyFlush = now;
      game.newlyAnswered = [];
      toHosts(game, { t: 'lobby', locked: game.locked, players: lobbyPlayers(game) });
      if (game.phase === 'lobby') toPlayers(game, { t: 'lobby:count', count: game.players.size });
    }
    if (game.newlyAnswered.length) {
      toHosts(game, { t: 'answered', ids: game.newlyAnswered });
      game.newlyAnswered = [];
    }
    if (game.progressDirty && game.phase === 'question') {
      game.progressDirty = false;
      if (game.settings.liveCounts) toHosts(game, progressMsg(game));
    }
  }
}

// ---------- message handling ----------

/** Only wrong PINs count: a whole class joining from one school network must never be throttled. */
function tooManyWrongPins(ip: string) {
  const entry = pinAttempts.get(ip);
  if (!entry || Date.now() - entry.windowStart > 60_000) return false;
  return entry.count >= PIN_ATTEMPTS_PER_MINUTE;
}

function recordWrongPin(ip: string) {
  const now = Date.now();
  const entry = pinAttempts.get(ip);
  if (!entry || now - entry.windowStart > 60_000) pinAttempts.set(ip, { count: 1, windowStart: now });
  else entry.count += 1;
}

function allowMessage(conn: Connection) {
  const now = Date.now();
  conn.tokens = Math.min(20, conn.tokens + ((now - conn.lastRefill) / 1000) * 10);
  conn.lastRefill = now;
  if (conn.tokens < 1) return false;
  conn.tokens -= 1;
  return true;
}

function findJoinableGame(ws: WebSocket, pin: string, conn: Connection): Game | null {
  if (tooManyWrongPins(conn.ip)) {
    fail(ws, 'rate_limited', 'Too many attempts. Please wait a minute.');
    return null;
  }
  const game = gamesByPin.get(pin);
  if (!game) {
    recordWrongPin(conn.ip);
    fail(ws, 'game_not_found', 'No game found with that PIN.');
    return null;
  }
  if (game.phase === 'finished') {
    fail(ws, 'game_over', 'This game has already finished.');
    return null;
  }
  if (game.locked) {
    fail(ws, 'lobby_locked', 'This game is not accepting new players.');
    return null;
  }
  return game;
}

function attachPlayer(ws: WebSocket, conn: Connection, game: Game, player: Player) {
  if (player.socket && player.socket !== ws) player.socket.close(CLOSE_REPLACED, 'replaced');
  player.socket = ws;
  conn.role = { kind: 'player', game, player };
  game.lobbyDirty = true;
  syncPlayer(game, player);
}

function createGame(ws: WebSocket | null, quiz: Quiz = SAMPLE_QUIZ): Game {
  const game: Game = {
    id: randomUUID(),
    pin: newPin(),
    hostToken: randomUUID(),
    screenKey: randomUUID(),
    hosts: new Set(ws ? [ws] : []),
    screens: new Set(),
    players: new Map(),
    playersByToken: new Map(),
    locked: false,
    lobbyDirty: false,
    lastLobbyFlush: 0,
    newlyAnswered: [],
    lastActivity: Date.now(),
    quiz: arrangeQuiz(quiz),
    settings: {
      leaderboardAfterEach: quiz.rules.showLeaderboard,
      liveCounts: true,
      autoAdvance: false,
      soundtrack: 'ocean-drive',
    },
    phase: 'lobby',
    qIndex: -1,
    durationMs: 0,
    endsAt: null,
    pausedRemainingMs: null,
    counts: [],
    words: new Map(),
    answered: 0,
    recent: [],
    progressDirty: false,
    standings: [],
    ranks: new Map(),
    closeTimer: null,
    phaseTimer: null,
    report: false,
    reported: false,
    startedAt: null,
  };
  games.set(game.id, game);
  gamesByPin.set(game.pin, game);
  return game;
}

function handle(ws: WebSocket, conn: Connection, msg: ClientMessage) {
  const role = conn.role;
  if (role.kind !== 'none') role.game.lastActivity = Date.now();

  if (msg.t.startsWith('host:') && msg.t !== 'host:create' && msg.t !== 'host:resume' && role.kind !== 'host') {
    return fail(ws, 'not_authorized', 'Only the host can do that.');
  }
  const game = role.kind === 'host' ? role.game : null;

  switch (msg.t) {
    case 'host:create': {
      if (role.kind === 'host') role.game.hosts.delete(ws);
      else if (role.kind !== 'none') return fail(ws, 'bad_request', 'Already in a game.');
      const created = createGame(ws);
      conn.role = { kind: 'host', game: created };
      return syncHost(ws, created);
    }

    case 'host:resume': {
      if (role.kind !== 'none' && role.kind !== 'host') return fail(ws, 'bad_request', 'Already in a game.');
      const found = games.get(msg.gameId);
      if (!found || !sameSecret(found.hostToken, msg.hostToken)) {
        return fail(ws, 'session_expired', 'This game has ended.');
      }
      if (role.kind === 'host' && role.game !== found) role.game.hosts.delete(ws);
      found.hosts.add(ws);
      found.lastActivity = Date.now();
      conn.role = { kind: 'host', game: found };
      return syncHost(ws, found);
    }

    case 'screen:join': {
      if (role.kind !== 'none') return fail(ws, 'bad_request', 'Already in a game.');
      const found = games.get(msg.gameId);
      if (!found || !sameSecret(found.screenKey, msg.screenKey)) {
        return fail(ws, 'session_expired', 'This game has ended.');
      }
      found.screens.add(ws);
      conn.role = { kind: 'screen', game: found };
      return syncHost(ws, found, true);
    }

    case 'host:lock':
      game!.locked = msg.locked;
      game!.lobbyDirty = true;
      return;

    case 'host:kick': {
      const player = game!.players.get(msg.playerId);
      if (!player) return;
      game!.players.delete(player.id);
      game!.playersByToken.delete(player.token);
      game!.lobbyDirty = true;
      if (player.socket) {
        send(player.socket, { t: 'kicked' });
        player.socket.close(CLOSE_KICKED, 'removed by host');
      }
      return closeIfEveryoneAnswered(game!);
    }

    case 'host:settings': {
      const trackChanged = msg.settings.soundtrack !== undefined && msg.settings.soundtrack !== game!.settings.soundtrack;
      game!.settings = { ...game!.settings, ...msg.settings };
      if (!game!.quiz.rules.showLeaderboard) game!.settings.leaderboardAfterEach = false;
      game!.progressDirty = true;
      toHosts(game!, { t: 'settings', settings: game!.settings });
      if (trackChanged) toPlayers(game!, { t: 'soundtrack', track: game!.settings.soundtrack });
      return;
    }

    case 'host:start':
      if (game!.phase !== 'lobby') return fail(ws, 'bad_request', 'The game has already started.');
      if (game!.players.size === 0) return fail(ws, 'bad_request', 'Wait for at least one player.');
      game!.startedAt = Date.now();
      return startQuestion(game!, 0);

    case 'host:reveal':
      return closeQuestion(game!);

    case 'host:pause':
      return setPaused(game!, msg.paused);

    case 'host:extend':
      return extendTime(game!);

    case 'host:leaderboard':
      return showLeaderboard(game!);

    case 'host:next':
      return advance(game!);

    case 'host:end':
      return finish(game!);

    case 'pin:check': {
      const found = findJoinableGame(ws, msg.pin, conn);
      if (found) send(ws, { t: 'pin:ok', pin: found.pin });
      return;
    }

    case 'player:join': {
      if (role.kind !== 'none') return fail(ws, 'bad_request', 'Already in a game.');
      const found = findJoinableGame(ws, msg.pin, conn);
      if (!found) return;
      const wanted = msg.nickname.toLocaleLowerCase();
      for (const p of found.players.values()) {
        if (p.nickname.toLocaleLowerCase() === wanted) {
          return fail(ws, 'name_taken', 'That nickname is taken. Try another.');
        }
      }
      const player: Player = {
        id: randomUUID(),
        token: randomUUID(),
        nickname: msg.nickname,
        avatar: msg.avatar,
        socket: null,
        joinedAt: Date.now(),
        score: 0,
        shownScore: 0,
        streak: 0,
        correctCount: 0,
        answers: new Map(),
      };
      found.players.set(player.id, player);
      found.playersByToken.set(player.token, player);
      found.lastActivity = Date.now();
      return attachPlayer(ws, conn, found, player);
    }

    case 'player:resume': {
      const found = gamesByPin.get(msg.pin);
      const player = found?.playersByToken.get(msg.playerToken);
      if (!found || !player) return fail(ws, 'session_expired', 'Your previous game has ended.');
      return attachPlayer(ws, conn, found, player);
    }

    case 'player:answer':
      if (role.kind !== 'player') return fail(ws, 'not_authorized', 'Join the game first.');
      return submitAnswer(ws, role.game, role.player, msg.index, msg);
  }
}

function onClose(ws: WebSocket) {
  const conn = connections.get(ws);
  connections.delete(ws);
  if (!conn) return;
  const role = conn.role;
  if (role.kind === 'host') {
    role.game.hosts.delete(ws);
  } else if (role.kind === 'screen') {
    role.game.screens.delete(ws);
  } else if (role.kind === 'player' && role.player.socket === ws) {
    role.player.socket = null;
    role.game.lobbyDirty = true;
    closeIfEveryoneAnswered(role.game);
  }
}

// ---------- server ----------

function clientIp(req: IncomingMessage) {
  const forwarded = req.headers['x-forwarded-for'];
  if (TRUST_PROXY && typeof forwarded === 'string') return forwarded.split(',')[0]!.trim();
  return req.socket.remoteAddress ?? 'unknown';
}

function originAllowed(origin: string | undefined) {
  if (ALLOWED_ORIGINS.length === 0) return !IS_PROD;
  return origin !== undefined && ALLOWED_ORIGINS.includes(origin);
}

function json(res: import('node:http').ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

function bearerOk(header: string | undefined) {
  if (!REALTIME_SECRET || !header?.startsWith('Bearer ')) return false;
  return sameSecret(header.slice(7), REALTIME_SECRET);
}

function createGameFromRequest(req: IncomingMessage, res: import('node:http').ServerResponse) {
  if (!REALTIME_SECRET) return json(res, 503, { error: 'not_configured' });
  if (!bearerOk(req.headers.authorization)) return json(res, 401, { error: 'unauthorized' });
  const chunks: Buffer[] = [];
  let size = 0;
  let aborted = false;
  req.on('data', (chunk: Buffer) => {
    size += chunk.length;
    if (size > MAX_QUIZ_BODY_BYTES) {
      aborted = true;
      json(res, 413, { error: 'too_large' });
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });
  req.on('end', () => {
    if (aborted) return;
    let body: unknown;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      return json(res, 400, { error: 'invalid_json' });
    }
    const parsed = PlayableQuiz.safeParse((body as { quiz?: unknown })?.quiz);
    if (!parsed.success) return json(res, 422, { error: 'invalid_quiz' });
    const quiz = parsed.data;
    if (quiz.questions.some((q) => q.correct[0]! >= q.options.length)) return json(res, 422, { error: 'invalid_quiz' });
    const autoAdvance = (body as { settings?: { autoAdvance?: unknown } }).settings?.autoAdvance;
    if (autoAdvance !== undefined && typeof autoAdvance !== 'boolean') return json(res, 422, { error: 'invalid_settings' });
    const game = createGame(null, quiz);
    game.report = true;
    if (autoAdvance !== undefined) game.settings.autoAdvance = autoAdvance;
    json(res, 201, { gameId: game.id, pin: game.pin, hostToken: game.hostToken });
  });
}

const http = createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    let players = 0;
    for (const g of games.values()) players += g.players.size;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, games: games.size, connections: connections.size, players }));
    return;
  }
  if (req.method === 'POST' && req.url === '/games') return createGameFromRequest(req, res);
  res.writeHead(404).end();
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 4 * 1024 });
const loggedOrigins = new Set<string>();

http.on('upgrade', (req, socket, head) => {
  const path = (req.url ?? '').split('?')[0];
  if (path !== '/ws' || !originAllowed(req.headers.origin)) {
    const origin = String(req.headers.origin ?? '(none)').slice(0, 200);
    if (path === '/ws' && loggedOrigins.size < 50 && !loggedOrigins.has(origin)) {
      loggedOrigins.add(origin);
      console.warn(`Refused a game connection from ${origin}; add it to ALLOWED_ORIGINS if it is your site.`);
    }
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});

wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
  const conn: Connection = {
    role: { kind: 'none' },
    ip: clientIp(req),
    alive: true,
    tokens: 20,
    lastRefill: Date.now(),
  };
  connections.set(ws, conn);

  ws.on('pong', () => {
    conn.alive = true;
  });
  ws.on('close', () => onClose(ws));
  ws.on('error', () => ws.terminate());
  ws.on('message', (raw: RawData) => {
    if (!allowMessage(conn)) return fail(ws, 'rate_limited', 'Slow down.');
    let data: unknown;
    try {
      data = JSON.parse(raw.toString());
    } catch {
      return fail(ws, 'bad_request', 'Invalid message.');
    }
    const parsed = ClientMessage.safeParse(data);
    if (!parsed.success) return fail(ws, 'bad_request', 'Invalid message.');
    handle(ws, conn, parsed.data);
  });
});

const flushTimer = setInterval(flush, FLUSH_MS);

const heartbeatTimer = setInterval(() => {
  for (const [ws, conn] of connections) {
    if (!conn.alive) {
      ws.terminate();
      continue;
    }
    conn.alive = false;
    ws.ping();
  }
}, HEARTBEAT_MS);

const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const game of games.values()) {
    if (game.hosts.size === 0 && now - game.lastActivity > GAME_IDLE_TTL_MS) {
      clearTimers(game);
      if (game.phase !== 'finished') {
        computeStandings(game);
        reportResults(game);
      }
      for (const p of game.players.values()) p.socket?.close(1001, 'game ended');
      for (const s of game.screens) s.close(1001, 'game ended');
      games.delete(game.id);
      gamesByPin.delete(game.pin);
    }
  }
  for (const [ip, entry] of pinAttempts) {
    if (now - entry.windowStart > 60_000) pinAttempts.delete(ip);
  }
}, 60_000);

http.listen(PORT, () => {
  console.log(`ThinkWise realtime server listening on :${PORT}`);
});

function shutdown() {
  clearInterval(flushTimer);
  clearInterval(heartbeatTimer);
  clearInterval(cleanupTimer);
  for (const game of games.values()) clearTimers(game);
  for (const ws of connections.keys()) ws.close(1001, 'server restarting');
  http.close(() => process.exit(0));
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
