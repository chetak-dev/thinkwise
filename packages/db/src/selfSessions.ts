import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';
import { and, asc, desc, eq, isNull, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { AVATARS, NICKNAME_MAX, TRACK_IDS, isScored, type AnswerKey, type PlayerAnswer, type PublicQuestion, type PublicRules, type TrackId } from '@thinkwise/shared';
import type { Db } from './client';
import { auditLog, gameSessions, selfAttempts, sessionPlayers } from './schema';
import {
  LayoutView,
  SELF_GRACE_MS,
  SelfAnswerInput,
  answerKey,
  judgeAnswer,
  makeLayout,
  playerAnswer,
  publicRules,
  readLayout,
  resultQuestions,
  scoreAttempt,
  type SelfEntries,
  type SelfQuiz,
} from './selfPaced';

export const SELF_PIN_LENGTH = 7;
export const SELF_LIMIT_MIN_MS = 60_000;
export const SELF_LIMIT_MAX_MS = 24 * 60 * 60_000;
export const SELF_WINDOW_MAX_MS = 90 * 24 * 60 * 60_000;
/** How long a closed self-paced PIN still finds its session (to tell latecomers it has closed). */
const CLOSED_LOOKUP_MS = 30 * 24 * 60 * 60_000;
const TOP_SHOWN = 5;

const SessionId = z.uuid();
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const isPin = (pin: string) => new RegExp(`^\\d{${SELF_PIN_LENGTH}}$`).test(pin);

export type SelfState = 'upcoming' | 'open' | 'closed';

interface SessionRow {
  id: string;
  hostId: string;
  title: string;
  pin: string;
  status: 'live' | 'ended' | 'abandoned';
  opensAt: Date | null;
  closesAt: Date | null;
  timeLimitMs: number | null;
  quiz: unknown;
}

const sessionColumns = {
  id: gameSessions.id,
  hostId: gameSessions.hostId,
  title: gameSessions.title,
  pin: gameSessions.pin,
  status: gameSessions.status,
  opensAt: gameSessions.opensAt,
  closesAt: gameSessions.closesAt,
  timeLimitMs: gameSessions.timeLimitMs,
  quiz: gameSessions.quiz,
};

function stateOf(s: Pick<SessionRow, 'status' | 'opensAt' | 'closesAt'>, now: Date): SelfState {
  if (s.status !== 'live' || !s.closesAt || s.closesAt <= now) return 'closed';
  return s.opensAt && s.opensAt > now ? 'upcoming' : 'open';
}

/** A participant's own deadline: their personal time limit, cut short by the session closing. */
function deadlineOf(startedAt: Date, s: Pick<SessionRow, 'timeLimitMs' | 'closesAt'>) {
  const personal = startedAt.getTime() + (s.timeLimitMs ?? 0);
  return new Date(Math.min(personal, s.closesAt?.getTime() ?? personal));
}

export interface CreateSelfSession {
  quizId: string | null;
  title: string;
  /** Already arranged (shuffled) for this session. */
  quiz: SelfQuiz;
  opensAt: Date;
  closesAt: Date;
  timeLimitMs: number;
  /** Music participants hear while answering. */
  soundtrack?: TrackId;
  /** Each participant gets their own question and option order. */
  shuffleEach?: boolean;
}

/** Session options kept alongside the quiz in the jsonb column. */
interface SessionExtras {
  soundtrack?: TrackId;
  shuffleEach?: boolean;
}

function extrasOf(quiz: unknown): SessionExtras {
  const raw = (quiz ?? {}) as { soundtrack?: unknown; shuffleEach?: unknown };
  return {
    soundtrack: TRACK_IDS.find((id) => id === raw.soundtrack),
    shuffleEach: raw.shuffleEach === true,
  };
}

/** Opens a self-paced session with a 7-digit PIN (live games use 6 digits, so the two never clash). */
export async function createSelfSession(db: Db, host: { id: string; orgId: string | null }, input: CreateSelfSession) {
  for (let tries = 0; tries < 20; tries++) {
    const pin = String(randomInt(10 ** (SELF_PIN_LENGTH - 1), 10 ** SELF_PIN_LENGTH));
    const [taken] = await db
      .select({ id: gameSessions.id })
      .from(gameSessions)
      .where(and(eq(gameSessions.pin, pin), eq(gameSessions.status, 'live')))
      .limit(1);
    if (taken) continue;
    const [row] = await db
      .insert(gameSessions)
      .values({
        id: randomUUID(),
        hostId: host.id,
        orgId: host.orgId,
        quizId: input.quizId,
        title: input.title,
        pin,
        mode: 'self',
        questionCount: input.quiz.questions.length,
        opensAt: input.opensAt,
        closesAt: input.closesAt,
        timeLimitMs: input.timeLimitMs,
        quiz: {
          ...input.quiz,
          ...(input.soundtrack ? { soundtrack: input.soundtrack } : {}),
          ...(input.shuffleEach ? { shuffleEach: true } : {}),
        },
      })
      .returning({ id: gameSessions.id });
    await db.insert(auditLog).values({ orgId: host.orgId, userId: host.id, action: 'session.create', meta: { sessionId: row!.id } });
    return { id: row!.id, pin };
  }
  throw new Error('Could not find a free PIN');
}

/** Closes the session for good: unsubmitted attempts are submitted as they stand and results join the reports. */
export async function finalizeSelfSession(db: Db, id: string, now = new Date(), force = false) {
  return db.transaction(async (tx) => {
    const [session] = await tx
      .update(gameSessions)
      .set({ status: 'ended', endedAt: now, closesAt: sql`least(${gameSessions.closesAt}, ${now})` })
      .where(
        and(
          eq(gameSessions.id, id),
          eq(gameSessions.mode, 'self'),
          eq(gameSessions.status, 'live'),
          force ? undefined : lte(gameSessions.closesAt, now),
        ),
      )
      .returning(sessionColumns);
    if (!session) return false;
    const quiz = session.quiz as SelfQuiz;
    const attempts = await tx.select().from(selfAttempts).where(eq(selfAttempts.sessionId, id));
    const scored = attempts.map((a) => {
      const result = scoreAttempt(quiz, a.answers as SelfEntries);
      const submittedAt = a.submittedAt ?? new Date(Math.min(now.getTime(), deadlineOf(a.startedAt, session).getTime()));
      return { a, result, submittedAt };
    });
    for (const { a, result, submittedAt } of scored) {
      if (a.submittedAt) continue;
      await tx
        .update(selfAttempts)
        .set({ submittedAt, score: result.score, correctCount: result.correctCount })
        .where(eq(selfAttempts.id, a.id));
    }
    scored.sort((x, y) => y.result.score - x.result.score || x.submittedAt.getTime() - y.submittedAt.getTime());
    if (scored.length) {
      await tx.insert(sessionPlayers).values(
        scored.map(({ a, result }, i) => ({
          sessionId: id,
          nickname: a.nickname,
          avatar: a.avatar,
          score: result.score,
          rank: i + 1,
          correctCount: result.correctCount,
          answers: result.answers,
        })),
      );
    }
    await tx
      .update(gameSessions)
      .set({
        status: scored.length ? 'ended' : 'abandoned',
        playerCount: scored.length,
        questionsAsked: scored.length ? quiz.questions.length : 0,
        questions: resultQuestions(quiz),
        startedAt: session.opensAt,
      })
      .where(eq(gameSessions.id, id));
    return true;
  });
}

/** Finalises self-paced sessions whose closing time has passed. Cheap when there are none. */
export async function finalizeDueSelfSessions(db: Db, hostId?: string, now = new Date()) {
  const due = await db
    .select({ id: gameSessions.id })
    .from(gameSessions)
    .where(
      and(
        eq(gameSessions.mode, 'self'),
        eq(gameSessions.status, 'live'),
        lte(gameSessions.closesAt, now),
        hostId ? eq(gameSessions.hostId, hostId) : undefined,
      ),
    )
    .limit(20);
  for (const { id } of due) await finalizeSelfSession(db, id, now);
}

async function sessionByPin(db: Db, pin: string, now: Date) {
  if (!isPin(pin)) return null;
  const [row] = await db
    .select(sessionColumns)
    .from(gameSessions)
    .where(
      and(
        eq(gameSessions.pin, pin),
        eq(gameSessions.mode, 'self'),
        sql`${gameSessions.createdAt} > ${new Date(now.getTime() - CLOSED_LOOKUP_MS)}`,
      ),
    )
    .orderBy(desc(gameSessions.createdAt))
    .limit(1);
  if (row && row.status === 'live' && row.closesAt && row.closesAt <= now) {
    await finalizeSelfSession(db, row.id, now);
    return { ...row, status: 'ended' as const };
  }
  return row ?? null;
}

export interface SelfInfo {
  title: string;
  state: SelfState;
  opensAt: number | null;
  closesAt: number | null;
  timeLimitMs: number;
  questionCount: number;
  rules: PublicRules;
  serverNow: number;
}

/** What the join screen shows for a self-paced PIN. */
export async function selfInfo(db: Db, pin: string, now = new Date()): Promise<SelfInfo | null> {
  const s = await sessionByPin(db, pin, now);
  if (!s) return null;
  const quiz = s.quiz as SelfQuiz;
  return {
    title: s.title,
    state: stateOf(s, now),
    opensAt: s.opensAt?.getTime() ?? null,
    closesAt: s.closesAt?.getTime() ?? null,
    timeLimitMs: s.timeLimitMs ?? 0,
    questionCount: quiz.questions.length,
    rules: publicRules(quiz),
    serverNow: now.getTime(),
  };
}

export type JoinSelfResult = { ok: true; token: string } | { ok: false; reason: 'not_found' | 'upcoming' | 'closed' | 'name_taken' | 'invalid' };

/** Starts a participant's attempt; their personal clock starts now. */
export async function joinSelf(db: Db, pin: string, nickname: string, avatar: string, now = new Date()): Promise<JoinSelfResult> {
  const name = nickname.trim().replace(/\s+/g, ' ');
  if (!name || name.length > NICKNAME_MAX || !(AVATARS as readonly string[]).includes(avatar)) return { ok: false, reason: 'invalid' };
  const s = await sessionByPin(db, pin, now);
  if (!s) return { ok: false, reason: 'not_found' };
  const state = stateOf(s, now);
  if (state !== 'open') return { ok: false, reason: state };
  const token = randomBytes(24).toString('base64url');
  const quiz = s.quiz as SelfQuiz;
  const layout = extrasOf(s.quiz).shuffleEach ? makeLayout(quiz) : null;
  const [row] = await db
    .insert(selfAttempts)
    .values({ sessionId: s.id, tokenHash: hashToken(token), nickname: name, avatar, startedAt: now, layout })
    .onConflictDoNothing()
    .returning({ id: selfAttempts.id });
  return row ? { ok: true, token } : { ok: false, reason: 'name_taken' };
}

async function attemptByToken(db: Db, token: string) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 100) return null;
  const [row] = await db
    .select({ attempt: selfAttempts, session: sessionColumns })
    .from(selfAttempts)
    .innerJoin(gameSessions, eq(gameSessions.id, selfAttempts.sessionId))
    .where(eq(selfAttempts.tokenHash, hashToken(token)))
    .limit(1);
  return row ?? null;
}

