import { desc, eq, ilike, or, sql } from 'drizzle-orm';
import type { Db } from './client';
import { auditLog, users } from './schema';
import type { PublicUser } from './auth';

/** Site admins are fixed here; only they can make or remove other admins. */
export const SITE_ADMIN_EMAILS: readonly string[] = ['chetak526@gmail.com', 'chetakkumarpradhan@gmail.com'];

export function isSiteAdmin(user: Pick<PublicUser, 'email'> | null | undefined) {
  return !!user && SITE_ADMIN_EMAILS.includes(user.email.trim().toLowerCase());
}

/** Admins (granted by a site admin) and site admins can host quizzes and events. */
export function canHost(user: Pick<PublicUser, 'email' | 'canHost'> | null | undefined) {
  return !!user && (user.canHost || isSiteAdmin(user));
}

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  canHost: boolean;
  siteAdmin: boolean;
  createdAt: number;
}

export async function listUsersForAdmin(db: Db, search = '', limit = 200): Promise<AdminUserRow[]> {
  const q = search.trim().slice(0, 100).replace(/[\\%_]/g, '\\$&');
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email, canHost: users.canHost, createdAt: users.createdAt })
    .from(users)
    .where(q ? or(ilike(users.email, `%${q}%`), ilike(users.name, `%${q}%`)) : undefined)
    .orderBy(desc(users.canHost), desc(users.createdAt))
    .limit(limit);
  return rows
    .map((r) => {
      const siteAdmin = isSiteAdmin(r);
      return { ...r, canHost: r.canHost || siteAdmin, siteAdmin, createdAt: r.createdAt.getTime() };
    })
    .sort((a, b) => Number(b.siteAdmin) - Number(a.siteAdmin));
}

export type SetAdminResult = { ok: true } | { ok: false; error: string };

export async function setUserCanHost(db: Db, actor: PublicUser, userId: string, on: boolean): Promise<SetAdminResult> {
  if (!isSiteAdmin(actor)) return { ok: false, error: 'Only a site admin can change admins.' };
  const [target] = await db.select({ email: users.email, canHost: users.canHost }).from(users).where(eq(users.id, userId)).limit(1);
  if (!target) return { ok: false, error: 'That account no longer exists.' };
  if (isSiteAdmin(target)) return { ok: false, error: 'Site admins always keep admin access.' };
  if (target.canHost === on) return { ok: true };
  await db.update(users).set({ canHost: on }).where(eq(users.id, userId));
  await db.insert(auditLog).values({
    orgId: actor.orgId,
    userId: actor.id,
    action: on ? 'admin.grant' : 'admin.revoke',
    meta: { targetId: userId, targetEmail: target.email },
  });
  return { ok: true };
}

export interface ActivityRow {
  id: string;
  at: number;
  action: string;
  userName: string | null;
  userEmail: string | null;
  meta: Record<string, unknown> | null;
}

/** Everything except sign-ins, newest first. */
export async function listActivity(db: Db, { limit = 100, before }: { limit?: number; before?: number } = {}): Promise<ActivityRow[]> {
  const conditions = [sql`${auditLog.action} not like 'auth.login%'`];
  if (before) conditions.push(sql`${auditLog.createdAt} < ${new Date(before)}`);
  const rows = await db
    .select({
      id: auditLog.id,
      at: auditLog.createdAt,
      action: auditLog.action,
      meta: auditLog.meta,
      userName: users.name,
      userEmail: users.email,
    })
    .from(auditLog)
    .leftJoin(users, eq(auditLog.userId, users.id))
    .where(sql.join(conditions, sql` and `))
    .orderBy(desc(auditLog.createdAt))
    .limit(Math.min(Math.max(limit, 1), 500));
  return rows.map((r) => ({ ...r, at: r.at.getTime(), meta: (r.meta as Record<string, unknown> | null) ?? null }));
}
