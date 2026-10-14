import { test } from 'node:test';
import assert from 'node:assert/strict';
import { answerText, checkFeedback, eventFeedbackCsv, newField, visibleFields, type FormField } from '../src/index';

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
  const fields = [field('heading', 'h'), rate];
  const base = {
    fields,
    sessions: [{ id: 's1', label: 'PIN 111111' }],
    players: [
      { sessionId: 's1', nickname: 'Asha', score: 900, rank: 1, correctCount: 2 },
      { sessionId: 's1', nickname: 'Ravi', score: 400, rank: 2, correctCount: 1 },
    ],
    submissions: [
      { sessionId: 's1', nickname: 'asha', submittedAt: '10:00', answers: { rate: 5 } },
      { sessionId: 's1', nickname: 'Meera', submittedAt: '10:01', answers: { rate: 3 } },
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
});