type Loaded = NonNullable<Awaited<ReturnType<typeof attemptByToken>>>;

/** Loads an attempt, closing the session or submitting the attempt if their time has run out. */
async function loadAttempt(db: Db, token: string, now: Date): Promise<Loaded | null> {
  let row = await attemptByToken(db, token);
  if (!row) return null;
  const { attempt, session } = row;
  if (session.status === 'live' && session.closesAt && session.closesAt <= now) {
    await finalizeSelfSession(db, session.id, now);
    row = await attemptByToken(db, token);
  } else if (!attempt.submittedAt && now.getTime() > deadlineOf(attempt.startedAt, session).getTime() + SELF_GRACE_MS) {
    await submitAttempt(db, row, deadlineOf(attempt.startedAt, session));
    row = await attemptByToken(db, token);
  }
  return row;
}

async function submitAttempt(db: Db, row: Loaded, at: Date) {
  const result = scoreAttempt(row.session.quiz as SelfQuiz, row.attempt.answers as SelfEntries);
  await db
    .update(selfAttempts)
    .set({ submittedAt: at, score: result.score, correctCount: result.correctCount })
    .where(and(eq(selfAttempts.id, row.attempt.id), isNull(selfAttempts.submittedAt)));
}

/** True while the participant may still open questions and change answers. */
function canAnswer(row: Loaded, now: Date) {
  if (row.attempt.submittedAt || stateOf(row.session, now) === 'closed') return false;
  return now.getTime() <= deadlineOf(row.attempt.startedAt, row.session).getTime() + SELF_GRACE_MS;
}

