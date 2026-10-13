import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { newQuestion, toPlayable } from '@thinkwise/shared';

process.env.PGLITE_DIR = 'memory://';
delete process.env.DATABASE_URL;

const { openDb } = await import('../src/client');
const { migrateHandle } = await import('../src/migrate');
const auth = await import('../src/auth');
const q = await import('../src/quizzes');
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

test('create, list, load and save a quiz', async () => {
  const id = await q.createQuiz(db, alice);
  const loaded = await q.getQuiz(db, alice.id, id);
  assert.equal(loaded?.title, 'Untitled quiz');
  assert.equal(loaded?.questions.length, 1, 'new quizzes start with one blank question');

  const questions = [
    { ...newQuestion('mc', 'q1'), text: 'Capital of India?', options: ['Mumbai', 'New Delhi', 'Kolkata'], correct: [1] },
    { ...newQuestion('tf', 'q2'), text: 'The Earth is round.', correct: [0], timeLimitMs: 10_000, points: 500 },
  ];
  const savedAt = await q.saveQuiz(db, alice.id, id, { title: 'Geography', description: 'Warm-up', questions });
  assert.ok(savedAt instanceof Date);

  const again = await q.getQuiz(db, alice.id, id);
  assert.equal(again?.title, 'Geography');
  assert.deepEqual(again?.questions, questions);

  const list = await q.listQuizzes(db, alice.id);
  assert.equal(list[0]?.id, id);
  assert.equal(list[0]?.questionCount, 2);
  assert.equal(await q.countQuizzes(db, alice.id), 1);

  const check = toPlayable(again!.title, again!.questions);
  assert.equal(check.ok, true, 'a complete quiz is playable');
});

test('drafts may be incomplete but must keep their shape', async () => {
  const id = await q.createQuiz(db, alice);
  const draft = [{ ...newQuestion('mc', 'd1'), text: '' }];
  assert.ok(await q.saveQuiz(db, alice.id, id, { title: '', description: '', questions: draft }), 'empty text is fine in a draft');
  const check = toPlayable('', draft);
  assert.equal(check.ok, false);
  if (!check.ok) {
    assert.equal(check.titleMissing, true);
    assert.deepEqual(check.problems[0]?.issues, ['Add the question text', 'Add at least two answers']);
  }
  await assert.rejects(
    q.saveQuiz(db, alice.id, id, { title: 'x', description: '', questions: [{ ...newQuestion('mc', 'd2'), timeLimitMs: 7 }] }),
    'unsupported time limit rejected',
  );
  await assert.rejects(
    q.saveQuiz(db, alice.id, id, { title: 'x', description: '', questions: [{ ...newQuestion('mc', 'd3'), options: ['only one'] }] }),
    'too few options rejected',
  );
});

test("one host can never read, change, copy or delete another host's quiz", async () => {
  const id = await q.createQuiz(db, alice, 'Alice private');
  assert.equal(await q.getQuiz(db, bob.id, id), null);
  assert.equal(await q.saveQuiz(db, bob.id, id, { title: 'hacked', description: '', questions: [] }), null);
  assert.equal(await q.duplicateQuiz(db, bob, id), null);
  assert.equal(await q.deleteQuiz(db, bob, id), false);
  assert.equal((await q.getQuiz(db, alice.id, id))?.title, 'Alice private', 'untouched');
  assert.ok(!(await q.listQuizzes(db, bob.id)).some((x) => x.id === id));
  assert.equal(await q.getQuiz(db, alice.id, 'not-a-uuid'), null, 'malformed ids are rejected, not queried');
});

test('duplicate copies questions; delete removes', async () => {
  const id = await q.createQuiz(db, alice, 'Original');
  const copyId = await q.duplicateQuiz(db, alice, id);
  assert.ok(copyId && copyId !== id);
  const copy = await q.getQuiz(db, alice.id, copyId!);
  assert.equal(copy?.title, 'Original (copy)');
  assert.equal(copy?.questions.length, 1);
  assert.equal(await q.deleteQuiz(db, alice, copyId!), true);
  assert.equal(await q.getQuiz(db, alice.id, copyId!), null);
});

