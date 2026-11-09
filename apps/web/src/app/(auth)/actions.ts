'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import {
  RegisterInput,
  authenticate,
  createSession,
  deleteSession,
  getDb,
  registerUser,
  updateProfile,
} from '@thinkwise/db';
import { SESSION_COOKIE, afterSignIn, clearSessionCookie, getCurrentUser, safeNext, setSessionCookie } from '@/lib/session';

export interface FormState {
  error?: string;
  fieldErrors?: Partial<Record<'name' | 'email' | 'password', string>>;
  values?: { name?: string; email?: string };
}

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;
const attempts = new Map<string, { count: number; start: number }>();

async function clientKey(email: string) {
  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'local';
  return `${ip}|${email.toLowerCase()}`;
}

function tooMany(key: string) {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now - entry.start > WINDOW_MS) {
    attempts.set(key, { count: 1, start: now });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_ATTEMPTS;
}

export async function registerAction(_prev: FormState | undefined, form: FormData): Promise<FormState> {
  const raw = {
    name: String(form.get('name') ?? ''),
    email: String(form.get('email') ?? ''),
    password: String(form.get('password') ?? ''),
  };
  const next = safeNext(form.get('next'));
  const values = { name: raw.name, email: raw.email };
  const parsed = RegisterInput.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: FormState['fieldErrors'] = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as keyof NonNullable<FormState['fieldErrors']>;
      fieldErrors[field] ??= issue.message;
    }
    return { fieldErrors, values };
  }
  if (tooMany(await clientKey(`register|${parsed.data.email}`))) {
    return { error: 'Too many attempts. Please wait a few minutes and try again.', values };
  }

  const db = getDb();
  const result = await registerUser(db, parsed.data);
  if (!result.ok) return { fieldErrors: { email: result.error }, values };

  const session = await createSession(db, result.user.id);
  await setSessionCookie(session.token, session.expiresAt);
  redirect(afterSignIn(result.user, next));
}

export async function loginAction(_prev: FormState | undefined, form: FormData): Promise<FormState> {
  const email = String(form.get('email') ?? '').trim();
  const password = String(form.get('password') ?? '');
  const next = safeNext(form.get('next'));
  const values = { email };
  if (!email || !password) return { error: 'Enter your email and password.', values };
  if (tooMany(await clientKey(email))) {
    return { error: 'Too many sign-in attempts. Please wait a few minutes and try again.', values };
  }

  const db = getDb();
  const user = await authenticate(db, email, password);
  if (!user) return { error: 'That email and password don’t match an account.', values };

  const session = await createSession(db, user.id);
  await setSessionCookie(session.token, session.expiresAt);
  redirect(afterSignIn(user, next));
}

export interface ProfileFormState {
  error?: string;
  saved?: boolean;
  fieldErrors?: Partial<Record<'name' | 'phone' | 'address' | 'gender', string>>;
  values?: { name: string; phone: string; address: string; gender: string };
}

/** Saves the account's profile; `next` is where to go afterwards (empty to stay on the page). */
export async function profileAction(_prev: ProfileFormState | undefined, form: FormData): Promise<ProfileFormState> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const values = {
    name: String(form.get('name') ?? ''),
    phone: String(form.get('phone') ?? ''),
    address: String(form.get('address') ?? ''),
    gender: String(form.get('gender') ?? ''),
  };
  if (tooMany(await clientKey(`profile|${user.id}`))) {
    return { error: 'Too many attempts. Please wait a few minutes and try again.', values };
  }
  const result = await updateProfile(getDb(), user, values);
  if (!result.ok) return { fieldErrors: result.fieldErrors, values };
  revalidatePath('/', 'layout');
  const next = form.get('next');
  if (next) redirect(safeNext(next));
  return { saved: true, values };
}

export async function logoutAction() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  await deleteSession(getDb(), token);
  await clearSessionCookie();
  redirect('/login');
}
