import { z } from 'zod';
import { toCsv } from './csv';

export const FIELD_TYPES = [
  'short_text',
  'long_text',
  'single',
  'checkboxes',
  'dropdown',
  'rating',
  'stars',
  'scale',
  'yes_no',
  'number',
  'date',
  'datetime',
  'email',
  'phone',
  'file',
  'image',
  'document',
  'audio',
  'video',
  'matrix',
  'ranking',
  'consent',
  'heading',
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  short_text: 'Short text',
  long_text: 'Long text',
  single: 'Single select',
  checkboxes: 'Checkboxes',
  dropdown: 'Dropdown',
  rating: 'Rating',
  stars: 'Star rating',
  scale: 'Linear scale',
  yes_no: 'Yes / No',
  number: 'Number',
  date: 'Date',
  datetime: 'Date & time',
  email: 'Email',
  phone: 'Phone',
  file: 'Any file',
  image: 'Image upload',
  document: 'Document upload',
  audio: 'Audio upload',
  video: 'Video upload',
  matrix: 'Matrix grid',
  ranking: 'Ranking',
  consent: 'Consent',
  heading: 'Section heading',
};

/** Types whose answer is one or more of the field's choices. */
export function hasChoices(type: FieldType) {
  return type === 'single' || type === 'checkboxes' || type === 'dropdown' || type === 'matrix' || type === 'ranking';
}

export function isUpload(type: FieldType) {
  return type === 'file' || type === 'image' || type === 'document' || type === 'audio' || type === 'video';
}

export const FORM_TITLE_MAX = 120;
export const FORM_DESCRIPTION_MAX = 1000;
export const FIELD_LABEL_MAX = 300;
export const FIELD_DESCRIPTION_MAX = 1000;
export const CHOICE_LABEL_MAX = 200;
export const CONDITION_VALUE_MAX = 200;
export const MAX_FIELDS = 100;
export const MAX_CHOICES = 30;
export const MAX_FILES = 10;
export const MAX_FILE_MB = 25;
export const CONDITION_OPS = ['equals', 'not_equals', 'contains'] as const;
export const CONDITION_OP_LABELS: Record<(typeof CONDITION_OPS)[number], string> = {
  equals: 'Equals',
  not_equals: 'Does not equal',
  contains: 'Contains',
};

const Id = z.string().min(1).max(40);
const Choice = z.object({ id: Id, label: z.string().max(CHOICE_LABEL_MAX) });

export const FormField = z.object({
  id: Id,
  type: z.enum(FIELD_TYPES),
  label: z.string().max(FIELD_LABEL_MAX),
  description: z.string().max(FIELD_DESCRIPTION_MAX).default(''),
  required: z.boolean().default(false),
  /** Choice types: the options; matrix: the columns. */
  choices: z.array(Choice).max(MAX_CHOICES).default([]),
  /** Matrix grid rows. */
  rows: z.array(Choice).max(MAX_CHOICES).default([]),
  maxFiles: z.number().int().min(1).max(MAX_FILES).default(1),
  maxMb: z.number().int().min(1).max(MAX_FILE_MB).default(10),
  /** Show this field only when another field's answer matches. */
  condition: z
    .object({ fieldId: Id, op: z.enum(CONDITION_OPS), value: z.string().max(CONDITION_VALUE_MAX) })
    .nullable()
    .default(null),
});
export type FormField = z.infer<typeof FormField>;

export const FormFields = z.array(FormField).max(MAX_FIELDS);

export const FeedbackFormSave = z.object({
  title: z.string().max(FORM_TITLE_MAX),
  description: z.string().max(FORM_DESCRIPTION_MAX),
  fields: FormFields,
});
export type FeedbackFormSave = z.input<typeof FeedbackFormSave>;

const choice = (label: string, id: string) => ({ id, label });

export function newField(type: FieldType, id: string, makeId: () => string = () => Math.random().toString(36).slice(2, 12)): FormField {
  const choices = hasChoices(type) ? [choice('Option 1', makeId()), choice('Option 2', makeId())] : [];
  return {
    id,
    type,
    label: type === 'heading' ? 'Section heading' : 'Untitled question',
    description: '',
    required: false,
    choices,
    rows: type === 'matrix' ? [choice('Row 1', makeId())] : [],
    maxFiles: 1,
    maxMb: 10,
    condition: null,
  };
}