test('quiz settings: defaults for older quizzes, saved with the quiz, validated and copied', async () => {
  const id = await q.createQuiz(db, alice, 'With settings');
  const fresh = await q.getQuiz(db, alice.id, id);
  assert.equal(fresh?.settings.visibility, 'private');
  assert.equal(fresh?.settings.graceMs, 750);
  assert.equal(fresh?.settings.showLeaderboard, true);

  const questions = fresh!.questions;
  const settings = { ...fresh!.settings, subject: 'Science', visibility: 'unlisted' as const, scoring: 'accuracy' as const, themeColour: '#0ea595' };
  await q.saveQuiz(db, alice.id, id, { title: 'With settings', description: 'd', questions, settings });
  const saved = await q.getQuiz(db, alice.id, id);
  assert.equal(saved?.settings.subject, 'Science');
  assert.equal(saved?.settings.visibility, 'unlisted');

  await q.saveQuiz(db, alice.id, id, { title: 'Renamed', description: 'd', questions });
  assert.equal((await q.getQuiz(db, alice.id, id))?.settings.subject, 'Science', 'saving without settings keeps them');

  await assert.rejects(
    q.saveQuiz(db, alice.id, id, { title: 'x', description: '', questions, settings: { ...settings, themeColour: 'url(x)' } }),
    'colour must be a hex value',
  );
  await assert.rejects(
    q.saveQuiz(db, alice.id, id, { title: 'x', description: '', questions, settings: { ...settings, visibility: 'everyone' as never } }),
    'unknown visibility rejected',
  );

  const copyId = await q.duplicateQuiz(db, alice, id);
  assert.equal((await q.getQuiz(db, alice.id, copyId!))?.settings.scoring, 'accuracy', 'duplicate keeps settings');
});

test('publishing: only complete quizzes, only by the owner, snapshot frozen until the next publish', async () => {
  const id = await q.createQuiz(db, alice, 'To publish');
  assert.equal((await q.getQuiz(db, alice.id, id))?.status, 'draft');

  const blocked = await q.publishQuiz(db, alice, id);
  assert.equal(blocked.ok, false);
  if (!blocked.ok) assert.equal(blocked.reason, 'not_ready', 'a blank question blocks publishing');

  const ready = [{ ...newQuestion('mc', 'p1'), text: 'Two plus two?', options: ['3', '4'], correct: [1] }];
  await q.saveQuiz(db, alice.id, id, { title: 'To publish', description: 'v1', questions: ready });
  assert.deepEqual(await q.publishQuiz(db, bob, id), { ok: false, reason: 'not_found' }, 'another host cannot publish');
  const first = await q.publishQuiz(db, alice, id);
  assert.equal(first.ok, true);

  const loaded = await q.getQuiz(db, alice.id, id);
  assert.equal(loaded?.status, 'published');
  assert.ok(loaded?.publishedAt instanceof Date);
  assert.equal((await q.listQuizzes(db, alice.id)).find((x) => x.id === id)?.status, 'published');

  await q.saveQuiz(db, alice.id, id, { title: 'To publish', description: 'v2', questions: [{ ...ready[0]!, text: 'Draft edit' }] });
  const snap = async () => {
    const [row] = await db.select({ published: schema.quizzes.published }).from(schema.quizzes).where(eq(schema.quizzes.id, id));
    return row as { published: { questions: { text: string }[]; description: string } };
  };
  assert.equal((await snap()).published.questions[0]?.text, 'Two plus two?', 'draft edits do not touch the published copy');
  await q.publishQuiz(db, alice, id);
  assert.equal((await snap()).published.questions[0]?.text, 'Draft edit', 'publish update replaces it');
  assert.equal((await snap()).published.description, 'v2');

  const copyId = await q.duplicateQuiz(db, alice, id);
  assert.equal((await q.getQuiz(db, alice.id, copyId!))?.status, 'draft', 'copies start as drafts');
});

