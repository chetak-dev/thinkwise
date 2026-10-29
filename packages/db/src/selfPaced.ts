import { randomInt } from 'node:crypto';
import { z } from 'zod';
import {
  ANSWER_TEXT_MAX,
  CLOUD_ANSWER_MAX,
  MAX_BLANKS,
  MAX_OPTIONS,
  blanksRight,
  countWords,
  isAcceptedAnswer,
  isNumberMatch,
  isScored,
  type AnswerKey,
  type GameResults,
  type PlayableQuiz,
  type PlayerAnswer,
  type PublicQuestion,
  type PublicRules,
} from '@thinkwise/shared';

// Self-paced quizzes run from the database rather than the game server, so they can stay open for days.
// The judging and scoring below mirror the game server's, so both modes give the same marks.

export type SelfQuiz = PlayableQuiz;
type Question = SelfQuiz['questions'][number];

const MAX_STREAK_STEPS = 5;
/** Saves arriving just after the deadline (slow networks) still count. */
export const SELF_GRACE_MS = 5000;

/** What a participant sends for one question. */
export const SelfAnswerInput = z
  .object({
    choice: z.number().int().min(0).max(MAX_OPTIONS - 1).optional(),
    choices: z.array(z.number().int().min(0).max(MAX_OPTIONS - 1)).min(1).max(MAX_OPTIONS).optional(),
    text: z.string().max(ANSWER_TEXT_MAX).optional(),
    number: z.number().finite().optional(),
    blanks: z.array(z.string().max(ANSWER_TEXT_MAX)).min(1).max(MAX_BLANKS).optional(),
  })
  .strict();
export type SelfAnswerInput = z.infer<typeof SelfAnswerInput>;

/** One question's entry in an attempt: when it was first opened, and the latest saved answer. */
export interface SelfEntry {
  /** Epoch ms the participant first opened the question. */
  o?: number;
  a?: SelfAnswerInput;
  /** Epoch ms of the latest save. */
  t?: number;
}
export type SelfEntries = Record<string, SelfEntry>;

export interface Judged {
  choices: number[];
  text?: string;
  number?: number;
  blanks?: string[];
  partsRight?: number;
  isCorrect: boolean;
  /** 0–1 share of the points earned. */
  credit: number;
}

/** Checks an answer has the shape its question needs and marks it; null if it doesn't fit. */
export function judgeAnswer(q: Question, input: SelfAnswerInput): Judged | null {
  if (q.type === 'text') {
    const text = (input.text ?? '').trim();
    if (!text) return null;
    const isCorrect = isAcceptedAnswer(text, q.accepted, q.caseSensitive);
    return { choices: [], text, isCorrect, credit: isCorrect ? 1 : 0 };
  }
  if (q.type === 'cloud') {
    const text = (input.text ?? '').trim().replace(/\s+/g, ' ');
    if (!text || text.length > CLOUD_ANSWER_MAX || countWords(text) > q.maxWords) return null;
    return { choices: [], text, isCorrect: false, credit: 0 };
  }
  if (q.type === 'numeric') {
    if (input.number === undefined || q.numericAnswer === null) return null;
    const isCorrect = isNumberMatch(input.number, q.numericAnswer, q.tolerance);
    return { choices: [], number: input.number, isCorrect, credit: isCorrect ? 1 : 0 };
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
    return { choices, isCorrect, credit: isCorrect ? 1 : 0 };
  }
  if (input.choice === undefined || input.choice >= q.options.length) return null;
  if (q.type === 'poll') return { choices: [input.choice], isCorrect: false, credit: 0 };
  const isCorrect = q.correct.includes(input.choice);
  return { choices: [input.choice], isCorrect, credit: isCorrect ? 1 : 0 };
}

/** The answer as the player sees it again (e.g. when coming back to a question). */
export function playerAnswer(judged: Judged): PlayerAnswer {
  if (judged.text !== undefined) return { choices: [], text: judged.text };
  if (judged.number !== undefined) return { choices: [], number: judged.number };
  if (judged.blanks !== undefined) return { choices: [], blanks: judged.blanks };
  return { choices: judged.choices };
}

export type SavedSelfAnswer = GameResults['players'][number]['answers'][number];

export interface AttemptScore {
  score: number;
  correctCount: number;
  answered: number;
  answers: SavedSelfAnswer[];
}

/**
 * Marks a whole attempt in question order, as a live game would have: speed scoring uses the time between first
 * opening a question and the latest save, streaks run in question order, and negative marking never goes below 0.
 */
