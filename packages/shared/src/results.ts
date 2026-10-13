import { z } from 'zod';
import {
  ANSWER_TEXT_MAX,
  MAX_ACCEPTED,
  MAX_BLANKS,
  QUESTION_TYPES,
  formatNumberAnswer,
  isScored,
  normaliseAnswer,
} from './quiz';
import { toCsv } from './csv';

export const SESSION_STATUSES = ['live', 'ended', 'abandoned'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

const MAX_PLAYERS = 5000;

/** What the game server sends the web app when a hosted game finishes or is cleaned up. */
export const GameResults = z.object({
  gameId: z.uuid(),
  status: z.enum(['ended', 'abandoned']),
  startedAt: z.number().int().nullable(),
  endedAt: z.number().int(),
  questionsAsked: z.number().int().min(0).max(500),
  questions: z
    .array(
      z.object({
        type: z.enum(QUESTION_TYPES),
        text: z.string().max(1000),
        options: z.array(z.string().max(500)).max(10),
        correct: z.array(z.number().int().min(0)).max(10),
        accepted: z.array(z.string().max(ANSWER_TEXT_MAX)).max(MAX_ACCEPTED).optional(),
        numericAnswer: z.number().finite().optional(),
        tolerance: z.number().finite().min(0).optional(),
        blanks: z.array(z.array(z.string().max(ANSWER_TEXT_MAX)).max(MAX_ACCEPTED)).max(MAX_BLANKS).optional(),
        ratingMin: z.number().int().min(0).max(1).optional(),
        ratingMax: z.number().int().min(3).max(10).optional(),
        points: z.number().int().min(0),
      }),
    )
    .max(500),
  players: z
    .array(
      z.object({
        nickname: z.string().max(60),
        avatar: z.string().max(16),
        score: z.number().int(),
        rank: z.number().int().min(1),
        correctCount: z.number().int().min(0),
        answers: z
          .array(
            z.object({
              q: z.number().int().min(0),
              /** Single-choice pick (older results only ever have this). */
              choice: z.number().int().min(0).optional(),
              choices: z.array(z.number().int().min(0)).max(10).optional(),
              text: z.string().max(ANSWER_TEXT_MAX).optional(),
              number: z.number().finite().optional(),
              blanks: z.array(z.string().max(ANSWER_TEXT_MAX)).max(MAX_BLANKS).optional(),
              isCorrect: z.boolean(),
              points: z.number().int(),
              timeMs: z.number().int().min(0),
            }),
          )
          .max(500),
      }),
    )
    .max(MAX_PLAYERS),
});
export type GameResults = z.infer<typeof GameResults>;
type SavedAnswer = GameResults['players'][number]['answers'][number];
type SavedQuestion = GameResults['questions'][number];

/** The options a saved answer picked, whichever shape it was stored in. */
export function savedChoices(a: Pick<SavedAnswer, 'choice' | 'choices'>): number[] {
  return a.choices ?? (a.choice === undefined ? [] : [a.choice]);
}

/** A saved answer as words, e.g. "Mars", "2 + 5", "Venus → Earth", "42" or what the player typed. */
export function describeAnswer(
  q: Pick<SavedQuestion, 'type' | 'options'>,
  a: Pick<SavedAnswer, 'choice' | 'choices' | 'text' | 'number' | 'blanks'>,
): string {
  if (a.text !== undefined) return a.text;
  if (a.number !== undefined) return String(a.number);
  if (a.blanks !== undefined) return a.blanks.map((b) => b.trim() || '—').join(' · ');
  return savedChoices(a)
    .map((c) => q.options[c] ?? '?')
    .join(q.type === 'order' ? ' → ' : ' + ');
}

/** What counted as right, for question types without options to tick; '' for the others. */
export function answerKeyText(
  q: Pick<SavedQuestion, 'type' | 'options' | 'correct' | 'accepted' | 'numericAnswer' | 'tolerance' | 'blanks'>,
): string {
  if (q.type === 'text') return (q.accepted ?? []).join(' · ');
  if (q.type === 'numeric' && q.numericAnswer !== undefined) return formatNumberAnswer(q.numericAnswer, q.tolerance ?? 0);
  if (q.type === 'blanks') return (q.blanks ?? []).map((b, i) => `${i + 1}: ${b.join(' / ')}`).join(' · ');
  if (q.type === 'order') return q.correct.map((c) => q.options[c] ?? '?').join(' → ');
  return '';
}

/** Only questions with a right answer count towards "correct" totals and accuracy. */
export function scoredQuestionCount(questions: Pick<SavedQuestion, 'type'>[], questionsAsked: number) {
  return questions.slice(0, questionsAsked).filter((q) => isScored(q.type)).length;
}

export function scoredAnswers<A extends Pick<SavedAnswer, 'q'>>(questions: Pick<SavedQuestion, 'type'>[], answers: A[]): A[] {
  return answers.filter((a) => {
    const q = questions[a.q];
    return q !== undefined && isScored(q.type);
  });
}

const TEXT_ANSWER_ROWS = 8;

export interface QuestionStats {
  index: number;
  type: GameResults['questions'][number]['type'];
  text: string;
  options: string[];
  correct: number[];
  asked: boolean;
  /** False for opinion questions such as ratings. */
  scored: boolean;
  answers: number;
  correctAnswers: number;
  /** 0–100, or null when nobody answered or the question isn't scored. */
  accuracy: number | null;
  avgMs: number | null;
  optionCounts: number[];
  /** Rating questions: the mean value picked. */
  average: number | null;
  /** What counted as right, for types without options. */
  answerKey: string;
  /** Typed or numeric answers: the most common responses, grouped ignoring case and spacing. */
  textCounts: { text: string; count: number; isCorrect: boolean }[];
}

export interface ReportStats {
  participants: number;
  answered: number;
  /** Player × asked-question slots. */
  possible: number;
  /** Asked questions that have a right answer. */
  scoredAsked: number;
  accuracy: number | null;
  avgScore: number | null;
  completion: number | null;
  questions: QuestionStats[];
  hardest: QuestionStats | null;
  distribution: { from: number; to: number; count: number }[];
}

const DISTRIBUTION_BUCKETS = 5;

/** Everything a session report shows, derived only from saved answers. */
export function computeReport(
  questions: GameResults['questions'],
  players: Pick<GameResults['players'][number], 'score' | 'correctCount' | 'answers'>[],
  questionsAsked: number,
): ReportStats {
  const stats: QuestionStats[] = questions.map((q, index) => {
    const rating = q.type === 'rating' && q.ratingMin !== undefined && q.ratingMax !== undefined;
    // Rating answers are numbers; show each value on the scale as an "option".
    const options = rating ? Array.from({ length: q.ratingMax! - q.ratingMin! + 1 }, (_, i) => String(q.ratingMin! + i)) : q.options;
    return {
      index,
      type: q.type,
      text: q.text,
      options,
      correct: q.correct,
      asked: index < questionsAsked,
      scored: isScored(q.type),
      answers: 0,
      correctAnswers: 0,
      accuracy: null,
      avgMs: null,
      optionCounts: options.map(() => 0),
      average: null,
      answerKey: answerKeyText(q),
      textCounts: [],
    };
  });
  const timeTotals = stats.map(() => 0);
  const numberTotals = stats.map(() => 0);
  const texts = stats.map(() => new Map<string, { text: string; count: number; isCorrect: boolean }>());
  for (const p of players) {
    for (const a of p.answers) {
      const s = stats[a.q];
      if (!s) continue;
      s.answers += 1;
      if (a.isCorrect) s.correctAnswers += 1;
      if (s.type === 'rating' && a.number !== undefined) {
        numberTotals[a.q]! += a.number;
        const slot = a.number - Number(s.options[0] ?? 0);
        if (slot >= 0 && slot < s.optionCounts.length) s.optionCounts[slot]! += 1;
      } else if (s.answerKey || s.type === 'cloud') {
        const said = describeAnswer(s, a).trim();
        const key = `${a.isCorrect ? 1 : 0}|${normaliseAnswer(said)}`;
        const entry = texts[a.q]!.get(key) ?? { text: said, count: 0, isCorrect: a.isCorrect };
        entry.count += 1;
        texts[a.q]!.set(key, entry);
      } else {
        for (const c of savedChoices(a)) if (c < s.optionCounts.length) s.optionCounts[c]! += 1;
      }
      timeTotals[a.q]! += a.timeMs;
    }
  }
  for (const s of stats) {
    s.textCounts = [...texts[s.index]!.values()].sort((x, y) => y.count - x.count).slice(0, TEXT_ANSWER_ROWS);
    if (s.answers) {
      if (s.scored) s.accuracy = Math.round((s.correctAnswers / s.answers) * 100);
      if (s.type === 'rating') s.average = Math.round((numberTotals[s.index]! / s.answers) * 10) / 10;
      s.avgMs = Math.round(timeTotals[s.index]! / s.answers);
    }
  }

  const answered = players.reduce((n, p) => n + p.answers.length, 0);
  const scoredGiven = players.reduce((n, p) => n + scoredAnswers(questions, p.answers).length, 0);
  const correct = players.reduce((n, p) => n + p.answers.filter((a) => a.isCorrect).length, 0);
  const possible = players.length * questionsAsked;
  const scored = stats.filter((s) => s.accuracy !== null);
  const hardest = scored.length ? scored.reduce((a, b) => (b.accuracy! < a.accuracy! ? b : a)) : null;

  const max = Math.max(0, ...players.map((p) => p.score));
  const width = max > 0 ? max / DISTRIBUTION_BUCKETS : 1;
  const distribution = Array.from({ length: DISTRIBUTION_BUCKETS }, (_, i) => ({
    from: Math.round(i * width),
    to: Math.round((i + 1) * width),
    count: 0,
  }));
  for (const p of players) {
    const i = Math.min(DISTRIBUTION_BUCKETS - 1, Math.max(0, Math.floor(p.score / width)));
    distribution[i]!.count += 1;
  }

  return {
    participants: players.length,
    answered,
    possible,
    scoredAsked: scoredQuestionCount(questions, questionsAsked),
    accuracy: scoredGiven ? Math.round((correct / scoredGiven) * 100) : null,
    avgScore: players.length ? Math.round(players.reduce((n, p) => n + p.score, 0) / players.length) : null,
    completion: possible ? Math.round((answered / possible) * 100) : null,
    questions: stats,
    hardest,
    distribution,
  };
}

/** One row per participant, one column per asked question — opens cleanly in Excel. */
export function reportToCsv(
  questions: GameResults['questions'],
  players: Pick<GameResults['players'][number], 'nickname' | 'score' | 'rank' | 'correctCount' | 'answers'>[],
  questionsAsked: number,
): string {
  const asked = questions.slice(0, questionsAsked);
  const scoredAsked = scoredQuestionCount(questions, questionsAsked);
  const header = ['Rank', 'Name', 'Score', 'Correct', 'Accuracy %', 'Avg time (s)', ...asked.map((q, i) => `Q${i + 1}: ${q.text}`)];
  const rows = players.map((p) => {
    const n = p.answers.length;
    const scoredN = scoredAnswers(questions, p.answers).length;
    const avg = n ? (p.answers.reduce((t, a) => t + a.timeMs, 0) / n / 1000).toFixed(1) : '';
    return [
      p.rank,
      p.nickname,
      p.score,
      `${p.correctCount}/${scoredAsked}`,
      scoredN ? Math.round((p.correctCount / scoredN) * 100) : '',
      avg,
      ...asked.map((q, i) => {
        const a = p.answers.find((x) => x.q === i);
        if (!a) return '';
        if (!isScored(q.type)) return describeAnswer(q, a);
        const status = a.isCorrect ? 'correct' : a.points > 0 ? 'partly right' : 'wrong';
        return `${describeAnswer(q, a)} (${status}, ${a.points} pts, ${(a.timeMs / 1000).toFixed(1)} s)`;
      }),
    ];
  });
  return toCsv([header, ...rows]);
}
