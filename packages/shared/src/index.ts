import { z } from 'zod';
import { ANSWER_TEXT_MAX, MAX_BLANKS, MAX_OPTIONS, type GameRules, type QuestionType } from './quiz';

export * from './quiz';
export * from './csv';
export * from './results';

/** The parts of a quiz's rules that change what screens show. */
export type PublicRules = Pick<
  GameRules,
  'showLeaderboard' | 'showCorrect' | 'gamification' | 'orgName' | 'themeColour' | 'welcomeMessage' | 'completionMessage'
>;

export const AVATARS = [
  '🐨', '🦊', '🐼', '🐯', '🦁', '🐸', '🐵', '🐙',
  '🦄', '🐧', '🐢', '🦕', '🐝', '🦋', '🐬', '🦉',
  '🐳', '🐰', '🐱', '🐶', '🦔', '🌻', '🍀', '🎈',
] as const;

export type Avatar = (typeof AVATARS)[number];

export const NICKNAME_MAX = 20;

export const TRACK_IDS = [
  'ocean-drive',
  'bubble-pop',
  'night-library',
  'power-up',
  'summit',
  'campfire',
  'jazz-cafe',
  'dhol-dance',
  'orbit',
  'final-lap',
] as const;

export type TrackId = (typeof TRACK_IDS)[number];