export function scoreAttempt(quiz: SelfQuiz, entries: SelfEntries): AttemptScore {
  const rules = quiz.rules;
  let score = 0;
  let streak = 0;
  let correctCount = 0;
  let answered = 0;
  const answers: SavedSelfAnswer[] = [];
  quiz.questions.forEach((q, index) => {
    const entry = entries[String(index)];
    const judged = entry?.a ? judgeAnswer(q, entry.a) : null;
    if (!judged) {
      if (isScored(q.type)) streak = 0;
      return;
    }
    answered += 1;
    const limit = q.timeLimitMs;
    const opened = entry!.o ?? entry!.t ?? 0;
    const elapsed = Math.min(limit, Math.max(0, (entry!.t ?? opened) - opened));
    let points = 0;
    if (judged.credit > 0) {
      const speedFactor = rules.scoring === 'speed' ? 1 - 0.5 * (elapsed / limit) : 1;
      const streakFactor = rules.streakBonus && judged.isCorrect ? 1 + Math.min(streak, MAX_STREAK_STEPS) * 0.1 : 1;
      points = Math.round(q.points * judged.credit * speedFactor * streakFactor);
    }
    if (!isScored(q.type)) {
      // Opinions never touch scores or streaks.
    } else if (judged.isCorrect) {
      streak += 1;
      correctCount += 1;
    } else {
      streak = 0;
      if (judged.credit === 0) points = -Math.min(q.penalty, score);
    }
    score += points;
    const given =
      q.type === 'mc' || q.type === 'tf'
        ? { choice: judged.choices[0] }
        : q.type === 'multi' || q.type === 'order' || q.type === 'poll'
          ? { choices: judged.choices }
          : judged.text !== undefined
            ? { text: judged.text }
            : judged.number !== undefined
              ? { number: judged.number }
              : { blanks: judged.blanks };
    answers.push({ q: index, ...given, isCorrect: judged.isCorrect, points, timeMs: Math.round(elapsed) });
  });
  return { score, correctCount, answered, answers };
}

function shuffled<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** One shuffle per session, so everyone's report lines up question by question. */
export function arrangeQuiz(quiz: SelfQuiz): SelfQuiz {
  const questions = quiz.rules.shuffleQuestions ? shuffled(quiz.questions) : quiz.questions;
  const reorder = (q: Question, order: number[]) => ({
    ...q,
    options: order.map((i) => q.options[i]!),
    correct: q.correct.map((c) => order.indexOf(c)),
  });
  return {
    ...quiz,
    questions: questions.map((q) => {
      if (q.type === 'order') {
        let order = shuffled(q.options.map((_, i) => i));
        for (let tries = 0; tries < 10 && order.every((v, i) => v === i); tries++) order = shuffled(order);
        return reorder(q, order);
      }
      if (!quiz.rules.shuffleOptions || q.type === 'tf' || q.options.length === 0) return q;
      return reorder(q, shuffled(q.options.map((_, i) => i)));
    }),
  };
}

/** The sum of every question's own time limit: the suggested personal time limit. */
export function totalTimeMs(quiz: SelfQuiz) {
  return quiz.questions.reduce((sum, q) => sum + q.timeLimitMs, 0);
}

export function publicQuestion(quiz: SelfQuiz, index: number): PublicQuestion {
  const q = quiz.questions[index]!;
  return {
    index,
    total: quiz.questions.length,
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

export function publicRules(quiz: SelfQuiz): PublicRules {
  const r = quiz.rules;
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

/** What counted as right for typed, numeric and blank questions; empty when the quiz hides answers. */
export function answerKey(q: Question, show: boolean): AnswerKey {
  if (q.type === 'text') return { accepted: show ? q.accepted : [] };
  if (q.type === 'numeric' && show && q.numericAnswer !== null) return { numeric: { answer: q.numericAnswer, tolerance: q.tolerance } };
  if (q.type === 'blanks') return { blankAnswers: show ? q.blanks : [] };
  return {};
}

/** The questions as stored with the results, so reports line up with the answers. */
export function resultQuestions(quiz: SelfQuiz): GameResults['questions'] {
  return quiz.questions.map((q) => ({
    type: q.type,
    text: q.text,
    options: q.options,
    correct: q.correct,
    ...(q.type === 'text' ? { accepted: q.accepted } : {}),
    ...(q.type === 'numeric' && q.numericAnswer !== null ? { numericAnswer: q.numericAnswer, tolerance: q.tolerance } : {}),
    ...(q.type === 'blanks' ? { blanks: q.blanks } : {}),
    ...(q.type === 'rating' ? { ratingMin: q.ratingMin, ratingMax: q.ratingMax } : {}),
    points: q.points,
  }));
}
