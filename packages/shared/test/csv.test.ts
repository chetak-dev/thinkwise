import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CSV_TEMPLATE,
  PlayableQuiz,
  blanksRight,
  countBlanks,
  csvToQuestions,
  isAcceptedAnswer,
  isNumberMatch,
  newQuestion,
  parseCsv,
  parseNumberAnswer,
  questionIssues,
  questionsToCsv,
  toPlayable,
} from '../src/index';

let n = 0;
const id = () => `id${++n}`;

test('parses quotes, escaped quotes, CRLF, BOM and blank lines', () => {
  const rows = parseCsv('\uFEFFa,b,c\r\n"x, y","say ""hi""","line\nbreak"\r\n\r\n,,\r\n1,2,3');
  assert.deepEqual(rows, [
    ['a', 'b', 'c'],
    ['x, y', 'say "hi"', 'line\nbreak'],
    ['1', '2', '3'],
  ]);
  assert.deepEqual(parseCsv('a;b\n1;2'), [['a', 'b'], ['1', '2']], 'semicolon files from some Excel locales');
});

test('the template imports cleanly', () => {
  const { questions, errors } = csvToQuestions(CSV_TEMPLATE, id);
  assert.deepEqual(errors, []);
  assert.equal(questions.length, 9);
  assert.deepEqual(questions[0]?.options, ['Venus', 'Mars', 'Jupiter', 'Saturn']);
  assert.deepEqual(questions[0]?.correct, [1]);
  assert.equal(questions[0]?.timeLimitMs, 20_000);
  assert.equal(questions[1]?.type, 'multi');
  assert.deepEqual(questions[1]?.correct, [0, 2]);
  assert.equal(questions[2]?.points, 500);
  assert.equal(questions[3]?.type, 'tf');
  assert.deepEqual(questions[3]?.correct, [0]);
  assert.equal(questions[4]?.type, 'text');
  assert.deepEqual(questions[4]?.accepted, ['Na']);
  assert.equal(questions[5]?.numericAnswer, 150);
  assert.deepEqual(questions[6]?.blanks, [['Pacific'], ['Nile', 'River Nile']]);
  assert.deepEqual(questions[7]?.options, ['Mercury', 'Venus', 'Earth', 'Mars']);
  assert.equal(questions[8]?.ratingMax, 5);
  assert.equal(questions[8]?.points, 0);
});

test('ordering and rating rows', () => {
  const csv = [
    'type,question,option1,option2,option3,correct',
    'ordering,Smallest first,1,10,100,',
    'ordering,Only one,a,,,',
    'ordering,Repeats,a,A,b,',
    'rating,Scale,,,,0-10',
    'rating,Default scale,,,,',
    'rating,Bad scale,,,,2-5',
  ].join('\n');
  const { questions, errors } = csvToQuestions(csv, id);
  assert.deepEqual(questions[0]?.options, ['1', '10', '100']);
  assert.deepEqual([questions[1]?.ratingMin, questions[1]?.ratingMax], [0, 10]);
  assert.deepEqual([questions[2]?.ratingMin, questions[2]?.ratingMax], [1, 5]);
  assert.deepEqual(errors.map((e) => e.row), [3, 4, 7]);
});

test('numeric and fill-in-the-blanks rows', () => {
  const csv = [
    'type,question,correct',
    'numeric,Pi to two places?,3.14±0.005',
    'numeric,Freezing point?,-0',
    'numeric,Bad,ten',
    'fill_blank,___ and ___,salt|pepper;black pepper',
    'fill_blank,No blanks here,x',
    'fill_blank,Only ___ given,a|b',
  ].join('\n');
  const { questions, errors } = csvToQuestions(csv, id);
  assert.equal(questions[0]?.numericAnswer, 3.14);
  assert.equal(questions[0]?.tolerance, 0.005);
  assert.equal(questions[1]?.numericAnswer, -0);
  assert.deepEqual(questions[2]?.blanks, [['salt'], ['pepper', 'black pepper']]);
  assert.deepEqual(errors.map((e) => e.row), [4, 6, 7]);
});

test('numbers are read the way people type them', () => {
  assert.equal(parseNumberAnswer(' 1,5 '), 1.5);
  assert.equal(parseNumberAnswer('1,000'), 1000);
  assert.equal(parseNumberAnswer('1,234.5'), 1234.5);
  assert.equal(parseNumberAnswer('-.5'), -0.5);
  assert.equal(parseNumberAnswer('2e3'), 2000);
  for (const bad of ['', 'abc', '1.2.3', '0x10', 'Infinity', '1e400']) assert.equal(parseNumberAnswer(bad), null, bad);
  assert.ok(isNumberMatch(0.1 + 0.2, 0.3, 0));
  assert.ok(isNumberMatch(10.5, 10, 0.5));
  assert.ok(!isNumberMatch(10.51, 10, 0.5));
  assert.equal(countBlanks('a ___ b _____ c __ d'), 2);
  assert.equal(blanksRight(['Salt', ' black  pepper'], [['salt'], ['pepper', 'black pepper']]), 2);
  assert.equal(blanksRight(['salt'], [['salt'], ['pepper']]), 1, 'missing blanks are wrong');
});

