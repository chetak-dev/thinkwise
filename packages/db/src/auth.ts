import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { and, eq, gt, lt } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from './client';
import { auditLog, organisations, sessions, users, type User } from './schema';

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const BCRYPT_ROUNDS = 12;

let dummyHash: Promise<string> | null = null;
// Unknown emails are checked against this so they take as long as real password checks.
function getDummyHash() {
  dummyHash ??= bcrypt.hash(randomBytes(16).toString('hex'), BCRYPT_ROUNDS);
  return dummyHash;
}

export const RegisterInput = z.object({
  name: z.string().trim().min(1, 'Please enter your name.').max(80),
  email: z.string().trim().toLowerCase().pipe(z.email('Please enter a valid email address.')).pipe(z.string().max(254)),
  password: z
    .string()
    .min(8, 'Use at least 8 characters.')
    .refine((p) => Buffer.byteLength(p, 'utf8') <= 72, 'Use at most 72 characters.'),
  organisation: z.string().trim().max(120).optional().default(''),
});
export type RegisterInput = z.input<typeof RegisterInput>;

export const LoginInput = z.object({
  email: z.string().trim().toLowerCase().max(254),
  password: z.string().min(1).max(200),
});

export type PublicUser = Pick<User, 'id' | 'email' | 'name' | 'role' | 'orgId' | 'locale' | 'canHost'>;

const publicColumns = {
  id: users.id,
  email: users.email,
  name: users.name,
  role: users.role,
  orgId: users.orgId,
  locale: users.locale,
  canHost: users.canHost,
};

export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export async function registerUser(db: Db, input: RegisterInput): Promise<{ ok: true; user: PublicUser } | { ok: false; field: 'email'; error: string }> {
  const data = RegisterInput.parse(input);
  const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
  try {
    const user = await db.transaction(async (tx) => {
      let orgId: string | null = null;
      if (data.organisation) {
        const [org] = await tx.insert(organisations).values({ name: data.organisation }).returning({ id: organisations.id });
        orgId = org!.id;
      }
      const [created] = await tx
        .insert(users)
        .values({ email: data.email, name: data.name, passwordHash, role: orgId ? 'org_admin' : 'host', orgId })
        .returning(publicColumns);
      await tx.insert(auditLog).values({ orgId, userId: created!.id, action: 'auth.register' });
      return created!;
    });
    return { ok: true, user };
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, field: 'email', error: 'An account with this email already exists.' };
    throw err;
  }
}

function isUniqueViolation(err: unknown): boolean {
  for (let e: unknown = err; e && typeof e === 'object'; e = (e as { cause?: unknown }).cause) {
    if ((e as { code?: string }).code === '23505') return true;
  }
  return false;
}

export async function authenticate(db: Db, email: string, password: string): Promise<PublicUser | null> {
  const parsed = LoginInput.safeParse({ email, password });
  if (!parsed.success) {
    await bcrypt.compare(password.slice(0, 200), await getDummyHash());
    return null;
  }
  const [row] = await db
    .select({ ...publicColumns, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.email, parsed.data.email))
    .limit(1);
  const ok = await bcrypt.compare(parsed.data.password, row?.passwordHash ?? (await getDummyHash()));
  if (!row || !ok) return null;
  const { passwordHash: _, ...user } = row;
  await db.insert(auditLog).values({ orgId: user.orgId, userId: user.id, action: 'auth.login' });
  return user;
}

/** Signs in with a Google account, linking it to an existing account with the same verified email or creating one. */
export async function signInWithGoogle(
  db: Db,
  profile: { sub: string; email: string; emailVerified: boolean; name: string },
): Promise<PublicUser | null> {
  const email = profile.email.trim().toLowerCase();
  if (!profile.sub || profile.sub.length > 255 || !profile.emailVerified || !z.email().safeParse(email).success) return null;
  const name = profile.name.trim().slice(0, 80) || email.split('@')[0]!;

  const [byGoogle] = await db.select(publicColumns).from(users).where(eq(users.googleId, profile.sub)).limit(1);
  let user: PublicUser | undefined = byGoogle;
  let action = 'auth.login_google';
  if (!user) {
    const [byEmail] = await db
      .select({ ...publicColumns, googleId: users.googleId })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (byEmail) {
      // An email already tied to a different Google account is never taken over.
      if (byEmail.googleId) return null;
      await db.update(users).set({ googleId: profile.sub }).where(eq(users.id, byEmail.id));
      const { googleId: _, ...rest } = byEmail;
      user = rest;
      action = 'auth.link_google';
    } else {
      try {
        [user] = await db.insert(users).values({ email, name, googleId: profile.sub }).returning(publicColumns);
        action = 'auth.register_google';
      } catch (err) {
        // Two first sign-ins racing each other: the other one created the account.
        if (!isUniqueViolation(err)) throw err;
        [user] = await db.select(publicColumns).from(users).where(eq(users.googleId, profile.sub)).limit(1);
        if (!user) return null;
      }
    }
  }
  await db.insert(auditLog).values({ orgId: user!.orgId, userId: user!.id, action });
  return user!;
}

/** Returns the raw token for the cookie; only its hash is stored. */
export async function createSession(db: Db, userId: string) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({ id: hashToken(token), userId, expiresAt });
  return { token, expiresAt };
}

export async function getSessionUser(db: Db, token: string | undefined | null): Promise<PublicUser | null> {
  if (!token || token.length > 200) return null;
  const [row] = await db
    .select(publicColumns)
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.id, hashToken(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  return row ?? null;
}

export async function deleteSession(db: Db, token: string | undefined | null) {
  if (!token) return;
  await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
}

export async function purgeExpiredSessions(db: Db) {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}

export async function getOrganisationName(db: Db, orgId: string | null) {
  if (!orgId) return null;
  const [org] = await db.select({ name: organisations.name }).from(organisations).where(eq(organisations.id, orgId)).limit(1);
  return org?.name ?? null;
}