test('library: scopes, search by title/subject/tag, favourites and archive', async () => {
  const reg = await auth.registerUser(db, { name: 'Cara', email: 'cara@example.com', password: 'cara-pass-12' });
  if (!reg.ok) throw new Error('setup failed');
  const cara = reg.user;
  const ids = (list: { id: string }[]) => list.map((x) => x.id).sort();

  const draft = await q.createQuiz(db, cara, 'Fractions 100% fun');
  const pub = await q.createQuiz(db, cara, 'Planets');
  const settings = { ...(await q.getQuiz(db, cara.id, pub))!.settings, subject: 'Astronomy', tags: 'space, grade_7' };
  const ready = [{ ...newQuestion('mc', 'l1'), text: 'Largest planet?', options: ['Mars', 'Jupiter'], correct: [1] }];
  await q.saveQuiz(db, cara.id, pub, { title: 'Planets', description: '', questions: ready, settings });
  assert.equal((await q.publishQuiz(db, cara, pub)).ok, true);

  assert.deepEqual(ids(await q.listQuizzes(db, cara.id)), [draft, pub].sort());
  assert.deepEqual(ids(await q.listQuizzes(db, cara.id, { scope: 'drafts' })), [draft]);
  assert.deepEqual(ids(await q.listQuizzes(db, cara.id, { scope: 'published' })), [pub]);

  assert.deepEqual(ids(await q.listQuizzes(db, cara.id, { q: 'astro' })), [pub], 'subject search');
  assert.deepEqual(ids(await q.listQuizzes(db, cara.id, { q: 'GRADE_7' })), [pub], 'tag search, case-insensitive');
  assert.deepEqual(ids(await q.listQuizzes(db, cara.id, { q: '100%' })), [draft], 'percent is literal');
  assert.deepEqual(ids(await q.listQuizzes(db, cara.id, { q: '_' })), [pub], 'underscore is literal: only the grade_7 tag matches');

  assert.equal(await q.setFavourite(db, bob.id, pub, true), false, "cannot favourite someone else's private quiz");
  assert.equal(await q.setFavourite(db, cara.id, pub, true), true);
  assert.equal(await q.setFavourite(db, cara.id, pub, true), true, 'idempotent');
  const favs = await q.listQuizzes(db, cara.id, { scope: 'favorites' });
  assert.deepEqual(ids(favs), [pub]);
  assert.equal(favs[0]?.favourite, true);
  assert.equal((await q.listQuizzes(db, cara.id)).find((x) => x.id === draft)?.favourite, false);

  assert.equal(await q.setArchived(db, bob, draft, true), false, "cannot archive someone else's quiz");
  assert.equal(await q.setArchived(db, cara, draft, true), true);
  assert.deepEqual(ids(await q.listQuizzes(db, cara.id)), [pub], 'archived quizzes leave My quizzes');
  assert.deepEqual(ids(await q.listQuizzes(db, cara.id, { scope: 'drafts' })), []);
  assert.deepEqual(ids(await q.listQuizzes(db, cara.id, { scope: 'archived' })), [draft]);
  assert.equal(await q.countQuizzes(db, cara.id), 1);
  await q.setArchived(db, cara, draft, false);
  assert.deepEqual(ids(await q.listQuizzes(db, cara.id, { scope: 'archived' })), []);
  assert.equal(await q.countQuizzes(db, cara.id), 2);

  await q.setFavourite(db, cara.id, pub, false);
  assert.deepEqual(await q.listQuizzes(db, cara.id, { scope: 'favorites' }), []);
});