export interface SelfReviewItem {
  index: number;
  answer: PlayerAnswer | null;
  isCorrect: boolean;
  points: number;
  /** Right options (empty when the quiz hides answers, and for polls). */
  correct: number[];
  key: AnswerKey;
  explanation?: string;
}

export interface SelfPlayerState {
  title: string;
  rules: PublicRules;
  track: TrackId | null;
  state: SelfState;
  closesAt: number | null;
  serverNow: number;
  me: { nickname: string; avatar: string };
  startedAt: number;
  deadlineAt: number;
  submitted: boolean;
  questions: PublicQuestion[];
  answers: Record<number, PlayerAnswer>;
  /** After submitting: how it went. */
  result: { score: number; correctCount: number; answered: number; scoredTotal: number } | null;
  /** Once the session has closed: final place, top players and the answers. */
  final: {
    rank: number;
    players: number;
    top: { nickname: string; avatar: string; score: number; rank: number }[];
    review: SelfReviewItem[];
  } | null;
}

export async function selfPlayerState(db: Db, token: string, now = new Date()): Promise<SelfPlayerState | null> {
  const row = await loadAttempt(db, token, now);
  if (!row) return null;
  const { attempt, session } = row;
  const quiz = session.quiz as SelfQuiz;
  const view = new LayoutView(readLayout(attempt.layout, quiz.questions.length), quiz);
  const entries = attempt.answers as SelfEntries;
  // Keyed by the position this participant sees.
  const answers: Record<number, PlayerAnswer> = {};
  quiz.questions.forEach((q, i) => {
    const input = entries[String(i)]?.a;
    const judged = input ? judgeAnswer(q, input) : null;
    if (judged) answers[view.position(i)] = view.toShownAnswer(i, playerAnswer(judged));
  });
  const state = stateOf(session, now);
  const submitted = attempt.submittedAt !== null;
  const scoredTotal = quiz.questions.filter((q) => isScored(q.type)).length;
  let final: SelfPlayerState['final'] = null;
  if (state === 'closed' && session.status !== 'live') {
    const everyone = await db
      .select({ id: selfAttempts.id, nickname: selfAttempts.nickname, avatar: selfAttempts.avatar, score: selfAttempts.score })
      .from(selfAttempts)
      .where(eq(selfAttempts.sessionId, session.id))
      .orderBy(desc(selfAttempts.score), asc(selfAttempts.submittedAt), asc(selfAttempts.id));
    const show = quiz.rules.showCorrect;
    const scored = scoreAttempt(quiz, entries);
    const byQ = new Map(scored.answers.map((a) => [a.q, a]));
    final = {
      rank: everyone.findIndex((p) => p.id === attempt.id) + 1,
      players: everyone.length,
      top: quiz.rules.showLeaderboard
        ? everyone.slice(0, TOP_SHOWN).map((p, i) => ({ nickname: p.nickname, avatar: p.avatar, score: p.score, rank: i + 1 }))
        : [],
      review: quiz.questions.map((_, position) => {
        const qi = view.quizIndex(position)!;
        const q = quiz.questions[qi]!;
        return {
          index: position,
          answer: answers[position] ?? null,
          isCorrect: byQ.get(qi)?.isCorrect ?? false,
          points: byQ.get(qi)?.points ?? 0,
          correct: show ? view.shownCorrect(qi) : [],
          key: answerKey(q, show),
          ...(show && q.explanation ? { explanation: q.explanation } : {}),
        };
      }),
    };
  }
  return {
    title: session.title,
    rules: publicRules(quiz),
    track: extrasOf(session.quiz).soundtrack ?? null,
    state,
    closesAt: session.closesAt?.getTime() ?? null,
    serverNow: now.getTime(),
    me: { nickname: attempt.nickname, avatar: attempt.avatar },
    startedAt: attempt.startedAt.getTime(),
    deadlineAt: deadlineOf(attempt.startedAt, session).getTime(),
    submitted,
    questions: quiz.questions.map((_, position) => view.question(position)),
    answers,
    result: submitted
      ? { score: attempt.score, correctCount: attempt.correctCount, answered: Object.keys(answers).length, scoredTotal }
      : null,
    final,
  };
}

