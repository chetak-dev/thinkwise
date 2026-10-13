import type {
  AnswerKey,
  HostSettings,
  LobbyPlayer,
  PublicQuestion,
  PublicRules,
  RecentAnswer,
  ServerMessage,
  Standing,
} from '@thinkwise/shared';
import { DEFAULT_THEME } from '@thinkwise/shared';
import { clockTimer, type ClockedTimer } from '@/components/game/TimerRing';

export type StagePhase = 'connecting' | 'lobby' | 'question' | 'reveal' | 'leaderboard' | 'finished';

export interface StageProgress {
  answered: number;
  total: number;
  counts: number[];
  recent: RecentAnswer[];
}

export interface StageState {
  pin: string | null;
  quizTitle: string;
  rules: PublicRules;
  players: LobbyPlayer[];
  locked: boolean;
  settings: HostSettings;
  phase: StagePhase;
  question: PublicQuestion | null;
  timer: ClockedTimer | null;
  progress: StageProgress | null;
  correct: number[];
  answerKey: AnswerKey;
  /** Players who got the revealed question right. */
  rightCount: number | null;
  explanation: string | null;
  top: Standing[];
  podium: Standing[];
  celebration: number;
}

export const DEFAULT_RULES: PublicRules = {
  showLeaderboard: true,
  showCorrect: true,
  gamification: true,
  orgName: '',
  themeColour: DEFAULT_THEME,
  welcomeMessage: '',
  completionMessage: '',
};

export const INITIAL_STAGE: StageState = {
  pin: null,
  quizTitle: '',
  rules: DEFAULT_RULES,
  players: [],
  locked: false,
  settings: { leaderboardAfterEach: true, liveCounts: true, autoAdvance: false, soundtrack: 'ocean-drive' },
  phase: 'connecting',
  question: null,
  timer: null,
  progress: null,
  correct: [],
  answerKey: {},
  rightCount: null,
  explanation: null,
  top: [],
  podium: [],
  celebration: 0,
};

/** Applies the messages that hosts and projector screens share. */
export function stageReducer(state: StageState, msg: ServerMessage): StageState {
  switch (msg.t) {
    case 'host:ready':
    case 'screen:ready':
      return { ...state, pin: msg.pin, quizTitle: msg.quizTitle, rules: msg.rules, phase: 'lobby' };
    case 'settings':
      return { ...state, settings: msg.settings };
    case 'lobby':
      return { ...state, players: msg.players, locked: msg.locked };
    case 'answered': {
      const ids = new Set(msg.ids);
      return { ...state, players: state.players.map((p) => (ids.has(p.id) ? { ...p, answered: true } : p)) };
    }
    case 'question':
      return {
        ...state,
        phase: 'question',
        question: msg.question,
        players: state.players.map((p) => (p.answered ? { ...p, answered: false } : p)),
        timer: clockTimer(msg.timer),
        progress: {
          answered: 0,
          total: 0,
          counts: msg.question.scale
            ? Array.from({ length: msg.question.scale.max - msg.question.scale.min + 1 }, () => 0)
            : msg.question.options.map(() => 0),
          recent: [],
        },
        correct: [],
        answerKey: {},
        rightCount: null,
        explanation: null,
      };
    case 'timer':
      return { ...state, timer: clockTimer(msg.timer) };
    case 'progress':
      return {
        ...state,
        progress: { answered: msg.answered, total: msg.total, counts: msg.counts, recent: msg.recent },
      };
    case 'reveal':
      return {
        ...state,
        phase: 'reveal',
        correct: msg.correct,
        answerKey: { accepted: msg.accepted, numeric: msg.numeric, blankAnswers: msg.blankAnswers },
        rightCount: msg.rightCount,
        explanation: msg.explanation ?? null,
        progress: {
          answered: msg.answered,
          total: msg.total,
          counts: msg.counts,
          recent: state.progress?.recent ?? [],
        },
      };
    case 'leaderboard':
      return { ...state, phase: 'leaderboard', top: msg.top };
    case 'final':
      return { ...state, phase: 'finished', podium: msg.podium, celebration: state.celebration + 1 };
    default:
      return state;
  }
}