test('sharing: public/unlisted/private, org tab, read-only published copy, host and copy', async () => {
  const d = await auth.registerUser(db, { name: 'Dee', email: 'dee@example.com', password: 'dee-pass-123', organisation: 'Dee School' });
  const e = await auth.registerUser(db, { name: 'Eli', email: 'eli@example.com', password: 'eli-pass-123' });
  if (!d.ok || !e.ok) throw new Error('setup failed');
  const dee = d.user;
  await db.update(schema.users).set({ orgId: dee.orgId }).where(eq(schema.users.id, e.user.id));
  const eli = { ...e.user, orgId: dee.orgId };
  const ids = (list: { id: string }[]) => list.map((x) => x.id).sort();

  const ready = [
    { ...newQuestion('mc', 's1'), text: 'Published text', options: ['A', 'B'], correct: [1], hint: 'think', explanation: 'because' },
  ];
  const make = async (title: string, visibility: 'private' | 'unlisted' | 'public') => {
    const id = await q.createQuiz(db, dee, title);
    const settings = { ...(await q.getQuiz(db, dee.id, id))!.settings, visibility, scoring: 'accuracy' as const };
    await q.saveQuiz(db, dee.id, id, { title, description: 'About it', questions: ready, settings });
    await q.publishQuiz(db, dee, id);
    return id;
  };
  const pub = await make('Shared public', 'public');
  const unl = await make('Shared unlisted', 'unlisted');
  const priv = await make('Kept private', 'private');
  const draftOnly = await q.createQuiz(db, dee, 'Never published');
  await q.saveQuiz(db, dee.id, draftOnly, {
    title: 'Never published',
    description: '',
    questions: ready,
    settings: { ...(await q.getQuiz(db, dee.id, draftOnly))!.settings, visibility: 'public' },
  });

  // The owner edits the draft after publishing; others must only ever see the published copy.
  await q.saveQuiz(db, dee.id, pub, { title: 'Draft rename', description: 'x', questions: [{ ...ready[0]!, text: 'Secret draft text' }] });

  const publicList = await q.listQuizzes(db, bob.id, { scope: 'public' });
  assert.deepEqual(ids(publicList).filter((x) => [pub, unl, priv, draftOnly].includes(x)), [pub], 'only published public quizzes are listed');
  const card = publicList.find((x) => x.id === pub)!;
  assert.equal(card.title, 'Shared public', 'others see the published title, not the draft');
  assert.equal(card.owned, false);
  assert.equal(card.authorName, 'Dee');
  assert.deepEqual(await q.listQuizzes(db, bob.id, { scope: 'public', q: 'rename' }), [], 'draft title is not searchable by others');

  assert.deepEqual(ids(await q.listQuizzes(db, eli.id, { scope: 'org', orgId: eli.orgId })), [pub, unl].sort(), 'org tab: shared quizzes from colleagues');
  assert.deepEqual(await q.listQuizzes(db, bob.id, { scope: 'org', orgId: null }), [], 'no organisation, no org quizzes');
  assert.deepEqual(await q.listQuizzes(db, dee.id, { scope: 'org', orgId: dee.orgId }), [], "own quizzes aren't in the org tab");

  const view = await q.getSharedQuiz(db, bob.id, pub);
  assert.ok(view && view !== 'draft_only');
  assert.equal(view.quiz.questions[0]!.text, 'Published text');
  assert.ok(!JSON.stringify(view).includes('Secret draft text'));
  assert.ok(await q.getSharedQuiz(db, bob.id, unl), 'unlisted is viewable with the link');
  assert.equal(await q.getSharedQuiz(db, bob.id, priv), null, 'private stays private');
  assert.equal(await q.getSharedQuiz(db, bob.id, draftOnly), null, 'never-published stays hidden');
  assert.equal(await q.getSharedQuiz(db, dee.id, draftOnly), 'draft_only');
  assert.equal(await q.getSharedQuiz(db, bob.id, 'not-a-uuid'), null);

  const hostable = await q.getHostablePublished(db, bob.id, pub);
  assert.equal(hostable?.questions[0]?.text, 'Published text');
  assert.equal(hostable?.rules.scoring, 'accuracy', 'game rules travel with the published copy');
  assert.equal(await q.getHostablePublished(db, bob.id, priv), null);

  assert.equal(await q.setFavourite(db, bob.id, pub, true), true, 'can favourite a shared quiz');
  assert.equal(await q.setFavourite(db, bob.id, priv, true), false, 'cannot favourite a private quiz');
  assert.ok((await q.listQuizzes(db, bob.id, { scope: 'favorites' })).some((x) => x.id === pub));
  await q.setArchived(db, dee, pub, true);
  assert.ok(!(await q.listQuizzes(db, bob.id, { scope: 'favorites' })).some((x) => x.id === pub), 'archived by owner: gone for others');
  assert.equal(await q.getSharedQuiz(db, bob.id, pub), null);
  await q.setArchived(db, dee, pub, false);

  const copyId = await q.copyQuiz(db, bob, pub);
  const copy = await q.getQuiz(db, bob.id, copyId!);
  assert.equal(copy?.title, 'Shared public');
  assert.equal(copy?.status, 'draft');
  assert.equal(copy?.settings.visibility, 'private', 'copies are private drafts');
  assert.equal(copy?.settings.scoring, 'accuracy');
  assert.equal(copy?.questions[0]?.text, 'Published text');
  assert.equal(copy?.questions[0]?.explanation, 'because');
  assert.equal(await q.copyQuiz(db, bob, priv), null, 'cannot copy a private quiz');
  assert.equal(await q.getQuiz(db, bob.id, pub), null, 'copying never grants edit access to the original');
});