/** Where the feedback step sits in an event's participant journey. */
export const EVENT_FLOWS = ['before', 'after', 'both', 'optional', 'quiz_only'] as const;
export type EventFlow = (typeof EVENT_FLOWS)[number];

export const EVENT_FLOW_INFO: Record<EventFlow, { label: string; badge: string; description: string }> = {
  before: { label: 'Feedback, then quiz', badge: 'Feedback first', description: 'Collect feedback first; everyone then waits in the lobby.' },
  after: { label: 'Quiz, then feedback', badge: 'Feedback after', description: 'Play the quiz first and gather reflections at the end.' },
  both: { label: 'Before and after', badge: 'Before + after', description: 'Use one form before the quiz and another after it.' },
  optional: { label: 'Optional feedback', badge: 'Optional feedback', description: 'Participants can skip the form and go straight to the lobby.' },
  quiz_only: { label: 'Quiz only', badge: 'Quiz only', description: 'Run the event without a feedback step.' },
};

export const EVENT_IDENTITIES = ['identified', 'partial', 'anonymous'] as const;
export type EventIdentity = (typeof EVENT_IDENTITIES)[number];

export const EVENT_IDENTITY_INFO: Record<EventIdentity, { label: string; description: string }> = {
  identified: { label: 'Named', description: 'Feedback is linked to each player’s nickname and quiz score.' },
  partial: { label: 'Nickname only', description: 'Nicknames are kept, but feedback isn’t linked to quiz scores.' },
  anonymous: { label: 'Anonymous', description: 'Responses are stored without any participant name.' },
};

export const DEFAULT_EVENT_TITLE = 'Untitled interactive event';

export const FeedbackEventInput = z
  .object({
    title: z.string().trim().max(FORM_TITLE_MAX),
    description: z.string().trim().max(FORM_DESCRIPTION_MAX),
    quizId: z.uuid({ message: 'Choose a quiz.' }),
    formId: z.uuid().nullable(),
    /** The second form when the flow is 'both'. */
    afterFormId: z.uuid().nullable(),
    flow: z.enum(EVENT_FLOWS),
    identity: z.enum(EVENT_IDENTITIES),
    feedbackRequired: z.boolean(),
    allowLateEntry: z.boolean(),
  })
  .superRefine((e, ctx) => {
    if (e.flow !== 'quiz_only' && !e.formId) ctx.addIssue({ code: 'custom', path: ['formId'], message: 'Choose a feedback form.' });
    if (e.flow === 'both' && !e.afterFormId)
      ctx.addIssue({ code: 'custom', path: ['afterFormId'], message: 'Choose the form for after the quiz.' });
  })
  .transform((e) => ({
    ...e,
    title: e.title || DEFAULT_EVENT_TITLE,
    formId: e.flow === 'quiz_only' ? null : e.formId,
    afterFormId: e.flow === 'both' ? e.afterFormId : null,
    feedbackRequired: e.flow === 'before' || e.flow === 'after' || e.flow === 'both' ? e.feedbackRequired : false,
  }));
export type FeedbackEventInput = z.input<typeof FeedbackEventInput>;

export type FeedbackAnswer = string | number | boolean | string[] | Record<string, string>;
export type FeedbackAnswers = Record<string, FeedbackAnswer>;
export type AnswerProblem = 'required' | 'invalid';

/** Lowest and highest value of the number-button field types. */
export const SCALE_RANGE = { rating: [1, 5], stars: [1, 5], scale: [1, 10] } as const satisfies Partial<Record<FieldType, readonly [number, number]>>;
export const TEXT_ANSWER_MAX = { short_text: 300, long_text: 3000 } as const;
const NUMBER_LIMIT = 1e12;

/** Uploads arrive in a later step, so for now participants only answer the other types. */
export function collectsAnswer(type: FieldType) {
  return type !== 'heading' && !isUpload(type);
}

function labelOf(list: FormField['choices'], id: string) {
  return list.find((c) => c.id === id)?.label ?? '';
}

/** Human-readable answer, used by conditions and spreadsheets. */
export function answerText(field: FormField, value: FeedbackAnswer | undefined): string {
  if (value === undefined || value === null) return '';
  switch (field.type) {
    case 'single':
    case 'dropdown':
      return typeof value === 'string' ? labelOf(field.choices, value) : '';
    case 'checkboxes':
      return Array.isArray(value) ? value.map((id) => labelOf(field.choices, id)).join('; ') : '';
    case 'ranking':
      return Array.isArray(value) ? value.map((id) => labelOf(field.choices, id)).join(' > ') : '';
    case 'matrix':
      return typeof value === 'object' && !Array.isArray(value)
        ? field.rows
            .filter((r) => value[r.id])
            .map((r) => `${r.label}: ${labelOf(field.choices, value[r.id]!)}`)
            .join('; ')
        : '';
    case 'yes_no':
      return value === 'yes' ? 'Yes' : value === 'no' ? 'No' : '';
    case 'consent':
      return value === true ? 'Agreed' : '';
    default:
      return String(value);
  }
}