export type SelfActionResult = { ok: true } | { ok: false; reason: 'not_found' | 'locked' | 'invalid' };

function viewOf(row: Loaded) {
  const quiz = row.session.quiz as SelfQuiz;
  return { quiz, view: new LayoutView(readLayout(row.attempt.layout, quiz.questions.length), quiz) };
}

/** Notes when a question was first opened (speed scoring counts from then). `index` is the position the participant sees. */
export async function openSelfQuestion(db: Db, token: string, index: number, now = new Date()): Promise<SelfActionResult> {
  const row = await loadAttempt(db, token, now);
  if (!row) return { ok: false, reason: 'not_found' };
  if (!canAnswer(row, now)) return { ok: false, reason: 'locked' };
  const { quiz, view } = viewOf(row);
  if (!Number.isInteger(index) || index < 0 || index >= quiz.questions.length) return { ok: false, reason: 'invalid' };
  const key = String(view.quizIndex(index));
  await db
    .update(selfAttempts)
    .set({
      answers: sql`${selfAttempts.answers} || jsonb_build_object(${key}::text, jsonb_build_object('o', ${now.getTime()}::bigint) || coalesce(${selfAttempts.answers} -> ${key}::text, '{}'::jsonb))`,
    })
    .where(and(eq(selfAttempts.id, row.attempt.id), isNull(selfAttempts.submittedAt)));
  return { ok: true };
}