const Pin = z.string().regex(/^\d{6}$/);
const Token = z.string().min(10).max(100);
const Nickname = z
  .string()
  .trim()
  .min(1)
  .max(NICKNAME_MAX)
  .regex(/^[\p{L}\p{M}\p{N} _.'-]+$/u);

export const ClientMessage = z.discriminatedUnion('t', [
  z.object({ t: z.literal('host:create') }),
  z.object({ t: z.literal('host:resume'), gameId: Token, hostToken: Token }),
  z.object({ t: z.literal('screen:join'), gameId: Token, screenKey: Token }),
  z.object({ t: z.literal('host:lock'), locked: z.boolean() }),
  z.object({ t: z.literal('host:kick'), playerId: Token }),
  z.object({
    t: z.literal('host:settings'),
    settings: z
      .object({
        leaderboardAfterEach: z.boolean(),
        liveCounts: z.boolean(),
        autoAdvance: z.boolean(),
        soundtrack: z.enum(TRACK_IDS),
      })
      .partial(),
  }),
  z.object({ t: z.literal('host:start') }),
  z.object({ t: z.literal('host:reveal') }),
  z.object({ t: z.literal('host:pause'), paused: z.boolean() }),
  z.object({ t: z.literal('host:extend') }),
  z.object({ t: z.literal('host:leaderboard') }),
  z.object({ t: z.literal('host:next') }),
  z.object({ t: z.literal('host:end') }),
  z.object({ t: z.literal('pin:check'), pin: Pin }),
  z.object({ t: z.literal('player:join'), pin: Pin, nickname: Nickname, avatar: z.enum(AVATARS) }),
  z.object({ t: z.literal('player:resume'), pin: Pin, playerToken: Token }),
  z.object({
    t: z.literal('player:answer'),
    index: z.number().int().min(0).max(500),
    /** Single-choice and true/false. */
    choice: z.number().int().min(0).max(9).optional(),
    /** Multi-select. */
    choices: z.array(z.number().int().min(0).max(MAX_OPTIONS - 1)).min(1).max(MAX_OPTIONS).optional(),
    /** Type answer. */
    text: z.string().max(ANSWER_TEXT_MAX).optional(),
    /** Numeric. */
    number: z.number().finite().optional(),
    /** Fill in the blanks, one entry per blank. */
    blanks: z.array(z.string().max(ANSWER_TEXT_MAX)).min(1).max(MAX_BLANKS).optional(),
  }),
]);
export type ClientMessage = z.infer<typeof ClientMessage>;

/** What a player locked in: the options they picked, or what they typed. */
export interface PlayerAnswer {
  choices: number[];
  text?: string;
  number?: number;
  blanks?: string[];
}

/** What counted as right for questions without options (empty when answers are hidden). */
export interface AnswerKey {
  accepted?: string[];
  numeric?: { answer: number; tolerance: number };
  blankAnswers?: string[][];
}

/** What players and hosts see of a question. Never includes the correct answer. */
export interface PublicQuestion {
  index: number;
  total: number;
  type: QuestionType;
  text: string;
  options: string[];
  imageUrl?: string;
  hint?: string;
  /** Points a wrong answer costs (0 = no negative marking). */
  penalty?: number;
  /** Rating questions: the lowest and highest value players can pick. */
  scale?: { min: number; max: number };
}

export interface HostSettings {
  leaderboardAfterEach: boolean;
  liveCounts: boolean;
  autoAdvance: boolean;
  soundtrack: TrackId;
}

export interface TimerState {
  /** Server epoch ms when time runs out; null while paused. */
  endsAt: number | null;
  durationMs: number;
  remainingMs: number;
  paused: boolean;
  /** Server clock at send time, so clients can correct for clock drift. */
  serverNow: number;
}

export interface Standing {
  id: string;
  nickname: string;
  avatar: string;
  score: number;
  rank: number;
}

export interface LobbyPlayer {
  id: string;
  nickname: string;
  avatar: string;
  connected: boolean;
  /** Answered the current question (only meaningful while a question is open). */
  answered: boolean;
  /** Score as of the last reveal, so the host panel never leaks correctness early. */
  score: number;
}

export interface RecentAnswer {
  id: string;
  nickname: string;
  avatar: string;
}

export type ErrorCode =
  | 'bad_request'
  | 'game_not_found'
  | 'game_over'
  | 'lobby_locked'
  | 'name_taken'
  | 'rate_limited'
  | 'not_authorized'
  | 'session_expired';

export type ServerMessage =
  | {
      t: 'host:ready';
      gameId: string;
      pin: string;
      hostToken: string;
      screenKey: string;
      quizTitle: string;
      questionCount: number;
      rules: PublicRules;
    }
  | { t: 'screen:ready'; pin: string; quizTitle: string; questionCount: number; rules: PublicRules }
  | { t: 'lobby'; locked: boolean; players: LobbyPlayer[] }
  /** Hosts only: players who answered since the last update, so big games don't resend the whole list. */
  | { t: 'answered'; ids: string[] }
  | { t: 'settings'; settings: HostSettings }
  | { t: 'pin:ok'; pin: string }
  | {
      t: 'player:ready';
      pin: string;
      playerId: string;
      playerToken: string;
      nickname: string;
      avatar: string;
      score: number;
      rules: PublicRules;
    }
  | { t: 'lobby:count'; count: number }
  | { t: 'soundtrack'; track: TrackId }
  | { t: 'question'; question: PublicQuestion; timer: TimerState; myAnswer?: PlayerAnswer | null }
  | { t: 'timer'; timer: TimerState }
  | { t: 'progress'; answered: number; total: number; counts: number[]; recent: RecentAnswer[] }
  | { t: 'answer:ok'; index: number; answer: PlayerAnswer }
  | ({
      t: 'reveal';
      index: number;
      correct: number[];
      counts: number[];
      answered: number;
      /** Players who got it right. */
      rightCount: number;
      total: number;
      explanation?: string;
    } & AnswerKey)
  | ({
      t: 'result';
      index: number;
      correct: number[];
      answer: PlayerAnswer | null;
      /** Fill in the blanks and put in order: how many blanks or positions were right. */
      partsRight?: number;
      isCorrect: boolean;
      /** Negative when a wrong answer was penalised. */
      points: number;
      score: number;
      rank: number;
      total: number;
      explanation?: string;
    } & AnswerKey)
  | { t: 'leaderboard'; top: Standing[]; me?: { rank: number; score: number } }
  | {
      t: 'final';
      podium: Standing[];
      total: number;
      questionCount: number;
      me?: { rank: number; score: number; correctCount: number };
    }
  | { t: 'kicked' }
  | { t: 'error'; code: ErrorCode; message: string };

/** WebSocket close code sent when the host removes a player; clients must not auto-reconnect. */
export const CLOSE_KICKED = 4001;
/** Close code for a socket superseded by a newer connection from the same player. */
export const CLOSE_REPLACED = 4002;
