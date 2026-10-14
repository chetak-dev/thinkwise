import { test } from 'node:test';
import assert from 'node:assert/strict';
import { answerText, checkFeedback, eventFeedbackCsv, newField, summarizeResponses, visibleFields, type FormField } from '../src/index';

let n = 0;
const id = () => `c${n++}`;
const field = (type: FormField['type'], fid: string, patch: Partial<FormField> = {}): FormField => ({ ...newField(type, fid, id), ...patch });

test('feedback answers are checked per field type, and only visible questions count', () => {
  const like = field('yes_no', 'like', { required: true });
  const why = field('long_text', 'why', { required: true, condition: { fieldId: 'like', op: 'equals', value: 'no' } });
  const stars = field('stars', 'stars', { required: true });
  const pick = field('checkboxes', 'pick');
  const grid = field('matrix', 'grid');
  const order = field('ranking', 'order');
  const consent = field('consent', 'ok', { required: true });
  const upload = field('image', 'photo', { required: true });
  const fields = [field('heading', 'h'), like, why, stars, pick, grid, order, consent, upload];

  const good = checkFeedback(fields, {
    like: 'yes',
    why: 'should be dropped because it is hidden',
    stars: 4,
    pick: [pick.choices[1]!.id],
    grid: { [grid.rows[0]!.id]: grid.choices[0]!.id },
    order: [order.choices[1]!.id, order.choices[0]!.id],
    ok: true,
    photo: 'ignored until uploads exist',
  });
  assert.ok(good.ok);
  assert.deepEqual(Object.keys(good.answers).sort(), ['grid', 'like', 'ok', 'order', 'pick', 'stars']);
  assert.equal(answerText(order, good.answers.order), 'Option 2 > Option 1');
  assert.equal(answerText(grid, good.answers.grid), 'Row 1: Option 1');

  const bad = checkFeedback(fields, { like: 'no', stars: 9, pick: ['nope'], order: [order.choices[0]!.id] });
  assert.ok(!bad.ok);
  assert.deepEqual(bad.problems, { why: 'required', stars: 'invalid', pick: 'invalid', order: 'invalid', ok: 'required' });

  assert.ok(!checkFeedback(fields, 'not an object').ok);
});

test('conditions follow chains and match choice labels case-insensitively', () => {
  const colour = field('checkboxes', 'colour', { choices: [{ id: 'r', label: 'Red' }, { id: 'b', label: 'Blue' }] });
  const shade = field('short_text', 'shade', { condition: { fieldId: 'colour', op: 'equals', value: 'blue' } });
  const more = field('short_text', 'more', { condition: { fieldId: 'shade', op: 'contains', value: 'navy' } });
  const fields = [colour, shade, more];
  const ids = (answers: Record<string, unknown>) => visibleFields(fields, answers as never).map((f) => f.id);
  assert.deepEqual(ids({}), ['colour']);
  assert.deepEqual(ids({ colour: ['r', 'b'] }), ['colour', 'shade']);
  assert.deepEqual(ids({ colour: ['b'], shade: 'Dark Navy' }), ['colour', 'shade', 'more']);
  assert.deepEqual(ids({ colour: ['r'], shade: 'navy' }), ['colour'], 'a hidden source hides its dependants');

  const email = field('email', 'e');
  const phone = field('phone', 'p');
  const num = field('number', 'num');
  const when = field('datetime', 'when');
  assert.ok(checkFeedback([email, phone, num, when], { e: 'a@b.co', p: '+91 98765 43210', num: '3.5', when: '2026-10-14T10:30' }).ok);
  assert.ok(!checkFeedback([email], { e: 'not-an-email' }).ok);
  assert.ok(!checkFeedback([num], { num: 'abc' }).ok);
  assert.ok(!checkFeedback([field('short_text', 's')], { s: 'x'.repeat(301) }).ok);
});

