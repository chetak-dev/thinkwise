import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema';

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

interface DbHandle {
  db: Db;
  kind: 'postgres' | 'pglite';
  close: () => Promise<void>;
}

// Local PGlite only; the ignore hints keep hosted builds from bundling the whole repository.
function repoRoot(start = process.cwd()) {
  let dir = resolve(/*turbopackIgnore: true*/ start);
  for (;;) {
    const pkg = join(dir, 'package.json');
    if (existsSync(pkg) && readFileSync(pkg, 'utf8').includes('"workspaces"')) return dir;
    const parent = dirname(dir);
    if (parent === dir) return resolve(/*turbopackIgnore: true*/ start);
    dir = parent;
  }
}

/** PGlite data location for local development; `memory://` gives a throwaway in-memory database. */
export function pgliteDir() {
  const configured = process.env.PGLITE_DIR;
  if (configured === 'memory://') return configured;
  return configured ? resolve(configured) : join(repoRoot(), '.data', 'pglite');
}

export function openDb(): DbHandle {
  const url = process.env.DATABASE_URL;
  if (url) {
    const pool = new pg.Pool({ connectionString: url, max: Number(process.env.DATABASE_POOL_MAX ?? 10) });
    return { db: drizzlePg(pool, { schema }) as unknown as Db, kind: 'postgres', close: () => pool.end() };
  }
  const dir = pgliteDir();
  if (dir !== 'memory://') mkdirSync(dir, { recursive: true });
  const client = dir === 'memory://' ? new PGlite() : new PGlite(dir);
  return { db: drizzlePglite(client, { schema }) as unknown as Db, kind: 'pglite', close: () => client.close() };
}

const globalForDb = globalThis as unknown as { __twDb?: DbHandle };

/** One shared connection per process (survives dev hot reloads). */
export function getDb(): Db {
  globalForDb.__twDb ??= openDb();
  return globalForDb.__twDb.db;
}
