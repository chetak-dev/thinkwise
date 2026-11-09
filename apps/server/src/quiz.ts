import { PlayableQuiz, SAMPLE_QUIZ } from '@thinkwise/shared';

export type Quiz = PlayableQuiz;
export type Question = Quiz['questions'][number];

export { SAMPLE_QUIZ };