/** Saves (or with null, clears) the answer to one question. Answers can change until the attempt is submitted. */
export async function saveSelfAnswer(
  db: Db,
  token: string,
  index: number,
  input: unknown,
  now = new Date(),
): Promise<SelfActionResult & { answer?: PlayerAnswer | null }> {
  const row = await loadAttempt(db, token, now);
  if (!row) return { ok: false, reason: 'not_found' };
  if (!canAnswer(row, now)) return { ok: false, reason: 'locked' };
  const { quiz, view } = viewOf(row);
  if (!Number.isInteger(index) || index < 0 || index >= quiz.questions.length) return { ok: false, reason: 'invalid' };
  const qi = view.quizIndex(index)!;
  const q = quiz.questions[qi];
  if (!q) return { ok: false, reason: 'invalid' };
  const key = String(qi);
  if (input === null) {
    await db
      .update(selfAttempts)
      .set({
        answers: sql`${selfAttempts.answers} || jsonb_build_object(${key}::text, coalesce(${selfAttempts.answers} -> ${key}::text, '{}'::jsonb) - 'a' - 't')`,
      })
      .where(and(eq(selfAttempts.id, row.attempt.id), isNull(selfAttempts.submittedAt)));
    return { ok: true, answer: null };
  }
  const parsed = SelfAnswerInput.safeParse(input);
  const stored = parsed.success ? view.toQuizInput(qi, parsed.data) : null;
  const judged = stored ? judgeAnswer(q, stored) : null;
  if (!stored || !judged) return { ok: false, reason: 'invalid' };
  const saved = JSON.stringify({ a: stored, t: now.getTime() });
  await db
    .update(selfAttempts)
    .set({
      answers: sql`${selfAttempts.answers} || jsonb_build_object(${key}::text, jsonb_build_object('o', ${now.getTime()}::bigint) || coalesce(${selfAttempts.answers} -> ${key}::text, '{}'::jsonb) || ${saved}::jsonb)`,
    })
    .where(and(eq(selfAttempts.id, row.attempt.id), isNull(selfAttempts.submittedAt)));
  return { ok: true, answer: view.toShownAnswer(qi, playerAnswer(judged)) };
}

/** Hands in the whole attempt. Afterwards answers can't change. */
export async function submitSelf(db: Db, token: string, now = new Date()): Promise<SelfActionResult> {
  const row = await loadAttempt(db, token, now);
  if (!row) return { ok: false, reason: 'not_found' };
  if (row.attempt.submittedAt) return { ok: true };
  if (!canAnswer(row, now)) return { ok: false, reason: 'locked' };
  await submitAttempt(db, row, now);
  return { ok: true };
}

/** Counts the participant leaving the quiz page while answering. */
export async function recordSelfAway(db: Db, token: string, now = new Date()): Promise<SelfActionResult> {
  const row = await loadAttempt(db, token, now);
  if (!row) return { ok: false, reason: 'not_found' };
  if (!canAnswer(row, now)) return { ok: false, reason: 'locked' };
  await db
    .update(selfAttempts)
    .set({ tabSwitches: sql`least(${selfAttempts.tabSwitches} + 1, 9999)` })
    .where(and(eq(selfAttempts.id, row.attempt.id), isNull(selfAttempts.submittedAt)));
  return { ok: true };
}

