import { z } from 'zod';

export const QUESTION_TYPES = ['mc', 'multi', 'tf', 'text', 'blanks', 'numeric', 'order', 'poll', 'rating'] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];
export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  mc: 'Multiple choice',
  multi: 'Multi-select',
  tf: 'True or false',
  text: 'Type answer',
  blanks: 'Fill in the blanks',
  numeric: 'Numeric',
  order: 'Put in order',
  poll: 'Poll',
  rating: 'Rating scale',
};

/** Types where players pick from the question's options. */
export function usesOptions(type: QuestionType) {
  return type === 'mc' || type === 'multi' || type === 'tf' || type === 'poll';
}

/** Opinion questions have no right answer and never change scores. */
export function isScored(type: QuestionType) {
  return type !== 'rating' && type !== 'poll';
}

export const RATING_MIN_VALUES = [0, 1] as const;
export const RATING_MAX_VALUES = [3, 4, 5, 6, 7, 8, 9, 10] as const;
export const TIME_LIMITS_S = [5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 300] as const;
export const POINT_VALUES = [0, 100, 250, 500, 1000, 2000] as const;
export const PENALTY_VALUES = [0, 100, 250, 500, 1000] as const;
export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export const MAX_OPTIONS = 6;
export const MIN_OPTIONS = 2;
export const MAX_QUESTIONS = 100;
export const QUESTION_TEXT_MAX = 300;
export const OPTION_TEXT_MAX = 120;
export const QUIZ_TITLE_MAX = 120;
export const IMAGE_URL_MAX = 500;
export const HINT_MAX = 500;
export const EXPLANATION_MAX = 2000;
export const TAGS_MAX = 400;
export const TRUE_FALSE_OPTIONS = ['True', 'False'];
export const ANSWER_TEXT_MAX = 200;
export const MAX_ACCEPTED = 10;
export const MAX_BLANKS = 10;
export const NUMBER_LIMIT = 1e12;

/** Three or more underscores in the question text mark a blank. */
const BLANK = /_{3,}/g;

export function countBlanks(text: string) {
  return (text.match(BLANK) ?? []).length;
}

/** The question text around its blanks: always one more piece than there are blanks. */
export function splitBlanks(text: string) {
  return text.split(BLANK);
}

/** Reads what a player typed as a number: "1.5", "1,5", "-3", "1,000" or "2e3". */
export function parseNumberAnswer(value: string): number | null {
  let t = value.trim().replace(/[\s\u00a0]/g, '');
  if (/^[-+]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) t = t.replace(/,/g, '');
  else if (!t.includes('.')) t = t.replace(',', '.');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) && Math.abs(n) <= NUMBER_LIMIT ? n : null;
}

export function isNumberMatch(value: number, answer: number, tolerance: number) {
  // A tiny allowance so 0.1 + 0.2 style rounding never turns a right answer wrong.
  return Math.abs(value - answer) <= tolerance + 1e-9 * Math.max(1, Math.abs(answer));
}

export function formatNumberAnswer(answer: number, tolerance: number) {
  return tolerance > 0 ? `${answer} ± ${tolerance}` : String(answer);
}

/** How typed answers are compared: spacing never matters, letter case only when asked. */
export function normaliseAnswer(value: string, caseSensitive = false) {
  const clean = value.normalize('NFC').trim().replace(/\s+/g, ' ');
  return caseSensitive ? clean : clean.toLocaleLowerCase();
}

export function isAcceptedAnswer(value: string, accepted: string[], caseSensitive = false) {
  const given = normaliseAnswer(value, caseSensitive);
  return given !== '' && accepted.some((a) => normaliseAnswer(a, caseSensitive) === given);
}

/** How many blanks were filled with one of their accepted answers. */
export function blanksRight(given: string[], blanks: string[][], caseSensitive = false) {
  return blanks.filter((accepted, i) => isAcceptedAnswer(given[i] ?? '', accepted, caseSensitive)).length;
}

export const VISIBILITIES = ['private', 'unlisted', 'public'] as const;
export const QUIZ_LANGUAGES = ['en', 'hi', 'mr', 'other'] as const;
export const SCORING_MODES = ['speed', 'accuracy'] as const;
export const GRACE_MS_VALUES = [0, 250, 500, 750, 1000, 2000, 3000] as const;
export const THEME_SWATCHES = ['#6d4aff', '#e8425a', '#0ea595', '#c4500b', '#0067a5', '#9a4a82', '#14112b'] as const;
export const DEFAULT_THEME = THEME_SWATCHES[0];
export const DESCRIPTION_MAX = 2000;
export const SUBJECT_MAX = 80;
export const ORG_NAME_MAX = 120;
export const MESSAGE_MAX = 500;