test('event spreadsheet lines feedback up with quiz results by nickname', () => {
  const rate = field('rating', 'rate');
  const base = {
    beforeFields: [field('heading', 'h'), rate],
    afterFields: [],
    sessions: [{ id: 's1', label: 'PIN 111111' }],
    players: [
      { sessionId: 's1', nickname: 'Asha', score: 900, rank: 1, correctCount: 2 },
      { sessionId: 's1', nickname: 'Ravi', score: 400, rank: 2, correctCount: 1 },
    ],
    submissions: [
      { sessionId: 's1', stage: 'before' as const, nickname: 'asha', submittedAt: '10:00', answers: { rate: 5 } },
      { sessionId: 's1', stage: 'before' as const, nickname: 'Meera', submittedAt: '10:01', answers: { rate: 3 } },
    ],
  };
  const lines = (csv: string) => csv.split('\r\n');
  assert.deepEqual(lines(eventFeedbackCsv({ ...base, identity: 'identified' })), [
    'Session,Name,Quiz rank,Quiz score,Correct answers,Gave feedback,Feedback submitted at,Untitled question (1–5)',
    'PIN 111111,Asha,1,900,2,Yes,10:00,5',
    'PIN 111111,Ravi,2,400,1,No,,',
    'PIN 111111,Meera,,,,Yes,10:01,3',
  ]);
  assert.deepEqual(lines(eventFeedbackCsv({ ...base, identity: 'anonymous' })).slice(1), [
    'PIN 111111,,,,,Yes,10:00,5',
    'PIN 111111,,,,,Yes,10:01,3',
  ]);
  assert.deepEqual(lines(eventFeedbackCsv({ ...base, identity: 'partial' })).slice(1), [
    'PIN 111111,asha,,,,Yes,10:00,5',
    'PIN 111111,Meera,,,,Yes,10:01,3',
  ]);
});

test('before and after feedback from one person share a row', () => {
  const rate = field('rating', 'rate');
  const fun = field('yes_no', 'fun', { label: 'Fun?' });
  const csv = eventFeedbackCsv({
    identity: 'identified',
    beforeFields: [rate],
    afterFields: [fun],
    sessions: [{ id: 's1', label: 'S' }],
    players: [{ sessionId: 's1', nickname: 'Asha', score: 900, rank: 1, correctCount: 2 }],
    submissions: [
      { sessionId: 's1', stage: 'after', nickname: 'Asha', submittedAt: '11:00', answers: { fun: 'yes' } },
      { sessionId: 's1', stage: 'before', nickname: 'Asha', submittedAt: '10:00', answers: { rate: 4 } },
    ],
  });
  assert.deepEqual(csv.split('\r\n'), [
    'Session,Name,Quiz rank,Quiz score,Correct answers,Gave feedback,Before-quiz feedback at,Untitled question (1–5),After-quiz feedback at,After: Fun?',
    'S,Asha,1,900,2,Yes,10:00,4,11:00,Yes',
  ]);
});

test('responses summary: averages, tallies, rankings and latest comments', () => {
  const stars = field('stars', 'stars');
  const pick = field('checkboxes', 'pick', { choices: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] });
  const order = field('ranking', 'order', { choices: [{ id: 'x', label: 'X' }, { id: 'y', label: 'Y' }] });
  const note = field('long_text', 'note');
  const summary = summarizeResponses([field('heading', 'h'), stars, pick, order, note], [
    { name: 'Asha', answers: { stars: 5, pick: ['a', 'b'], order: ['y', 'x'], note: 'Great' } },
    { name: null, answers: { stars: 3, pick: ['b'], order: ['y', 'x'] } },
    { name: 'Ravi', answers: { order: ['x', 'y'], note: 'Too long' } },
  ]);
  assert.deepEqual(
    summary.map((s) => s.kind),
    ['scale', 'choices', 'ranking', 'text'],
  );
  const [s0, s1, s2, s3] = summary;
  assert.ok(s0?.kind === 'scale' && s0.average === 4 && s0.answered === 2);
  assert.deepEqual(s0.counts.map((c) => c.n), [0, 0, 1, 0, 1]);
  assert.ok(s1?.kind === 'choices');
  assert.deepEqual(s1.counts, [{ label: 'A', n: 1 }, { label: 'B', n: 2 }]);
  assert.ok(s2?.kind === 'ranking');
  assert.equal(s2.order[0]?.label, 'Y', 'Y was ranked first by most people');
  assert.ok(s3?.kind === 'text');
  assert.deepEqual(s3.latest, [{ text: 'Too long', name: 'Ravi' }, { text: 'Great', name: 'Asha' }], 'newest first');
});