function conditionMet(field: FormField, answers: FeedbackAnswers, byId: Map<string, FormField>, depth: number): boolean {
  const cond = field.condition;
  if (!cond) return true;
  const source = byId.get(cond.fieldId);
  // A condition on a deleted question no longer applies.
  if (!source) return true;
  if (depth > MAX_FIELDS || !conditionMet(source, answers, byId, depth + 1)) return false;
  const value = answers[source.id];
  const target = cond.value.trim().toLocaleLowerCase();
  const parts =
    source.type === 'checkboxes' && Array.isArray(value)
      ? value.map((id) => labelOf(source.choices, id).trim().toLocaleLowerCase())
      : [answerText(source, value).trim().toLocaleLowerCase()];
  if (cond.op === 'contains') return parts.some((p) => p.includes(target));
  const equal = parts.some((p) => p === target);
  return cond.op === 'equals' ? equal : !equal;
}

/** The fields a participant sees, given what they've answered so far. */
export function visibleFields(fields: FormField[], answers: FeedbackAnswers) {
  const byId = new Map(fields.map((f) => [f.id, f]));
  return fields.filter((f) => conditionMet(f, answers, byId, 0));
}

function isEmpty(value: unknown) {
  if (value === undefined || value === null || value === '' || value === false) return true;
  if (Array.isArray(value)) return value.length === 0;
  return typeof value === 'object' && Object.keys(value).length === 0;
}

function cleanAnswer(field: FormField, raw: unknown): FeedbackAnswer | undefined | 'invalid' {
  if (isEmpty(raw)) return undefined;
  const choiceIds = new Set(field.choices.map((c) => c.id));
  const str = typeof raw === 'string' ? raw.trim() : null;
  switch (field.type) {
    case 'short_text':
    case 'long_text':
      if (str === null) return 'invalid';
      if (!str) return undefined;
      return str.length <= TEXT_ANSWER_MAX[field.type] ? str : 'invalid';
    case 'email':
      return str && str.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str) ? str : 'invalid';
    case 'phone':
      return str && /^\+?[0-9][0-9 ()-]{4,19}$/.test(str) ? str : 'invalid';
    case 'number': {
      const n = typeof raw === 'number' ? raw : str ? Number(str) : NaN;
      return Number.isFinite(n) && Math.abs(n) <= NUMBER_LIMIT ? n : 'invalid';
    }
    case 'date':
      return str && /^\d{4}-\d{2}-\d{2}$/.test(str) && !Number.isNaN(Date.parse(str)) ? str : 'invalid';
    case 'datetime':
      return str && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(str) && !Number.isNaN(Date.parse(str)) ? str : 'invalid';
    case 'rating':
    case 'stars':
    case 'scale': {
      const [min, max] = SCALE_RANGE[field.type];
      return typeof raw === 'number' && Number.isInteger(raw) && raw >= min && raw <= max ? raw : 'invalid';
    }
    case 'yes_no':
      return raw === 'yes' || raw === 'no' ? raw : 'invalid';
    case 'consent':
      return raw === true ? true : 'invalid';
    case 'single':
    case 'dropdown':
      return str && choiceIds.has(str) ? str : 'invalid';
    case 'checkboxes':
      return Array.isArray(raw) && raw.every((id) => typeof id === 'string' && choiceIds.has(id)) && new Set(raw).size === raw.length
        ? (raw as string[])
        : 'invalid';
    case 'ranking':
      return Array.isArray(raw) && raw.length === choiceIds.size && new Set(raw).size === raw.length && raw.every((id) => choiceIds.has(id as string))
        ? (raw as string[])
        : 'invalid';
    case 'matrix': {
      if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return 'invalid';
      const rowIds = new Set(field.rows.map((r) => r.id));
      const entries = Object.entries(raw);
      if (!entries.every(([row, col]) => rowIds.has(row) && typeof col === 'string' && choiceIds.has(col))) return 'invalid';
      if (field.required && entries.length < rowIds.size) return 'invalid';
      return Object.fromEntries(entries) as Record<string, string>;
    }
    default:
      return undefined;
  }
}