const Grace = z
  .number()
  .int()
  .refine((g) => (GRACE_MS_VALUES as readonly number[]).includes(g), 'Unsupported grace period');
const HexColour = z.string().regex(/^#[0-9a-f]{6}$/i);

/** What changes how a live game plays out; carried to the game server with the quiz. */
export const GameRules = z.object({
  scoring: z.enum(SCORING_MODES).default('speed'),
  gamification: z.boolean().default(true),
  streakBonus: z.boolean().default(true),
  showLeaderboard: z.boolean().default(true),
  showCorrect: z.boolean().default(true),
  shuffleQuestions: z.boolean().default(false),
  shuffleOptions: z.boolean().default(false),
  graceMs: Grace.default(750),
  orgName: z.string().trim().max(ORG_NAME_MAX).default(''),
  themeColour: HexColour.default(DEFAULT_THEME),
  welcomeMessage: z.string().trim().max(MESSAGE_MAX).default(''),
  completionMessage: z.string().trim().max(MESSAGE_MAX).default(''),
});
export type GameRules = z.infer<typeof GameRules>;

/** Everything in the quiz settings dialog except the description, which has its own column. */
export const QuizSettings = GameRules.extend({
  subject: z.string().max(SUBJECT_MAX).default(''),
  language: z.enum(QUIZ_LANGUAGES).default('en'),
  tags: z.string().max(TAGS_MAX).default(''),
  visibility: z.enum(VISIBILITIES).default('private'),
  orgName: z.string().max(ORG_NAME_MAX).default(''),
  welcomeMessage: z.string().max(MESSAGE_MAX).default(''),
  completionMessage: z.string().max(MESSAGE_MAX).default(''),
});
export type QuizSettings = z.infer<typeof QuizSettings>;

export function defaultQuizSettings(): QuizSettings {
  return QuizSettings.parse({});
}

/** Only plain web links: blocks javascript:, data: and relative URLs. */
export function isImageUrl(value: string) {
  if (!/^https?:\/\//i.test(value)) return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

const TimeLimitMs = z
  .number()
  .int()
  .refine((ms) => (TIME_LIMITS_S as readonly number[]).includes(ms / 1000), 'Unsupported time limit');
const Points = z
  .number()
  .int()
  .refine((p) => (POINT_VALUES as readonly number[]).includes(p), 'Unsupported points value');
const Penalty = z
  .number()
  .int()
  .refine((p) => (PENALTY_VALUES as readonly number[]).includes(p), 'Unsupported penalty');
const NumberValue = z.number().finite().min(-NUMBER_LIMIT).max(NUMBER_LIMIT);
const RatingMin = z
  .number()
  .int()
  .refine((n) => (RATING_MIN_VALUES as readonly number[]).includes(n), 'Unsupported scale start');
const RatingMax = z
  .number()
  .int()
  .refine((n) => (RATING_MAX_VALUES as readonly number[]).includes(n), 'Unsupported scale end');

/** A question as saved by the editor. Drafts may be incomplete; fields added later default for older saves. */
export const DraftQuestion = z.object({
  id: z.string().min(1).max(40),
  type: z.enum(QUESTION_TYPES),
  text: z.string().max(QUESTION_TEXT_MAX),
  options: z.array(z.string().max(OPTION_TEXT_MAX)).min(MIN_OPTIONS).max(MAX_OPTIONS),
  correct: z.array(z.number().int().min(0).max(MAX_OPTIONS - 1)).max(MAX_OPTIONS),
  /** Type-answer questions only. */
  accepted: z.array(z.string().max(ANSWER_TEXT_MAX)).max(MAX_ACCEPTED).default([]),
  caseSensitive: z.boolean().default(false),
  /** Numeric questions only; null until the host enters it. */
  numericAnswer: NumberValue.nullable().default(null),
  tolerance: NumberValue.min(0).default(0),
  /** Fill-in-the-blanks: accepted answers for each blank, in order. */
  blanks: z.array(z.array(z.string().max(ANSWER_TEXT_MAX)).max(MAX_ACCEPTED)).max(MAX_BLANKS).default([]),
  /** Fill in the blanks and put in order: share of the points for each part that is right. */
  partialCredit: z.boolean().default(true),
  ratingMin: RatingMin.default(1),
  ratingMax: RatingMax.default(5),
  /** Polls only: players may pick more than one option. */
  allowMultiple: z.boolean().default(false),
  timeLimitMs: TimeLimitMs,
  points: Points,
  imageUrl: z.string().max(IMAGE_URL_MAX).default(''),
  penalty: Penalty.default(0),
  difficulty: z.enum(DIFFICULTIES).default('medium'),
  hint: z.string().max(HINT_MAX).default(''),
  explanation: z.string().max(EXPLANATION_MAX).default(''),
  tags: z.string().max(TAGS_MAX).default(''),
});
export type DraftQuestion = z.infer<typeof DraftQuestion>;

export const DraftQuestions = z.array(DraftQuestion).max(MAX_QUESTIONS);

/** A quiz that is complete enough to play. This is all the game server ever receives. */
const PlayableQuestion = z
  .object({
    type: z.enum(QUESTION_TYPES),
    text: z.string().trim().min(1).max(QUESTION_TEXT_MAX),
    options: z.array(z.string().trim().min(1).max(OPTION_TEXT_MAX)).max(MAX_OPTIONS),
    correct: z.array(z.number().int().min(0).max(MAX_OPTIONS - 1)).max(MAX_OPTIONS),
    accepted: z.array(z.string().trim().min(1).max(ANSWER_TEXT_MAX)).max(MAX_ACCEPTED).default([]),
    caseSensitive: z.boolean().default(false),
    numericAnswer: NumberValue.nullable().default(null),
    tolerance: NumberValue.min(0).default(0),
    blanks: z
      .array(z.array(z.string().trim().min(1).max(ANSWER_TEXT_MAX)).min(1).max(MAX_ACCEPTED))
      .max(MAX_BLANKS)
      .default([]),
    partialCredit: z.boolean().default(true),
    ratingMin: RatingMin.default(1),
    ratingMax: RatingMax.default(5),
    allowMultiple: z.boolean().default(false),
    timeLimitMs: TimeLimitMs,
    points: Points,
    imageUrl: z.string().max(IMAGE_URL_MAX).refine((u) => u === '' || isImageUrl(u), 'Invalid image link').default(''),
    penalty: Penalty.default(0),
    hint: z.string().trim().max(HINT_MAX).default(''),
    explanation: z.string().trim().max(EXPLANATION_MAX).default(''),
  })
  .superRefine((q, ctx) => {
    const problem = (message: string) => ctx.addIssue({ code: 'custom', message });
    if (q.correct.some((c) => c >= q.options.length)) problem('A correct answer points at a missing option');
    if (new Set(q.correct).size !== q.correct.length) problem('Duplicate correct answers');
    if (q.type === 'order') {
      // Options are the items; `correct` lists them in the right order.
      if (q.options.length < MIN_OPTIONS || q.correct.length !== q.options.length) problem('Put at least two items in order');
      return;
    }
    if (!usesOptions(q.type) && (q.options.length !== 0 || q.correct.length !== 0)) problem('This question type has no options');
    if (q.type === 'rating') return;
    if (q.type === 'text') {
      if (q.accepted.length === 0) problem('Add at least one accepted answer');
      return;
    }
    if (q.type === 'numeric') {
      if (q.numericAnswer === null) problem('Enter the correct number');
      return;
    }
    if (q.type === 'blanks') {
      const count = countBlanks(q.text);
      if (count === 0 || count !== q.blanks.length) problem('Each ___ in the text needs its own accepted answers');
      return;
    }
    if (q.options.length < MIN_OPTIONS) problem('Add at least two options');
    if (q.type === 'poll') {
      if (q.correct.length !== 0) problem('Polls have no correct answer');
      return;
    }
    if (q.type === 'multi' ? q.correct.length === 0 : q.correct.length !== 1) problem('Wrong number of correct answers');
  });

export const PlayableQuiz = z.object({
  title: z.string().trim().min(1).max(QUIZ_TITLE_MAX),
  questions: z.array(PlayableQuestion).min(1).max(MAX_QUESTIONS),
  rules: GameRules.default(() => GameRules.parse({})),
});
export type PlayableQuiz = z.infer<typeof PlayableQuiz>;
export type PlayableQuizInput = z.input<typeof PlayableQuiz>;

export function newQuestion(type: DraftQuestion['type'] = 'mc', id = Math.random().toString(36).slice(2, 12)): DraftQuestion {
  return {
    id,
    type,
    text: '',
    options: type === 'tf' ? [...TRUE_FALSE_OPTIONS] : type === 'order' ? ['', '', ''] : ['', '', '', ''],
    correct: usesOptions(type) && type !== 'poll' ? [0] : [],
    accepted: type === 'text' ? [''] : [],
    caseSensitive: false,
    numericAnswer: null,
    tolerance: 0,
    blanks: [],
    partialCredit: true,
    ratingMin: 1,
    ratingMax: 5,
    allowMultiple: false,
    timeLimitMs: 20_000,
    points: isScored(type) ? 1000 : 0,
    imageUrl: '',
    penalty: 0,
    difficulty: 'medium',
    hint: '',
    explanation: '',
    tags: '',
  };
}

/** Problems that stop a question from being played, in the order a host should fix them. */
export function questionIssues(q: DraftQuestion): string[] {
  const issues: string[] = [];
  if (!q.text.trim()) issues.push('Add the question text');
  if (q.imageUrl.trim() && !isImageUrl(q.imageUrl.trim())) issues.push('Use an image link that starts with https://');
  if (q.type === 'tf') {
    if (q.correct.length !== 1 || q.correct[0]! > 1) issues.push('Choose True or False as the answer');
    return issues;
  }
  if (q.type === 'text') {
    if (!q.accepted.some((a) => a.trim())) issues.push('Add at least one accepted answer');
    return issues;
  }
  if (q.type === 'numeric') {
    if (q.numericAnswer === null) issues.push('Enter the correct number');
    return issues;
  }
  if (q.type === 'blanks') {
    const count = countBlanks(q.text);
    if (count === 0) issues.push('Use ___ (three underscores) in the question text for each blank');
    else if (count > MAX_BLANKS) issues.push(`Use at most ${MAX_BLANKS} blanks`);
    else {
      for (let i = 0; i < count; i++) {
        if (!q.blanks[i]?.some((a) => a.trim())) issues.push(`Add an answer for blank ${i + 1}`);
      }
    }
    return issues;
  }
  if (q.type === 'rating') {
    if (q.ratingMin >= q.ratingMax) issues.push('The scale must go up from its lowest value');
    return issues;
  }
  const filled = q.options.filter((o) => o.trim()).length;
  if (q.type === 'order') {
    if (filled < MIN_OPTIONS) issues.push('Add at least two items');
    else if (filled < q.options.length) issues.push('Fill in or remove empty items');
    else if (new Set(q.options.map((o) => normaliseAnswer(o))).size < q.options.length) issues.push('Make every item different');
    return issues;
  }
  if (filled < MIN_OPTIONS) {
    issues.push('Add at least two answers');
    return issues;
  }
  if (filled < q.options.length) issues.push('Fill in or remove empty answers');
  if (q.type === 'poll') return issues;
  if (q.type === 'multi') {
    if (q.correct.length === 0) issues.push('Tick at least one correct answer');
    return issues;
  }
  const right = q.correct[0];
  if (right === undefined) issues.push('Mark the correct answer');
  else if (!q.options[right]?.trim()) issues.push('The correct answer is empty');
  return issues;
}

export type QuizCheck =
  | { ok: true; quiz: PlayableQuiz }
  | { ok: false; problems: { index: number; issues: string[] }[]; titleMissing: boolean; empty: boolean };

export function toPlayable(title: string, questions: DraftQuestion[], settings?: QuizSettings): QuizCheck {
  const problems = questions
    .map((q, index) => ({ index, issues: questionIssues(q) }))
    .filter((p) => p.issues.length > 0);
  const titleMissing = !title.trim();
  const empty = questions.length === 0;
  if (problems.length || titleMissing || empty) return { ok: false, problems, titleMissing, empty };
  const quiz = PlayableQuiz.parse({
    title: title.trim(),
    questions: questions.map((q) => {
      const text = q.text.trim();
      const cleanList = (list: string[]) => [...new Set(list.map((a) => a.trim()).filter(Boolean))];
      return {
        type: q.type,
        text,
        options: q.type === 'tf' ? [...TRUE_FALSE_OPTIONS] : usesOptions(q.type) || q.type === 'order' ? q.options.map((o) => o.trim()) : [],
        correct:
          q.type === 'order'
            ? q.options.map((_, i) => i)
            : !usesOptions(q.type) || q.type === 'poll'
              ? []
              : q.type === 'multi'
                ? [...new Set(q.correct)].sort((a, b) => a - b)
                : q.correct,
        accepted: q.type === 'text' ? cleanList(q.accepted) : [],
        caseSensitive: (q.type === 'text' || q.type === 'blanks') && q.caseSensitive,
        numericAnswer: q.type === 'numeric' ? q.numericAnswer : null,
        tolerance: q.type === 'numeric' ? q.tolerance : 0,
        blanks: q.type === 'blanks' ? q.blanks.slice(0, countBlanks(text)).map(cleanList) : [],
        partialCredit: (q.type === 'blanks' || q.type === 'order') && q.partialCredit,
        ratingMin: q.ratingMin,
        ratingMax: q.ratingMax,
        allowMultiple: q.type === 'poll' && q.allowMultiple,
        timeLimitMs: q.timeLimitMs,
        points: isScored(q.type) ? q.points : 0,
        imageUrl: q.imageUrl.trim(),
        penalty: isScored(q.type) ? q.penalty : 0,
        hint: q.hint,
        explanation: q.explanation,
      };
    }),
    rules: settings ? GameRules.parse(settings) : undefined,
  });
  return { ok: true, quiz };
}
