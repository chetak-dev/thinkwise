import { fileURLToPath } from 'node:url';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import type { PgliteDatabase } from 'drizzle-orm/pglite';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { openDb, pgliteDir } from './client';

export const MIGRATIONS_FOLDER = fileURLToPath(new URL('../drizzle', import.meta.url));

export async function migrateHandle(handle: ReturnType<typeof openDb>) {
  if (handle.kind === 'postgres') {
    await migratePg(handle.db as unknown as NodePgDatabase, { migrationsFolder: MIGRATIONS_FOLDER });
  } else {
    await migratePglite(handle.db as unknown as PgliteDatabase, { migrationsFolder: MIGRATIONS_FOLDER });
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  // Hosted Postgres (e.g. Neon) gives a direct URL for schema changes alongside the pooled one.
  if (process.env.DATABASE_URL_UNPOOLED) process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED;
  const handle = openDb();
  const target = handle.kind === 'postgres' ? 'PostgreSQL (DATABASE_URL)' : `PGlite at ${pgliteDir()}`;
  try {
    await migrateHandle(handle);
    console.log(`Database migrated: ${target}`);
  } finally {
    await handle.close();
  }
}
