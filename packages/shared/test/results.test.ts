import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeReport, reportToCsv, toCsv, type GameResults } from '../src/index';

const questions: GameResults['questions'] = [
  { type: 'mc', text: 'Q one', options: ['A', 'B', 'C'], correct: [1], points: 1000 },
  { type: 'tf', text: 'Q two', options: ['True', 'False'], correct: [0], points: 1000 },
  { type: 'mc', text: 'Never asked', options: ['X', 'Y'], correct: [0], points: 1000 },
];

test('report statistics come only from saved answers', () => {
  const players = [
    { score: 1900, correctCount: 2, answers: [
      { q: 0, choice: 1, isCorrect: true, points: 950, timeMs: 2000 },
      { q: 1, choice: 0, isCorrect: true, points: 950, timeMs: 4000 },
    ] },
    { score: 900, correctCount: 1, answers: [
      { q: 0, choice: 1, isCorrect: true, points: 900, timeMs: 3000 },
      { q: 1, choice: 1, isCorrect: false, points: 0, timeMs: 6000 },
    ] },
    { score: 0, correctCount: 0, answers: [{ q: 0, choice: 2, isCorrect: false, points: 0, timeMs: 9000 }] },
  ];
  const r = computeReport(questions, players, 2);
  assert.equal(r.participants, 3);
  assert.equal(r.answered, 5);
  assert.equal(r.possible, 6);
  assert.equal(r.completion, 83);
  assert.equal(r.accuracy, 60);
  assert.equal(r.avgScore, 933);

  const [q1, q2, q3] = r.questions;
  assert.equal(q1!.accuracy, 67);
  assert.equal(q1!.avgMs, 4667);
  assert.deepEqual(q1!.optionCounts, [0, 2, 1]);
  assert.equal(q2!.accuracy, 50);
  assert.equal(q3!.asked, false);
  assert.equal(q3!.accuracy, null, 'unanswered question has no accuracy');
  assert.equal(r.hardest?.index, 1, 'lowest accuracy among answered questions');

  assert.equal(r.distribution.length, 5);
  assert.deepEqual(r.distribution.map((b) => b.count), [1, 0, 1, 0, 1]);
  assert.equal(r.distribution.at(-1)?.to, 1900);
});

test('multi-select and typed answers are counted per option and per response', () => {
  const qs: GameResults['questions'] = [
    { type: 'multi', text: 'Primes?', options: ['2', '4', '5'], correct: [0, 2], points: 1000 },
    { type: 'text', text: 'Symbol for gold?', options: [], correct: [], accepted: ['Au'], points: 1000 },
  ];
  const r = computeReport(qs, [
    { score: 1000, correctCount: 2, answers: [
      { q: 0, choices: [0, 2], isCorrect: true, points: 500, timeMs: 1000 },
      { q: 1, text: 'au', isCorrect: true, points: 500, timeMs: 1000 },
    ] },
    { score: 0, correctCount: 0, answers: [
      { q: 0, choices: [0, 1], isCorrect: false, points: 0, timeMs: 1000 },
      { q: 1, text: ' AU ', isCorrect: true, points: 0, timeMs: 1000 },
    ] },
    { score: 0, correctCount: 0, answers: [{ q: 1, text: 'Ag', isCorrect: false, points: 0, timeMs: 1000 }] },
  ], 2);
  assert.deepEqual(r.questions[0]!.optionCounts, [2, 1, 1]);
  assert.deepEqual(r.questions[1]!.textCounts, [
    { text: 'au', count: 2, isCorrect: true },
    { text: 'Ag', count: 1, isCorrect: false },
  ]);
  assert.match(reportToCsv(qs, [{ rank: 1, nickname: 'A', score: 0, correctCount: 0, answers: [{ q: 0, choices: [0, 1], isCorrect: false, points: 0, timeMs: 0 }] }], 2), /"2 \+ 4 \(wrong/);
});

test('ordering answers read as sequences; ratings are averaged and left out of accuracy', () => {
  const qs: GameResults['questions'] = [
    // Shuffled for the game: shown as C, A, B; right order is A, B, C.
    { type: 'order', text: 'ABC', options: ['C', 'A', 'B'], correct: [1, 2, 0], points: 1000 },
    { type: 'rating', text: 'Rate', options: [], correct: [], ratingMin: 1, ratingMax: 5, points: 0 },
  ];
  const players = [
    { score: 900, correctCount: 1, answers: [
      { q: 0, choices: [1, 2, 0], isCorrect: true, points: 900, timeMs: 1000 },
      { q: 1, number: 5, isCorrect: false, points: 0, timeMs: 1000 },
    ] },
    { score: 0, correctCount: 0, answers: [
      { q: 0, choices: [0, 1, 2], isCorrect: false, points: 0, timeMs: 1000 },
      { q: 1, number: 2, isCorrect: false, points: 0, timeMs: 1000 },
    ] },
  ];
  const r = computeReport(qs, players, 2);
  assert.equal(r.questions[0]!.answerKey, 'A → B → C');
  assert.deepEqual(r.questions[0]!.textCounts.map((t) => t.text), ['A → B → C', 'C → A → B']);
  assert.deepEqual(r.questions[1]!.options, ['1', '2', '3', '4', '5']);
  assert.deepEqual(r.questions[1]!.optionCounts, [0, 1, 0, 0, 1]);
  assert.equal(r.questions[1]!.average, 3.5);
  assert.equal(r.questions[1]!.accuracy, null, 'ratings have no accuracy');
  assert.equal(r.accuracy, 50, 'only the scored question counts');
  assert.equal(r.scoredAsked, 1);
  assert.equal(r.hardest?.index, 0);
  const csv = reportToCsv(qs, [{ rank: 1, nickname: 'A', ...players[0]! }], 2).split('\r\n')[1];
  assert.equal(csv, '1,A,900,1/1,100,1.0,"A → B → C (correct, 900 pts, 1.0 s)",5');
});

test('empty sessions do not divide by zero', () => {
  const r = computeReport(questions, [], 0);
  assert.equal(r.accuracy, null);
  assert.equal(r.completion, null);
  assert.equal(r.avgScore, null);
  assert.equal(r.hardest, null);
  assert.ok(r.distribution.every((b) => b.count === 0));
});

test('report CSV has one column per asked question and guards formulas', () => {
  const csv = reportToCsv(questions, [
    { rank: 1, nickname: '=HYPERLINK("x")', score: 950, correctCount: 1, answers: [{ q: 0, choice: 1, isCorrect: true, points: 950, timeMs: 1500 }] },
    { rank: 2, nickname: 'Ravi', score: 0, correctCount: 0, answers: [] },
  ], 2);
  const lines = csv.split('\r\n');
  assert.equal(lines[0], 'Rank,Name,Score,Correct,Accuracy %,Avg time (s),Q1: Q one,Q2: Q two');
  assert.equal(lines[1], '1,"\'=HYPERLINK(""x"")",950,1/2,100,1.5,"B (correct, 950 pts, 1.5 s)",');
  assert.equal(lines[2], '2,Ravi,0,0/2,,,,');
});

test('toCsv quotes and neutralises formulas', () => {
  assert.equal(toCsv([['a,b', '=1+1', 3]]), '"a,b",\'=1+1,3');
});
