import { Cloud, Flame, Heart, Leaf, Star, Zap, type LucideIcon } from 'lucide-react';

export interface AnswerStyle {
  bg: string;
  Icon: LucideIcon;
  letter: string;
}

export const ANSWER_STYLES: AnswerStyle[] = [
  { bg: 'bg-answer-1', Icon: Star, letter: 'A' },
  { bg: 'bg-answer-2', Icon: Heart, letter: 'B' },
  { bg: 'bg-answer-3', Icon: Leaf, letter: 'C' },
  { bg: 'bg-answer-4', Icon: Zap, letter: 'D' },
  { bg: 'bg-answer-5', Icon: Flame, letter: 'E' },
  { bg: 'bg-answer-6', Icon: Cloud, letter: 'F' },
];

export function answerStyle(index: number): AnswerStyle {
  return ANSWER_STYLES[index % ANSWER_STYLES.length]!;
}