/** Checks a participant's answers against the form. Hidden questions are dropped. */
export function checkFeedback(
  fields: FormField[],
  raw: unknown,
): { ok: true; answers: FeedbackAnswers } | { ok: false; problems: Record<string, AnswerProblem> } {
  const input = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const cleaned: FeedbackAnswers = {};
  const invalid = new Set<string>();
  for (const field of fields) {
    if (!collectsAnswer(field.type)) continue;
    const value = cleanAnswer(field, input[field.id]);
    if (value === 'invalid') invalid.add(field.id);
    else if (value !== undefined) cleaned[field.id] = value;
  }
  const answers: FeedbackAnswers = {};
  const problems: Record<string, AnswerProblem> = {};
  for (const field of visibleFields(fields, cleaned)) {
    if (!collectsAnswer(field.type)) continue;
    if (invalid.has(field.id)) problems[field.id] = 'invalid';
    else if (cleaned[field.id] !== undefined) answers[field.id] = cleaned[field.id]!;
    else if (field.required) problems[field.id] = 'required';
  }
  return Object.keys(problems).length ? { ok: false, problems } : { ok: true, answers };
}

export type QuestionSummary =
  | { kind: 'scale'; field: FormField; answered: number; average: number; counts: { label: string; n: number }[] }
  | { kind: 'choices'; field: FormField; answered: number; counts: { label: string; n: number }[] }
  | { kind: 'grid'; field: FormField; answered: number; rows: { label: string; counts: { label: string; n: number }[] }[] }
  | { kind: 'ranking'; field: FormField; answered: number; order: { label: string; averagePlace: number }[] }
  | { kind: 'number'; field: FormField; answered: number; average: number; min: number; max: number }
  | { kind: 'text'; field: FormField; answered: number; latest: { text: string; name: string | null }[] };

const LATEST_TEXTS = 50;

/** Per-question summary of many submissions, newest last, for the host's responses page. */
export function summarizeResponses(fields: FormField[], submissions: { answers: FeedbackAnswers; name: string | null }[]): QuestionSummary[] {
  return fields
    .filter((f) => collectsAnswer(f.type))
    .map((field): QuestionSummary => {
      const given = submissions.filter((s) => s.answers[field.id] !== undefined);
      const values = given.map((s) => s.answers[field.id]!);
      const answered = given.length;
      const tally = (labels: { id: string; label: string }[], picked: string[][]) =>
        labels.map((c) => ({ label: c.label, n: picked.filter((p) => p.includes(c.id)).length }));
      switch (field.type) {
        case 'rating':
        case 'stars':
        case 'scale': {
          const [min, max] = SCALE_RANGE[field.type];
          const nums = values.filter((v): v is number => typeof v === 'number');
          return {
            kind: 'scale',
            field,
            answered,
            average: nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0,
            counts: Array.from({ length: max - min + 1 }, (_, i) => ({ label: String(min + i), n: nums.filter((v) => v === min + i).length })),
          };
        }
        case 'single':
        case 'dropdown':
          return { kind: 'choices', field, answered, counts: tally(field.choices, values.map((v) => [v as string])) };
        case 'checkboxes':
          return { kind: 'choices', field, answered, counts: tally(field.choices, values.map((v) => (Array.isArray(v) ? v : []))) };
        case 'yes_no':
          return {
            kind: 'choices',
            field,
            answered,
            counts: [
              { label: 'Yes', n: values.filter((v) => v === 'yes').length },
              { label: 'No', n: values.filter((v) => v === 'no').length },
            ],
          };
        case 'consent':
          return { kind: 'choices', field, answered, counts: [{ label: 'Agreed', n: values.filter((v) => v === true).length }] };
        case 'matrix': {
          const grids = values.filter((v): v is Record<string, string> => typeof v === 'object' && v !== null && !Array.isArray(v));
          return {
            kind: 'grid',
            field,
            answered,
            rows: field.rows.map((r) => ({ label: r.label, counts: tally(field.choices, grids.map((g) => (g[r.id] ? [g[r.id]!] : []))) })),
          };
        }
        case 'ranking': {
          const orders = values.filter((v): v is string[] => Array.isArray(v));
          const order = field.choices
            .map((c) => {
              const places = orders.map((o) => o.indexOf(c.id)).filter((i) => i >= 0);
              return { label: c.label, averagePlace: places.length ? places.reduce((a, b) => a + b + 1, 0) / places.length : 0 };
            })
            .sort((a, b) => a.averagePlace - b.averagePlace);
          return { kind: 'ranking', field, answered, order };
        }
        case 'number': {
          const nums = values.filter((v): v is number => typeof v === 'number');
          return {
            kind: 'number',
            field,
            answered,
            average: nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0,
            min: nums.length ? Math.min(...nums) : 0,
            max: nums.length ? Math.max(...nums) : 0,
          };
        }
        default:
          return {
            kind: 'text',
            field,
            answered,
            latest: given.slice(-LATEST_TEXTS).reverse().map((s) => ({ text: answerText(field, s.answers[field.id]), name: s.name })),
          };
      }
    });
}