export interface SelfHostView {
  id: string;
  title: string;
  pin: string;
  state: SelfState;
  opensAt: number | null;
  closesAt: number | null;
  timeLimitMs: number;
  questionCount: number;
  serverNow: number;
  shuffleEach: boolean;
  showLeaderboard: boolean;
  showCorrect: boolean;
  participants: {
    nickname: string;
    avatar: string;
    startedAt: number;
    deadlineAt: number;
    submitted: boolean;
    /** From start to submit (or to now while answering). */
    timeTakenMs: number;
    answered: number;
    score: number | null;
    correctCount: number | null;
    tabSwitches: number;
  }[];
}

/** The host's live view of a self-paced session; null if it isn't theirs. */
export async function selfHostView(db: Db, hostId: string, id: string, now = new Date()): Promise<SelfHostView | null> {
  if (!SessionId.safeParse(id).success) return null;
  await finalizeDueSelfSessions(db, hostId, now);
  const [s] = await db
    .select(sessionColumns)
    .from(gameSessions)
    .where(and(eq(gameSessions.id, id), eq(gameSessions.hostId, hostId), eq(gameSessions.mode, 'self')))
    .limit(1);
  if (!s || !s.quiz) return null;
  const quiz = s.quiz as SelfQuiz;
  const attempts = await db
    .select()
    .from(selfAttempts)
    .where(eq(selfAttempts.sessionId, id))
    .orderBy(asc(selfAttempts.startedAt));
  const participants = attempts.map((a) => {
    const entries = a.answers as SelfEntries;
    const answered = Object.values(entries).filter((e) => e.a !== undefined).length;
    const submitted = a.submittedAt !== null;
    const deadline = deadlineOf(a.startedAt, s).getTime();
    const end = a.submittedAt?.getTime() ?? Math.min(now.getTime(), deadline);
    return {
      nickname: a.nickname,
      avatar: a.avatar,
      startedAt: a.startedAt.getTime(),
      deadlineAt: deadline,
      submitted,
      timeTakenMs: Math.max(0, end - a.startedAt.getTime()),
      answered,
      score: submitted ? a.score : null,
      correctCount: submitted ? a.correctCount : null,
      tabSwitches: a.tabSwitches,
    };
  });
  participants.sort((x, y) => (y.score ?? -1) - (x.score ?? -1) || x.startedAt - y.startedAt);
  return {
    id: s.id,
    title: s.title,
    pin: s.pin,
    state: stateOf(s, now),
    opensAt: s.opensAt?.getTime() ?? null,
    closesAt: s.closesAt?.getTime() ?? null,
    timeLimitMs: s.timeLimitMs ?? 0,
    questionCount: quiz.questions.length,
    serverNow: now.getTime(),
    shuffleEach: extrasOf(s.quiz).shuffleEach ?? false,
    showLeaderboard: quiz.rules.showLeaderboard,
    showCorrect: quiz.rules.showCorrect,
    participants,
  };
}

async function ownsLiveSelf(db: Db, hostId: string, id: string) {
  if (!SessionId.safeParse(id).success) return false;
  const [s] = await db
    .select({ id: gameSessions.id })
    .from(gameSessions)
    .where(and(eq(gameSessions.id, id), eq(gameSessions.hostId, hostId), eq(gameSessions.mode, 'self'), eq(gameSessions.status, 'live')))
    .limit(1);
  return !!s;
}

/** Ends a self-paced session now, whatever its closing time. */
export async function closeSelfSession(db: Db, hostId: string, id: string, now = new Date()) {
  if (!(await ownsLiveSelf(db, hostId, id))) return false;
  const closed = await finalizeSelfSession(db, id, now, true);
  if (closed) await db.insert(auditLog).values({ userId: hostId, action: 'session.close', meta: { sessionId: id } });
  return closed;
}

export interface SelfSettingsPatch {
  title?: string;
  opensAt?: Date;
  closesAt?: Date;
  timeLimitMs?: number;
  showLeaderboard?: boolean;
  showCorrect?: boolean;
}

export type SelfSettingsResult = { ok: true } | { ok: false; error: string };

/**
 * Changes an open (or scheduled) session's settings. Once closed, only the title and what participants
 * may see (leaderboard, correct answers) can change. A new time limit applies to everyone still answering.
 */
