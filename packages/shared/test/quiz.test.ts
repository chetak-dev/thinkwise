import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DraftQuestion, QuizSettings, newQuestion, toPlayable } from '../src/index';

test('quiz language: Odia is offered and saved Marathi quizzes still load as Other', () => {
  assert.equal(QuizSettings.parse({ language: 'or' }).language, 'or');
  assert.equal(QuizSettings.parse({ language: 'mr' }).language, 'other');
  assert.equal(QuizSettings.parse({}).language, 'en');
  assert.equal(QuizSettings.safeParse({ language: 'xx' }).success, false);
});

test('incomplete translations can be saved as drafts but cannot be played', () => {
  const question = DraftQuestion.parse({
    ...newQuestion('mc', 'translated'),
    text: 'Question', options: ['First', 'Second'], correct: [0],
    translations: { Hindi: { text: '', options: ['पहला', ''] } },
  });
  const result = toPlayable('Quiz', [question]);
  assert.equal(result.ok, false);
  if (!result.ok) assert.deepEqual(result.problems[0]?.issues, ['Complete the Hindi translation']);
  question.translations!.Hindi = { text: 'प्रश्न', options: ['पहला', 'दूसरा'], hint: '', explanation: '' };
  assert.equal(toPlayable('Quiz', [question]).ok, true);
});
