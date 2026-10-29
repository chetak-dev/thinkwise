import { sql } from 'drizzle-orm';
import { boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const organisations = pgTable('organisations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  brandColor: text('brand_color').notNull().default('#6d4aff'),
  logoUrl: text('logo_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Always stored lower-cased and trimmed. */
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  /** Null for accounts that only sign in with Google. */
  passwordHash: text('password_hash'),
  /** Google's stable account id (the OpenID `sub`), once linked. */
  googleId: text('google_id').unique(),
  role: text('role', { enum: ['host', 'org_admin'] }).notNull().default('host'),
  orgId: uuid('org_id').references(() => organisations.id, { onDelete: 'set null' }),
  locale: text('locale').notNull().default('en'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable(
  'sessions',
  {
    /** SHA-256 of the cookie token; the raw token is never stored. */
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').references(() => organisations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    meta: jsonb('meta'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('audit_org_created_idx').on(t.orgId, t.createdAt)],
);

export type User = typeof users.$inferSelect;
export type Organisation = typeof organisations.$inferSelect;

export const quizzes = pgTable(
  'quizzes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    orgId: uuid('org_id').references(() => organisations.id, { onDelete: 'set null' }),
    title: text('title').notNull().default('Untitled quiz'),
    description: text('description').notNull().default(''),
    /** Editor draft: DraftQuestion[] from @thinkwise/shared, validated on every save. */
    questions: jsonb('questions').notNull().default([]),
    /** QuizSettings from @thinkwise/shared; missing keys fall back to schema defaults on read. */
    settings: jsonb('settings').notNull().default({}),
    status: text('status', { enum: ['draft', 'published'] }).notNull().default('draft'),
    /** Frozen PlayableQuiz (+ description) taken at the last publish; drafts keep changing independently. */
    published: jsonb('published'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('quizzes_owner_updated_idx').on(t.ownerId, t.updatedAt)],
);

export type QuizRow = typeof quizzes.$inferSelect;

export const feedbackForms = pgTable(
  'feedback_forms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    orgId: uuid('org_id').references(() => organisations.id, { onDelete: 'set null' }),
    title: text('title').notNull().default('Untitled feedback form'),
    description: text('description').notNull().default(''),
    /** FormField[] from @thinkwise/shared, validated on every save. */
    fields: jsonb('fields').notNull().default([]),
    /** Bumped on every save, so a submission can record which version it answered. */
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('feedback_forms_owner_updated_idx').on(t.ownerId, t.updatedAt)],
);

/** A quiz paired with feedback form(s) into one participant journey. */
export const feedbackEvents = pgTable(
  'feedback_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    orgId: uuid('org_id').references(() => organisations.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    quizId: uuid('quiz_id').references(() => quizzes.id, { onDelete: 'set null' }),
    formId: uuid('form_id').references(() => feedbackForms.id, { onDelete: 'set null' }),
    afterFormId: uuid('after_form_id').references(() => feedbackForms.id, { onDelete: 'set null' }),
    flow: text('flow', { enum: ['before', 'after', 'both', 'optional', 'quiz_only'] }).notNull(),
    identity: text('identity', { enum: ['identified', 'partial', 'anonymous'] }).notNull(),
    feedbackRequired: boolean('feedback_required').notNull().default(true),
    allowLateEntry: boolean('allow_late_entry').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('feedback_events_owner_updated_idx').on(t.ownerId, t.updatedAt)],
);

export const favourites = pgTable(
  'favourites',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    quizId: uuid('quiz_id')
      .notNull()
      .references(() => quizzes.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.quizId] })],
);

/** One hosted game. The id is the game server's game id. */
export const gameSessions = pgTable(
  'game_sessions',
  {
    id: uuid('id').primaryKey(),
    hostId: uuid('host_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    orgId: uuid('org_id').references(() => organisations.id, { onDelete: 'set null' }),
    quizId: uuid('quiz_id').references(() => quizzes.id, { onDelete: 'set null' }),
    eventId: uuid('event_id').references(() => feedbackEvents.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    pin: text('pin').notNull(),
    /** Lets the owner reopen a running lobby from another tab; the game server forgets it once the game ends. */
    hostToken: text('host_token'),
    mode: text('mode', { enum: ['live', 'self'] }).notNull().default('live'),
    status: text('status', { enum: ['live', 'ended', 'abandoned'] }).notNull().default('live'),
    questionCount: integer('question_count').notNull().default(0),
    questionsAsked: integer('questions_asked').notNull().default(0),
    playerCount: integer('player_count').notNull().default(0),
    /** Questions as played (after any shuffle), so reports line up with the answers. */
    questions: jsonb('questions'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /** Self-paced: when participants may start, and when everything closes. */
    opensAt: timestamp('opens_at', { withTimezone: true }),
    closesAt: timestamp('closes_at', { withTimezone: true }),
    /** Self-paced: each participant's own time limit from when they start. */
    timeLimitMs: integer('time_limit_ms'),
    /** Self-paced: the full quiz as played (with answers), shuffled once. Never sent to participants as is. */
    quiz: jsonb('quiz'),
  },
  (t) => [
    index('game_sessions_host_created_idx').on(t.hostId, t.createdAt),
    index('game_sessions_quiz_idx').on(t.quizId),
    index('game_sessions_event_idx').on(t.eventId),
    index('game_sessions_pin_idx').on(t.pin),
  ],
);

/** One participant's go at a self-paced session. Turned into session_players rows when the session closes. */
export const selfAttempts = pgTable(
  'self_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => gameSessions.id, { onDelete: 'cascade' }),
    /** sha256 of the participant's secret token, kept on their device. */
    tokenHash: text('token_hash').notNull().unique(),
    nickname: text('nickname').notNull(),
    avatar: text('avatar').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    /** { [questionIndex]: { o: firstOpenedMs, a: answer, t: savedMs } } */
    answers: jsonb('answers').notNull().default({}),
    score: integer('score').notNull().default(0),
    correctCount: integer('correct_count').notNull().default(0),
  },
  (t) => [
    index('self_attempts_session_idx').on(t.sessionId),
    uniqueIndex('self_attempts_nickname_idx').on(t.sessionId, sql`lower(${t.nickname})`),
  ],
);

export const sessionPlayers = pgTable(
  'session_players',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => gameSessions.id, { onDelete: 'cascade' }),
    nickname: text('nickname').notNull(),
    avatar: text('avatar').notNull(),
    score: integer('score').notNull(),
    rank: integer('rank').notNull(),
    correctCount: integer('correct_count').notNull(),
    /** [{ q, choice, isCorrect, points, timeMs }] */
    answers: jsonb('answers').notNull().default([]),
  },
  (t) => [index('session_players_session_idx').on(t.sessionId)],
);

/** One participant's answers to an event's feedback form in one launch. */
export const feedbackSubmissions = pgTable(
  'feedback_submissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => feedbackEvents.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => gameSessions.id, { onDelete: 'cascade' }),
    formId: uuid('form_id').references(() => feedbackForms.id, { onDelete: 'set null' }),
    formVersion: integer('form_version').notNull(),
    stage: text('stage', { enum: ['before', 'after'] }).notNull(),
    /** Random id from the participant's browser, so a retried submit is stored once. */
    clientId: text('client_id').notNull(),
    /** Null when the event collects anonymous feedback. */
    nickname: text('nickname'),
    /** { [fieldId]: answer } for the visible fields only. */
    answers: jsonb('answers').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('feedback_submissions_once_idx').on(t.sessionId, t.stage, t.clientId),
    index('feedback_submissions_event_idx').on(t.eventId),
  ],
);
