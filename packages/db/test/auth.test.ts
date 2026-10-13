import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';

process.env.PGLITE_DIR = 'memory://';
delete process.env.DATABASE_URL;

const { openDb } = await import('../src/client');
const { migrateHandle } = await import('../src/migrate');
const auth = await import('../src/auth');
const { auditLog, sessions, users } = await import('../src/schema');

const handle = openDb();
const db = handle.db;

before(async () => {
  await migrateHandle(handle);
});

test('register creates a user with a bcrypt hash; email is normalised and unique', async () => {
  const res = await auth.registerUser(db, {
    name: 'Riya Sharma',
    email: '  Riya@Example.COM ',
    password: 'correct horse',
    organisation: 'Sunrise School',
  });
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.user.email, 'riya@example.com');
  assert.equal(res.user.role, 'org_admin', 'creating an organisation makes you its admin');
  assert.ok(res.user.orgId);
  assert.ok(!('passwordHash' in res.user), 'public user never carries the hash');

  const [row] = await db.select().from(users).where(eq(users.id, res.user.id));
  assert.match(row!.passwordHash ?? '', /^\$2[aby]\$12\$/);
  assert.notEqual(row!.passwordHash, 'correct horse');

  const dup = await auth.registerUser(db, { name: 'Other', email: 'riya@example.com', password: 'another pass' });
  assert.deepEqual(dup, { ok: false, field: 'email', error: 'An account with this email already exists.' });

  const solo = await auth.registerUser(db, { name: 'Solo', email: 'solo@example.com', password: 'solo-password' });
  assert.equal(solo.ok && solo.user.role, 'host');
  assert.equal(solo.ok && solo.user.orgId, null);
});

test('input validation rejects bad emails and weak or oversized passwords', () => {
  assert.throws(() => auth.RegisterInput.parse({ name: 'A', email: 'not-an-email', password: 'longenough' }));
  assert.throws(() => auth.RegisterInput.parse({ name: 'A', email: 'a@b.co', password: 'short' }));
  assert.throws(() => auth.RegisterInput.parse({ name: 'A', email: 'a@b.co', password: 'x'.repeat(73) }));
  assert.throws(() => auth.RegisterInput.parse({ name: '  ', email: 'a@b.co', password: 'longenough' }));
});

test('authenticate accepts the right password only and records an audit entry', async () => {
  const ok = await auth.authenticate(db, 'RIYA@example.com', 'correct horse');
  assert.equal(ok?.email, 'riya@example.com');
  assert.equal(await auth.authenticate(db, 'riya@example.com', 'wrong'), null);
  assert.equal(await auth.authenticate(db, 'nobody@example.com', 'correct horse'), null);
  assert.equal(await auth.authenticate(db, '', ''), null);
  const logins = await db.select().from(auditLog).where(eq(auditLog.action, 'auth.login'));
  assert.equal(logins.length, 1);
});

test('unknown emails take about as long as wrong passwords (no account enumeration by timing)', async () => {
  await auth.authenticate(db, 'warmup@example.com', 'x');
  const time = async (email: string) => {
    const t0 = performance.now();
    await auth.authenticate(db, email, 'definitely-wrong');
    return performance.now() - t0;
  };
  const known = await time('riya@example.com');
  const unknown = await time('ghost@example.com');
  assert.ok(unknown > known * 0.5, `unknown ${unknown.toFixed(0)}ms vs known ${known.toFixed(0)}ms`);
});

test('sessions: only the hash is stored, lookups work, expiry and sign-out end them', async () => {
  const user = (await auth.authenticate(db, 'riya@example.com', 'correct horse'))!;
  const { token, expiresAt } = await auth.createSession(db, user.id);
  assert.ok(token.length >= 40);
  assert.ok(expiresAt.getTime() > Date.now() + 29 * 24 * 3600 * 1000);

  const stored = await db.select().from(sessions).where(eq(sessions.userId, user.id));
  assert.equal(stored.length, 1);
  assert.notEqual(stored[0]!.id, token, 'raw token is not stored');
  assert.equal(stored[0]!.id, auth.hashToken(token));

  assert.equal((await auth.getSessionUser(db, token))?.id, user.id);
  assert.equal(await auth.getSessionUser(db, token + 'x'), null);
  assert.equal(await auth.getSessionUser(db, undefined), null);
  assert.equal(await auth.getSessionUser(db, 'y'.repeat(500)), null);

  await db.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(sessions.id, auth.hashToken(token)));
  assert.equal(await auth.getSessionUser(db, token), null, 'expired session rejected');
  await auth.purgeExpiredSessions(db);
  assert.equal((await db.select().from(sessions).where(eq(sessions.userId, user.id))).length, 0);

  const second = await auth.createSession(db, user.id);
  await auth.deleteSession(db, second.token);
  assert.equal(await auth.getSessionUser(db, second.token), null, 'signed-out session rejected');
});

test('Google sign-in creates passwordless accounts, links verified emails and never hijacks', async () => {
  const google = (sub: string, email: string, emailVerified = true, name = 'Neha Rao') =>
    auth.signInWithGoogle(db, { sub, email, emailVerified, name });

  const fresh = await google('g-neha', ' Neha@Gmail.com ');
  assert.equal(fresh?.email, 'neha@gmail.com');
  assert.deepEqual([fresh?.name, fresh?.role, fresh?.orgId], ['Neha Rao', 'host', null]);
  const [row] = await db.select().from(users).where(eq(users.id, fresh!.id));
  assert.deepEqual([row!.passwordHash, row!.googleId], [null, 'g-neha']);
  assert.equal(await auth.authenticate(db, 'neha@gmail.com', 'anything at all'), null, 'no password, no password sign-in');
  assert.equal((await google('g-neha', 'neha@gmail.com'))?.id, fresh!.id, 'same Google account, same user');

  const linked = await google('g-riya', 'riya@example.com');
  const riya = (await auth.authenticate(db, 'riya@example.com', 'correct horse'))!;
  assert.equal(linked?.id, riya.id, 'verified email links to the existing password account');
  assert.equal(linked?.orgId, riya.orgId);
  assert.equal((await google('g-riya', 'renamed@example.com'))?.id, riya.id, 'later sign-ins match by Google id');

  assert.equal(await google('g-intruder', 'riya@example.com'), null, 'an email already linked to another Google account is refused');
  assert.equal(await google('g-unverified', 'solo@example.com', false), null, 'unverified emails are never trusted');
  assert.equal(await google('', 'blank@example.com'), null);
  assert.equal(await google('g-bad', 'not-an-email'), null);

  const nameless = await google('g-nameless', 'quiet.person@example.com', true, '  ');
  assert.equal(nameless?.name, 'quiet.person', 'falls back to the email name');

  const actions = (await db.select().from(auditLog)).map((a) => a.action);
  assert.ok(['auth.register_google', 'auth.login_google', 'auth.link_google'].every((a) => actions.includes(a)));
});