export async function updateSelfSettings(
  db: Db,
  hostId: string,
  id: string,
  patch: SelfSettingsPatch,
  now = new Date(),
): Promise<SelfSettingsResult> {
  if (!SessionId.safeParse(id).success) return { ok: false, error: 'This quiz no longer exists.' };
  await finalizeDueSelfSessions(db, hostId, now);
  const [s] = await db
    .select(sessionColumns)
    .from(gameSessions)
    .where(and(eq(gameSessions.id, id), eq(gameSessions.hostId, hostId), eq(gameSessions.mode, 'self')))
    .limit(1);
  if (!s || !s.quiz) return { ok: false, error: 'This quiz no longer exists.' };
  const state = stateOf(s, now);
  const set: Partial<typeof gameSessions.$inferInsert> = {};

  if (patch.title !== undefined) {
    const title = patch.title.trim().replace(/\s+/g, ' ');
    if (!title || title.length > 150) return { ok: false, error: 'The title must be 1–150 characters.' };
    set.title = title;
  }
  const timing = patch.opensAt !== undefined || patch.closesAt !== undefined || patch.timeLimitMs !== undefined;
  if (timing && state === 'closed') return { ok: false, error: 'This quiz has closed. Reopen it as a new session to run it again.' };
  let opensAt = s.opensAt ?? now;
  if (patch.opensAt !== undefined) {
    if (state !== 'upcoming') return { ok: false, error: 'The quiz has already opened, so its opening time can’t change.' };
    if (!(patch.opensAt.getTime() >= now.getTime() - 60_000)) return { ok: false, error: 'Choose an opening time from now on.' };
    opensAt = new Date(Math.max(patch.opensAt.getTime(), now.getTime()));
    set.opensAt = opensAt;
  }
  if (patch.closesAt !== undefined || patch.opensAt !== undefined) {
    const closesAt = patch.closesAt ?? s.closesAt!;
    if (closesAt.getTime() <= Math.max(now.getTime(), opensAt.getTime())) {
      return { ok: false, error: 'The closing time must be in the future and after the opening time.' };
    }
    if (closesAt.getTime() - opensAt.getTime() > SELF_WINDOW_MAX_MS) return { ok: false, error: 'A self-paced quiz can stay open for 90 days at most.' };
    set.closesAt = closesAt;
  }
  if (patch.timeLimitMs !== undefined) {
    if (!Number.isFinite(patch.timeLimitMs) || patch.timeLimitMs < SELF_LIMIT_MIN_MS || patch.timeLimitMs > SELF_LIMIT_MAX_MS) {
      return { ok: false, error: 'The time limit must be between 1 minute and 24 hours.' };
    }
    set.timeLimitMs = Math.round(patch.timeLimitMs);
  }
  if (patch.showLeaderboard !== undefined || patch.showCorrect !== undefined) {
    const quiz = s.quiz as SelfQuiz & SessionExtras;
    set.quiz = {
      ...quiz,
      rules: {
        ...quiz.rules,
        ...(patch.showLeaderboard !== undefined ? { showLeaderboard: patch.showLeaderboard } : {}),
        ...(patch.showCorrect !== undefined ? { showCorrect: patch.showCorrect } : {}),
      },
    };
  }
  if (Object.keys(set).length === 0) return { ok: true };
  const rows = await db
    .update(gameSessions)
    .set(set)
    // Timing changes only while still open, in case it closed in the meantime.
    .where(and(eq(gameSessions.id, id), timing ? eq(gameSessions.status, 'live') : undefined))
    .returning({ id: gameSessions.id });
  if (!rows.length) return { ok: false, error: 'This quiz has just closed.' };
  await db.insert(auditLog).values({ userId: hostId, action: 'session.settings', meta: { sessionId: id, changed: Object.keys(set) } });
  return { ok: true };
}

