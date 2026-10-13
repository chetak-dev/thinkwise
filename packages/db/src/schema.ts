import { index, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

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
  passwordHash: text('password_hash').notNull(),
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
    title: text('title').notNull(),
    pin: text('pin').notNull(),
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
  },
  (t) => [index('game_sessions_host_created_idx').on(t.hostId, t.createdAt), index('game_sessions_quiz_idx').on(t.quizId)],
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
