import { z } from 'zod';

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
