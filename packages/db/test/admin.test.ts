import { before, test } from 'node:test';
import assert from 'node:assert/strict';

process.env.PGLITE_DIR = 'memory://';
delete process.env.DATABASE_URL;

const { openDb } = await import('../src/client');
const { migrateHandle } = await import('../src/migrate');
const auth = await import('../src/auth');
const admin = await import('../src/admin');

const handle = openDb();
const db = handle.db;

before(async () => {
  await migrateHandle(handle);
});

async function user(name: string, email: string) {
  const r = await auth.registerUser(db, { name, email, password: 'pass-word-1' });
  if (!r.ok) throw new Error('setup failed');
  return r.user;
}

test('only site admins grant hosting; site admins always host', async () => {
  const site = await user('Chetak', 'Chetak526@gmail.com');
  const amit = await user('Amit', 'amit@example.com');
  const neha = await user('Neha', 'neha@example.com');
  assert.equal(admin.isSiteAdmin(site), true, 'email case does not matter');
  assert.equal(admin.canHost(site), true);
  assert.equal(admin.canHost(amit), false);

  assert.equal((await admin.setUserCanHost(db, amit, neha.id, true)).ok, false, 'normal users cannot grant');
  assert.equal((await admin.setUserCanHost(db, site, site.id, false)).ok, false, 'site admins stay admins');
  assert.ok((await admin.setUserCanHost(db, site, amit.id, true)).ok);
  const found = await admin.listUsersForAdmin(db, 'amit', 10);
  assert.equal(found[0]?.canHost, true);
  assert.equal((await admin.setUserCanHost(db, { ...amit, canHost: true }, neha.id, true)).ok, false, 'granted admins cannot grant');
  assert.equal((await admin.listUsersForAdmin(db, '%', 10)).length, 0, 'wildcards are taken literally');

  assert.ok((await admin.setUserCanHost(db, site, amit.id, false)).ok);
  const log = await admin.listActivity(db, { limit: 10 });
  assert.deepEqual(log.slice(0, 2).map((r) => r.action).sort(), ['admin.grant', 'admin.revoke']);
});
