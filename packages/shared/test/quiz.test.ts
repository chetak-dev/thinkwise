import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QuizSettings } from '../src/index';

test('quiz language: Odia is offered and saved Marathi quizzes still load as Other', () => {
  assert.equal(QuizSettings.parse({ language: 'or' }).language, 'or');
  assert.equal(QuizSettings.parse({ language: 'mr' }).language, 'other');
  assert.equal(QuizSettings.parse({}).language, 'en');
  assert.equal(QuizSettings.safeParse({ language: 'xx' }).success, false);
});