test('multi-select and type-answer rows', () => {
  const csv = [
    'type,question,option1,option2,option3,correct',
    'multiple,Pick two,A,B,C,3;1;3',
    'multiple,Bad pick,A,B,C,1;4',
    'short_text,Capital of France?,,,,Paris; paris ;Paris city',
    'short_text,Nothing accepted,,,,;',
  ].join('\n');
  const { questions, errors } = csvToQuestions(csv, id);
  assert.deepEqual(questions[0]?.correct, [0, 2], 'sorted and de-duplicated');
  assert.deepEqual(questions[1]?.accepted, ['Paris', 'paris', 'Paris city']);
  assert.deepEqual(errors.map((e) => e.row), [3, 5]);
  assert.match(errors[0]!.message, /1;3/);
});

test('reports each bad row with its row number and keeps the good ones', () => {
  const csv = [
    'Type,Question,Option1,Option2,Correct,Time,Points',
    'single,Good one,A,B,2,,',
    'single,,A,B,1,,',
    'single,Only one option,A,,1,,',
    'single,Correct out of range,A,B,3,,',
    'true_false,Maybe?,,,perhaps,,',
    'poll,Favourite colour?,Red,Blue,,,',
    'banana,What?,A,B,1,,',
    'single,Bad time,A,B,1,7,',
    'single,Bad points,A,B,1,,999',
  ].join('\n');
  const { questions, errors } = csvToQuestions(csv, id);
  assert.equal(questions.length, 1, 'headers are case-insensitive; good rows survive');
  assert.deepEqual(
    errors.map((e) => e.row),
    [3, 4, 5, 6, 7, 8, 9, 10],
  );
  assert.match(errors[4]!.message, /aren’t supported yet/);
  assert.match(errors[5]!.message, /Unknown type/);
});

test('rejects files without a header, empty files and oversized files', () => {
  assert.match(csvToQuestions('', id).errors[0]!.message, /empty/);
  assert.match(csvToQuestions('single,What?,A,B,1', id).errors[0]!.message, /column names/);
  assert.match(csvToQuestions('x'.repeat(300 * 1024), id).errors[0]!.message, /256 KB/);
  assert.match(csvToQuestions('type,question', id).errors[0]!.message, /no questions/);
});

test('export round-trips and neutralises spreadsheet formulas', () => {
  const qs = [
    { ...newQuestion('mc', 'a'), text: 'Comma, "quotes" and\nnewline', options: ['=SUM(A1)', '+1', '-2', '@cmd'], correct: [3], points: 250, timeLimitMs: 30_000, explanation: 'why', tags: 'x, y' },
    { ...newQuestion('tf', 'b'), text: 'False one', correct: [1] },
    { ...newQuestion('multi', 'c'), text: 'Several', options: ['A', 'B', 'C'], correct: [0, 2] },
    { ...newQuestion('text', 'd'), text: 'Typed', accepted: ['Au', 'Gold'] },
    { ...newQuestion('numeric', 'e'), text: 'Below zero', numericAnswer: -40, tolerance: 0.5 },
    { ...newQuestion('blanks', 'f'), text: 'A ___ and a ___', blanks: [['cat'], ['dog', 'puppy']] },
    { ...newQuestion('order', 'g'), text: 'Order', options: ['first', 'second', 'third'] },
    { ...newQuestion('rating', 'h'), text: 'Rate', ratingMin: 0, ratingMax: 10 },
  ];
  const csv = questionsToCsv(qs);
  assert.ok(csv.includes("'=SUM(A1)") && csv.includes("'+1") && csv.includes("'@cmd"), 'formula cells are prefixed');
  const back = csvToQuestions(csv, id);
  assert.deepEqual(back.errors, []);
  assert.equal(back.questions[0]?.text, qs[0]!.text);
  assert.deepEqual(back.questions[0]?.options, qs[0]!.options, 'prefix removed again on import');
  assert.deepEqual(back.questions[0]?.correct, [3]);
  assert.equal(back.questions[0]?.points, 250);
  assert.equal(back.questions[0]?.tags, 'x, y');
  assert.deepEqual(back.questions[1]?.correct, [1]);
  assert.equal(back.questions[2]?.type, 'multi');
  assert.deepEqual(back.questions[2]?.correct, [0, 2]);
  assert.equal(back.questions[3]?.type, 'text');
  assert.deepEqual(back.questions[3]?.accepted, ['Au', 'Gold']);
  assert.equal(back.questions[4]?.numericAnswer, -40, 'negative numbers survive the formula guard');
  assert.equal(back.questions[4]?.tolerance, 0.5);
  assert.deepEqual(back.questions[5]?.blanks, [['cat'], ['dog', 'puppy']]);
  assert.deepEqual(back.questions[6]?.options, ['first', 'second', 'third']);
  assert.deepEqual([back.questions[7]?.ratingMin, back.questions[7]?.ratingMax], [0, 10]);
});