/** Opens the same quiz again as a new session (new PIN, no participants), keeping its settings. */
export async function reopenSelfSession(
  db: Db,
  host: { id: string; orgId: string | null },
  id: string,
  times: { opensAt: Date; closesAt: Date; timeLimitMs?: number },
  now = new Date(),
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!SessionId.safeParse(id).success) return { ok: false, error: 'This quiz no longer exists.' };
  const [s] = await db
    .select({ ...sessionColumns, quizId: gameSessions.quizId })
    .from(gameSessions)
    .where(and(eq(gameSessions.id, id), eq(gameSessions.hostId, host.id), eq(gameSessions.mode, 'self')))
    .limit(1);
  if (!s || !s.quiz) return { ok: false, error: 'This quiz no longer exists.' };
  const opensAt = new Date(Math.max(times.opensAt.getTime(), now.getTime()));
  const limit = times.timeLimitMs ?? s.timeLimitMs ?? SELF_LIMIT_MIN_MS;
  if (times.closesAt.getTime() <= opensAt.getTime()) return { ok: false, error: 'The quiz must close after it opens.' };
  if (times.closesAt.getTime() - opensAt.getTime() > SELF_WINDOW_MAX_MS) return { ok: false, error: 'A self-paced quiz can stay open for 90 days at most.' };
  if (limit < SELF_LIMIT_MIN_MS || limit > SELF_LIMIT_MAX_MS) return { ok: false, error: 'The time limit must be between 1 minute and 24 hours.' };
  const { soundtrack, shuffleEach, ...quiz } = s.quiz as SelfQuiz & SessionExtras;
  const created = await createSelfSession(db, host, {
    quizId: s.quizId,
    title: s.title,
    quiz,
    opensAt,
    closesAt: times.closesAt,
    timeLimitMs: Math.round(limit),
    soundtrack,
    shuffleEach,
  });
  return { ok: true, id: created.id };
}

export interface SelfExport {
  title: string;
  questions: { text: string; type: string }[];
  rows: {
    rank: number;
    nickname: string;
    startedAt: number;
    submittedAt: number | null;
    timeTakenMs: number;
    score: number;
    correctCount: number;
    answered: number;
    tabSwitches: number;
    answers: ({ answer: string; isCorrect: boolean; points: number; timeMs: number } | null)[];
  }[];
}

/** Every participant's answers, for the spreadsheet download. Scores of unsubmitted attempts are worked out as they stand. */
export async function selfExport(db: Db, hostId: string, id: string, now = new Date()): Promise<SelfExport | null> {
  if (!SessionId.safeParse(id).success) return null;
  await finalizeDueSelfSessions(db, hostId, now);
  const [s] = await db
    .select(sessionColumns)
    .from(gameSessions)
    .where(and(eq(gameSessions.id, id), eq(gameSessions.hostId, hostId), eq(gameSessions.mode, 'self')))
    .limit(1);
  if (!s || !s.quiz) return null;
  const quiz = s.quiz as SelfQuiz;
  const attempts = await db.select().from(selfAttempts).where(eq(selfAttempts.sessionId, id));
  const describe = (q: SelfQuiz['questions'][number], a: SelfAnswerInput) => {
    const judged = judgeAnswer(q, a);
    if (!judged) return '';
    if (judged.text !== undefined) return judged.text;
    if (judged.number !== undefined) return String(judged.number);
    if (judged.blanks !== undefined) return judged.blanks.join(' | ');
    return judged.choices.map((c) => q.options[c] ?? '').join(q.type === 'order' ? ' → ' : ', ');
  };
  const rows = attempts.map((a) => {
    const entries = a.answers as SelfEntries;
    const scored = scoreAttempt(quiz, entries);
    const byQ = new Map(scored.answers.map((x) => [x.q, x]));
    const deadline = deadlineOf(a.startedAt, s).getTime();
    const end = a.submittedAt?.getTime() ?? Math.min(now.getTime(), deadline);
    return {
      rank: 0,
      nickname: a.nickname,
      startedAt: a.startedAt.getTime(),
      submittedAt: a.submittedAt?.getTime() ?? null,
      timeTakenMs: Math.max(0, end - a.startedAt.getTime()),
      score: a.submittedAt ? a.score : scored.score,
      correctCount: a.submittedAt ? a.correctCount : scored.correctCount,
      answered: scored.answered,
      tabSwitches: a.tabSwitches,
      answers: quiz.questions.map((q, i) => {
        const given = entries[String(i)]?.a;
        const marked = byQ.get(i);
        return given && marked ? { answer: describe(q, given), isCorrect: marked.isCorrect, points: marked.points, timeMs: marked.timeMs } : null;
      }),
    };
  });
  rows.sort((x, y) => y.score - x.score || (x.submittedAt ?? Infinity) - (y.submittedAt ?? Infinity));
  rows.forEach((r, i) => (r.rank = i + 1));
  return { title: s.title, questions: quiz.questions.map((q) => ({ text: q.text, type: q.type })), rows };
}
