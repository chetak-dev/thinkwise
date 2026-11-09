import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { PgDialect } from 'drizzle-orm/pg-core';
import { drizzle, PgliteSession } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { MIGRATIONS_FOLDER } from '../src/migrate';

test('gender migration preserves existing profiles and leaves their choice unset', async () => {
  const client = new PGlite();
  const db = drizzle(client);
  const config = { migrationsFolder: MIGRATIONS_FOLDER };
  try {
    const migrations = readMigrationFiles(config);
    assert.ok(migrations.length >= 15);
    const dialect = new PgDialect();
    const session = new PgliteSession<Record<string, never>, Record<string, never>>(client, dialect, undefined);
    await dialect.migrate(migrations.slice(0, 14), session, config);
    await client.query(
      'insert into users (email, name, phone, address) values ($1, $2, $3, $4)',
      ['legacy@example.com', 'Legacy User', '+91 98765 43210', '12 Main Road, Bhubaneswar'],
    );

    await migrate(db, config);
    const result = await client.query('select name, phone, address, gender from users where email = $1', ['legacy@example.com']);
    assert.deepEqual(result.rows[0], {
      name: 'Legacy User',
      phone: '+91 98765 43210',
      address: '12 Main Road, Bhubaneswar',
      gender: null,
    });
  } finally {
    await client.close();
  }
});
