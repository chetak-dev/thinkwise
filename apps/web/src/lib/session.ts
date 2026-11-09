import 'server-only';

import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { canHost, getDb, getSessionUser, isSiteAdmin, profileComplete, type PublicUser } from '@thinkwise/db';

export const SESSION_COOKIE = 'tw_session';

export const getCurrentUser = cache(async (): Promise<PublicUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return getSessionUser(getDb(), token);
});

export function getAccess(user: PublicUser | null) {
  return { canHost: canHost(user), siteAdmin: isSiteAdmin(user) };
}

/** For signed-in pages; accounts with an incomplete profile complete it first. */
export async function requireUser(next = '/dashboard'): Promise<PublicUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (!profileComplete(user)) redirect(`/welcome?next=${encodeURIComponent(next)}`);
  return user;
}

/** For pages only admins may open; everyone else goes back to the dashboard. */
export async function requireHost(next = '/dashboard'): Promise<PublicUser> {
  const user = await requireUser(next);
  if (!canHost(user)) redirect('/dashboard');
  return user;
}

/** For host APIs: a complete profile and permission to create and host quizzes. */
export async function getHostUser(): Promise<PublicUser | null> {
  const user = await getCurrentUser();
  return user && profileComplete(user) && canHost(user) ? user : null;
}

/** For pages only site admins may open. */
export async function requireSiteAdmin(next = '/dashboard'): Promise<PublicUser> {
  const user = await requireUser(next);
  if (!isSiteAdmin(user)) redirect('/dashboard');
  return user;
}

/** For participant APIs: a signed-in account with a complete profile. */
export async function getParticipant(): Promise<
  { ok: true; user: PublicUser } | { ok: false; error: 'sign_in' | 'profile'; status: 401 | 403 }
> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'sign_in', status: 401 };
  if (!profileComplete(user)) return { ok: false, error: 'profile', status: 403 };
  return { ok: true, user };
}

/** Where to send someone after signing in: first to complete their profile if it is missing. */
export function afterSignIn(user: PublicUser, next: string) {
  return profileComplete(user) ? next : `/welcome?next=${encodeURIComponent(next)}`;
}

export async function setSessionCookie(token: string, expiresAt: Date) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}

/** Only same-site relative paths, so a crafted ?next= can't send people to another site. */
export function safeNext(next: unknown, fallback = '/dashboard') {
  if (typeof next !== 'string' || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return fallback;
  return next;
}
