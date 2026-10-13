import { PlayableQuiz } from '@thinkwise/shared';

export type Quiz = PlayableQuiz;
export type Question = Quiz['questions'][number];

const TRUE_FALSE = ['True', 'False'];

export const SAMPLE_QUIZ: Quiz = PlayableQuiz.parse({
  title: 'General knowledge warm-up',
  questions: [
    {
      type: 'mc',
      text: 'Which planet is often called the Red Planet?',
      options: ['Venus', 'Mars', 'Jupiter', 'Mercury'],
      correct: [1],
      timeLimitMs: 20_000,
      points: 1000,
    },
    {
      type: 'tf',
      text: 'At sea level, water boils at 100 °C.',
      options: TRUE_FALSE,
      correct: [0],
      timeLimitMs: 20_000,
      points: 1000,
    },
    {
      type: 'mc',
      text: 'How many continents are there on Earth?',
      options: ['Five', 'Six', 'Seven', 'Eight'],
      correct: [2],
      timeLimitMs: 20_000,
      points: 1000,
    },
    {
      type: 'tf',
      text: 'Sound travels faster in air than in water.',
      options: TRUE_FALSE,
      correct: [1],
      timeLimitMs: 20_000,
      points: 1000,
    },
    {
      type: 'mc',
      text: 'Which gas do plants take in from the air to make their food?',
      options: ['Oxygen', 'Nitrogen', 'Carbon dioxide', 'Helium'],
      correct: [2],
      timeLimitMs: 20_000,
      points: 1000,
    },
  ],
});