test('typed answers ignore spacing and, unless asked, letter case', () => {
  assert.ok(isAcceptedAnswer('  new   delhi ', ['New Delhi']));
  assert.ok(!isAcceptedAnswer('new delhi', ['New Delhi'], true));
  assert.ok(isAcceptedAnswer('New  Delhi', ['New Delhi'], true));
  assert.ok(!isAcceptedAnswer('   ', ['']), 'blank never matches');
});

test('playable quizzes enforce the shape of each question type', () => {
  const base = { text: 'Q', timeLimitMs: 20_000, points: 1000 };
  const ok = (q: object) => PlayableQuiz.safeParse({ title: 'T', questions: [{ ...base, ...q }] }).success;
  assert.ok(ok({ type: 'multi', options: ['A', 'B', 'C'], correct: [0, 2] }));
  assert.ok(!ok({ type: 'multi', options: ['A', 'B'], correct: [] }), 'multi needs a correct option');
  assert.ok(!ok({ type: 'mc', options: ['A', 'B'], correct: [0, 1] }), 'single choice has exactly one');
  assert.ok(!ok({ type: 'mc', options: ['A', 'B'], correct: [5] }), 'correct must point at an option');
  assert.ok(ok({ type: 'text', options: [], correct: [], accepted: ['Au'] }));
  assert.ok(!ok({ type: 'text', options: [], correct: [], accepted: [] }), 'text needs an accepted answer');

  const draft = { ...newQuestion('text', 'x'), text: 'Gold?', accepted: [' Au ', '', 'Au'] };
  assert.deepEqual(questionIssues({ ...draft, accepted: ['  '] }), ['Add at least one accepted answer']);
  const check = toPlayable('T', [draft]);
  assert.ok(check.ok);
  if (check.ok) {
    assert.deepEqual(check.quiz.questions[0]!.accepted, ['Au'], 'trimmed, blanks and duplicates dropped');
    assert.deepEqual(check.quiz.questions[0]!.options, []);
  }
  const multi = { ...newQuestion('multi', 'y'), text: 'Pick', options: ['A', 'B', 'C'], correct: [] };
  assert.deepEqual(questionIssues(multi), ['Tick at least one correct answer']);

  assert.ok(ok({ type: 'numeric', options: [], correct: [], numericAnswer: 3, tolerance: 0 }));
  assert.ok(!ok({ type: 'numeric', options: [], correct: [], numericAnswer: null }), 'numeric needs a number');
  assert.ok(ok({ type: 'blanks', text: 'A ___ B', options: [], correct: [], blanks: [['x']] }));
  assert.ok(!ok({ type: 'blanks', text: 'A ___ B ___', options: [], correct: [], blanks: [['x']] }), 'one key per blank');
  assert.deepEqual(questionIssues({ ...newQuestion('numeric', 'n'), text: 'How many?' }), ['Enter the correct number']);
  const blanks = { ...newQuestion('blanks', 'b'), text: 'The ___ sat on the ___', blanks: [[' cat ', 'cat'], [''], ['spare']] };
  assert.deepEqual(questionIssues(blanks), ['Add an answer for blank 2']);
  assert.deepEqual(questionIssues({ ...blanks, text: 'No blanks' }), ['Use ___ (three underscores) in the question text for each blank']);
  const fixed = toPlayable('T', [{ ...blanks, blanks: [[' cat ', 'cat'], ['mat'], ['spare']] }]);
  assert.ok(fixed.ok);
  if (fixed.ok) assert.deepEqual(fixed.quiz.questions[0]!.blanks, [['cat'], ['mat']], 'extra keys beyond the blanks are dropped');

  const order = { ...newQuestion('order', 'o'), text: 'Order', options: ['a', ' b ', 'c'] };
  assert.deepEqual(questionIssues({ ...order, options: ['a', '', 'c'] }), ['Fill in or remove empty items']);
  assert.deepEqual(questionIssues({ ...order, options: ['a', 'A', 'c'] }), ['Make every item different']);
  const rating = { ...newQuestion('rating', 'r'), text: 'Rate it', points: 1000, penalty: 100 };
  const both = toPlayable('T', [order, rating]);
  assert.ok(both.ok);
  if (both.ok) {
    assert.deepEqual(both.quiz.questions[0]!.options, ['a', 'b', 'c']);
    assert.deepEqual(both.quiz.questions[0]!.correct, [0, 1, 2], 'items are stored in the right order');
    assert.equal(both.quiz.questions[1]!.points, 0, 'ratings never score');
    assert.equal(both.quiz.questions[1]!.penalty, 0);
  }
  assert.ok(!ok({ type: 'order', options: ['a', 'b'], correct: [0] }), 'order needs the full sequence');
  assert.ok(ok({ type: 'rating', options: [], correct: [], ratingMin: 0, ratingMax: 10 }));
  assert.ok(!ok({ type: 'rating', options: [], correct: [], ratingMax: 11 }));
});
