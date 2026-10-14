import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { FIELD_TYPES, newField } from '@thinkwise/shared';
import { eq } from 'drizzle-orm';

process.env.PGLITE_DIR = 'memory://';
delete process.env.DATABASE_URL;

const { openDb } = await import('../src/client');
const { migrateHandle } = await import('../src/migrate');
const auth = await import('../src/auth');
const f = await import('../src/feedback');
const quizzes = await import('../src/quizzes');
const sessions = await import('../src/sessions');
const ef = await import('../src/eventFeedback');
const schema = await import('../src/schema');

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

  const live = await ef.getEventForPin(db, '123456');
  assert.equal(live?.eventId, made.id);
  assert.equal(live?.after, null, 'a feedback-first event has nothing after the quiz');
  const ref = live!.ref;
  const rateId = live!.before!.fields[0]!.id;
  assert.equal(await ef.getEventForPin(db, '999999'), null);

  const submit = (clientId: string, answers: unknown, nickname = 'Asha', stage = 'before') =>
    ef.submitEventFeedback(db, { ref, stage, clientId, nickname, answers });
  assert.deepEqual(await submit('client-0001', {}), { ok: false, error: 'invalid', problems: { [rateId]: 'required' } });
  assert.deepEqual(await submit('bad id!', { [rateId]: 4 }), { ok: false, error: 'bad_request' });
  assert.deepEqual(await submit('client-0003', { [rateId]: 4 }, 'Asha', 'after'), { ok: false, error: 'not_found' }, 'no after form here');
  assert.deepEqual(await submit('client-0001', { [rateId]: 4 }), { ok: true });
  assert.deepEqual(await submit('client-0001', { [rateId]: 2 }), { ok: true }, 'a retried submit is accepted');
  assert.deepEqual(await submit('client-0002', { [rateId]: 5 }, 'Ravi'), { ok: true });
  assert.deepEqual(await ef.countEventFeedback(db, alice.id, made.id), {
    total: 2,
    before: 2,
    after: 0,
    bySession: { '00000000-0000-4000-8000-0000000000e1': 2 },
  });
  assert.equal((await ef.countEventFeedback(db, bob.id, made.id)).total, 0);
  assert.deepEqual(await ef.countGameFeedback(db, alice.id, ref), { before: 2, after: 0 });
  assert.equal(await ef.countGameFeedback(db, bob.id, ref), null, 'only the host sees the live count');

  const exported = await ef.getEventFeedbackExport(db, alice.id, made.id);
  assert.deepEqual(
    exported?.submissions.map((s) => [s.nickname, s.answers[rateId]]),
    [
      ['Asha', 4],
      ['Ravi', 5],
    ],
    'the first submit wins',
  );
  assert.equal(await ef.getEventFeedbackExport(db, bob.id, made.id), null);

  // "Before and after": the second form is reachable by ref even after the game has ended.
  const bothEvent = await f.getFeedbackEvent(db, alice.id, both.id);
  await sessions.createGameSession(db, alice, { gameId: '00000000-0000-4000-8000-0000000000e3', pin: '222222', quizId, title: 'Both', questionCount: 1, eventId: both.id });
  const bothInfo = await ef.getEventForPin(db, '222222');
  assert.deepEqual([bothInfo?.before?.id, bothInfo?.after?.id], [bothEvent?.form?.id, afterId]);
  await db.update(schema.gameSessions).set({ status: 'ended' }).where(eq(schema.gameSessions.id, '00000000-0000-4000-8000-0000000000e3'));
  assert.equal(await ef.getEventForPin(db, '222222'), null, 'finished games no longer answer to their PIN');
  const afterRate = bothInfo!.after!.fields[0]!.id;
  assert.deepEqual(
    await ef.submitEventFeedback(db, { ref: bothInfo!.ref, stage: 'after', clientId: 'client-0009', nickname: 'Asha', answers: { [afterRate]: 3 } }),
    { ok: true },
  );
  assert.equal((await ef.countEventFeedback(db, alice.id, both.id)).after, 1);

  await sessions.createGameSession(db, alice, { gameId: '00000000-0000-4000-8000-0000000000e2', pin: '123456', quizId, title: 'Plain', questionCount: 1 });
  assert.equal(await ef.getEventForPin(db, '123456'), null, 'a newer plain game with a reused PIN asks for no feedback');

  await db.update(schema.gameSessions).set({ status: 'ended' });
  assert.equal(await ef.getEventForPin(db, '123456'), null, 'only running games answer to a PIN');
});

test('events can be edited and deleted by their owner; forms report how they are used', async () => {
  const quizId = await quizzes.createQuiz(db, alice, 'Edit quiz');
  const formId = await f.createFeedbackForm(db, alice);
  const otherForm = await f.createFeedbackForm(db, alice);
  const input = {
    title: 'Original',
    description: '',
    quizId,
    formId,
    afterFormId: null,
    flow: 'before' as const,
    identity: 'identified' as const,
    feedbackRequired: true,
    allowLateEntry: true,
  };
  const made = await f.createFeedbackEvent(db, alice, input);
  assert.ok(made.ok);
  assert.deepEqual(await f.feedbackFormUsage(db, alice.id, formId), { events: 1, responses: 0 });

  const edited = await f.updateFeedbackEvent(db, alice, made.id, { ...input, title: 'Renamed', flow: 'after', formId: otherForm, allowLateEntry: false });
  assert.deepEqual(edited, { ok: true, id: made.id });
  const after = await f.getFeedbackEvent(db, alice.id, made.id);
  assert.deepEqual([after?.title, after?.flow, after?.form?.id, after?.allowLateEntry], ['Renamed', 'after', otherForm, false]);
  assert.equal((await f.feedbackFormUsage(db, alice.id, formId)).events, 0);
  assert.equal((await f.updateFeedbackEvent(db, bob, made.id, input)).ok, false, 'only the owner edits');
  assert.equal((await f.updateFeedbackEvent(db, alice, made.id, { ...input, formId: null })).ok, false, 'still validated');

  await sessions.createGameSession(db, alice, { gameId: '00000000-0000-4000-8000-0000000000f1', pin: '333333', quizId, title: 'Edit quiz', questionCount: 1, eventId: made.id });
  assert.equal(await f.deleteFeedbackEvent(db, bob, made.id), false);
  assert.equal(await f.deleteFeedbackEvent(db, alice, made.id), true);
  assert.equal(await f.getFeedbackEvent(db, alice.id, made.id), null);
  const kept = await sessions.getSessionReport(db, alice.id, '00000000-0000-4000-8000-0000000000f1');
  assert.equal(kept?.pin, '333333', 'the launch report survives deleting its event');
});
