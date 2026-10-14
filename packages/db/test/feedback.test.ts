import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { FIELD_TYPES, newField } from '@thinkwise/shared';

process.env.PGLITE_DIR = 'memory://';
delete process.env.DATABASE_URL;

const { openDb } = await import('../src/client');
const { migrateHandle } = await import('../src/migrate');
const auth = await import('../src/auth');
const f = await import('../src/feedback');
const quizzes = await import('../src/quizzes');
const sessions = await import('../src/sessions');

const handle = openDb();
const db = handle.db;
let alice: { id: string; orgId: string | null };
let bob: { id: string; orgId: string | null };

before(async () => {
  await migrateHandle(handle);
  const a = await auth.registerUser(db, { name: 'Alice', email: 'alice@example.com', password: 'alice-pass-1' });
  const b = await auth.registerUser(db, { name: 'Bob', email: 'bob@example.com', password: 'bob-pass-12' });
  if (!a.ok || !b.ok) throw new Error('setup failed');
  alice = a.user;
  bob = b.user;
});

test('create, list, load and save a feedback form with every field type', async () => {
  const id = await f.createFeedbackForm(db, alice);
  const fresh = await f.getFeedbackForm(db, alice.id, id);
  assert.equal(fresh?.title, 'Untitled feedback form');
  assert.equal(fresh?.version, 1);
  assert.equal(fresh?.fields.length, 1, 'new forms start with one rating question');

  let n = 0;
  const fields = FIELD_TYPES.map((type) => newField(type, `f${type}`, () => `c${n++}`));
  fields[1] = { ...fields[1]!, required: true, condition: { fieldId: fields[0]!.id, op: 'contains', value: 'great' } };
  const saved = await f.saveFeedbackForm(db, alice.id, id, { title: 'Workshop feedback', description: 'Tell us', fields });
  assert.equal(saved?.version, 2, 'each save bumps the version');

  const loaded = await f.getFeedbackForm(db, alice.id, id);
  assert.equal(loaded?.title, 'Workshop feedback');
  assert.deepEqual(loaded?.fields, fields);
  assert.equal(loaded?.fields.find((x) => x.type === 'matrix')?.rows.length, 1);

  const list = await f.listFeedbackForms(db, alice.id);
  assert.deepEqual(
    list.map((x) => [x.id, x.fieldCount, x.version]),
    [[id, FIELD_TYPES.length, 2]],
  );
});

test('forms are private to their owner', async () => {
  const id = await f.createFeedbackForm(db, alice);
  assert.equal(await f.getFeedbackForm(db, bob.id, id), null);
  assert.equal(await f.saveFeedbackForm(db, bob.id, id, { title: 'Hijack', description: '', fields: [] }), null);
  assert.equal(await f.deleteFeedbackForm(db, bob, id), false);
  assert.equal((await f.listFeedbackForms(db, bob.id)).length, 0);
  assert.equal(await f.getFeedbackForm(db, alice.id, 'not-a-uuid'), null);
  assert.equal(await f.deleteFeedbackForm(db, alice, id), true);
  assert.equal(await f.getFeedbackForm(db, alice.id, id), null);
});

test('rejects unknown field types and oversized settings', async () => {
  const id = await f.createFeedbackForm(db, alice);
  const bad = { ...newField('file', 'x1'), type: 'signature' };
  await assert.rejects(() => f.saveFeedbackForm(db, alice.id, id, { title: 't', description: '', fields: [bad as never] }));
  const big = { ...newField('file', 'x2'), maxMb: 500 };
  await assert.rejects(() => f.saveFeedbackForm(db, alice.id, id, { title: 't', description: '', fields: [big] }));
});

test('events pair an owned quiz with owned forms and collect their launches', async () => {
  const quizId = await quizzes.createQuiz(db, alice, 'Event quiz');
  const formId = await f.createFeedbackForm(db, alice);
  const afterId = await f.createFeedbackForm(db, alice);
  const bobForm = await f.createFeedbackForm(db, bob);
  const base = {
    title: '  ',
    description: 'Welcome',
    quizId,
    formId,
    afterFormId: null,
    flow: 'before' as const,
    identity: 'identified' as const,
    feedbackRequired: true,
    allowLateEntry: true,
  };

  const made = await f.createFeedbackEvent(db, alice, base);
  assert.ok(made.ok);
  const event = await f.getFeedbackEvent(db, alice.id, made.id);
  assert.equal(event?.title, 'Untitled interactive event', 'blank titles get the default');
  assert.deepEqual([event?.quiz?.title, event?.form?.id, event?.afterForm], ['Event quiz', formId, null]);

  assert.deepEqual(await f.createFeedbackEvent(db, alice, { ...base, formId: null }), { ok: false, error: 'Choose a feedback form.' });
  assert.equal((await f.createFeedbackEvent(db, alice, { ...base, flow: 'both' })).ok, false, 'before + after needs a second form');
  assert.equal((await f.createFeedbackEvent(db, alice, { ...base, formId: bobForm })).ok, false, 'someone else’s form');
  assert.equal((await f.createFeedbackEvent(db, bob, base)).ok, false, 'someone else’s quiz');

  const both = await f.createFeedbackEvent(db, alice, { ...base, flow: 'both', afterFormId: afterId });
  assert.ok(both.ok);
  assert.equal((await f.getFeedbackEvent(db, alice.id, both.id))?.afterForm?.id, afterId);

  const quizOnly = await f.createFeedbackEvent(db, alice, { ...base, flow: 'quiz_only', afterFormId: afterId });
  assert.ok(quizOnly.ok);
  const qo = await f.getFeedbackEvent(db, alice.id, quizOnly.id);
  assert.deepEqual([qo?.form, qo?.afterForm, qo?.feedbackRequired], [null, null, false], 'quiz-only events drop their forms');

  await sessions.createGameSession(db, alice, {
    gameId: '00000000-0000-4000-8000-0000000000e1',
    pin: '123456',
    quizId,
    title: 'Event quiz',
    questionCount: 1,
    eventId: made.id,
  });
  const launches = await sessions.listEventSessions(db, alice.id, made.id);
  assert.deepEqual(
    launches.map((s) => s.pin),
    ['123456'],
  );
  assert.equal((await sessions.listEventSessions(db, bob.id, made.id)).length, 0);
  const listed = await f.listFeedbackEvents(db, alice.id);
  assert.equal(listed.find((e) => e.id === made.id)?.launches, 1);
  assert.equal(await f.getFeedbackEvent(db, bob.id, made.id), null, 'events are private to their owner');
});