type CsvSubmission = { sessionId: string; stage: 'before' | 'after'; nickname: string | null; submittedAt: string; answers: FeedbackAnswers };

export interface EventCsvInput {
  identity: EventIdentity;
  beforeFields: FormField[];
  afterFields: FormField[];
  sessions: { id: string; label: string }[];
  players: { sessionId: string; nickname: string; score: number; rank: number; correctCount: number }[];
  submissions: CsvSubmission[];
}

/** Spreadsheet header for a question, with the scale for number-button types. */
export function questionHeading(f: FormField) {
  const label = f.label.trim() || 'Untitled question';
  return f.type in SCALE_RANGE ? `${label} (${SCALE_RANGE[f.type as keyof typeof SCALE_RANGE].join('\u2013')})` : label;
}

/** One row per participant: quiz results (when the event links them) beside their before and after feedback. */
export function eventFeedbackCsv({ identity, beforeFields, afterFields, sessions, players, submissions }: EventCsvInput): string {
  const beforeCols = beforeFields.filter((f) => collectsAnswer(f.type));
  const afterCols = afterFields.filter((f) => collectsAnswer(f.type));
  const both = beforeCols.length > 0 && afterCols.length > 0;
  const header = [
    'Session',
    'Name',
    'Quiz rank',
    'Quiz score',
    'Correct answers',
    'Gave feedback',
    ...(beforeCols.length ? [both ? 'Before-quiz feedback at' : 'Feedback submitted at', ...beforeCols.map(questionHeading)] : []),
    ...(afterCols.length ? [both ? 'After-quiz feedback at' : 'Feedback submitted at', ...afterCols.map((f) => (both ? `After: ${questionHeading(f)}` : questionHeading(f)))] : []),
  ];
  const stageCells = (cols: FormField[], s?: CsvSubmission) =>
    cols.length ? [s?.submittedAt ?? '', ...cols.map((f) => (s ? answerText(f, s.answers[f.id]) : ''))] : [];
  const feedbackCells = (before?: CsvSubmission, after?: CsvSubmission) => [
    before || after ? 'Yes' : 'No',
    ...stageCells(beforeCols, before),
    ...stageCells(afterCols, after),
  ];
  const key = (name: string | null) => name?.toLocaleLowerCase() ?? '';
  const rows: (string | number)[][] = [];
  for (const session of sessions) {
    const own = submissions.filter((s) => s.sessionId === session.id);
    if (identity === 'anonymous') {
      // Nothing links an anonymous person's two forms, so each submission is its own row.
      for (const s of own) rows.push([session.label, '', '', '', '', ...(s.stage === 'before' ? feedbackCells(s) : feedbackCells(undefined, s))]);
      continue;
    }
    const people = new Map<string, { name: string; before?: CsvSubmission; after?: CsvSubmission }>();
    for (const s of own) {
      const person = people.get(key(s.nickname)) ?? { name: s.nickname ?? '' };
      person[s.stage] ??= s;
      people.set(key(s.nickname), person);
    }
    if (identity === 'identified') {
      for (const p of players.filter((x) => x.sessionId === session.id)) {
        const person = people.get(key(p.nickname));
        people.delete(key(p.nickname));
        rows.push([session.label, p.nickname, p.rank, p.score, p.correctCount, ...feedbackCells(person?.before, person?.after)]);
      }
    }
    // Partial identity never shows scores; identified feedback from people without saved results lands here too.
    for (const person of people.values()) rows.push([session.label, person.name, '', '', '', ...feedbackCells(person.before, person.after)]);
  }
  return toCsv([header, ...rows]);
}
