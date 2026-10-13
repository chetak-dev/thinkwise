import 'server-only';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';
const TIMEOUT_MS = 10_000;

export const GOOGLE_STATE_COOKIE = 'tw_google';
export const GOOGLE_STATE_TTL_S = 600;

export function isGoogleEnabled() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

/** The origin the browser used; `nextUrl.origin` is the bind address (0.0.0.0) in local dev. */
export function publicOrigin(request: Request) {
  const url = new URL(request.url);
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? url.host;
  const proto = request.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '');
  return `${proto}://${host}`;
}

/** Must exactly match an Authorised redirect URI in the Google Cloud console. */
export function redirectUri(origin: string) {
  return `${process.env.APP_URL?.replace(/\/$/, '') || origin}/auth/google/callback`;
}

export interface GoogleState {
  state: string;
  verifier: string;
  next: string;
}

export function startGoogleSignIn(origin: string, next: string) {
  const state = randomBytes(24).toString('base64url');
  const verifier = randomBytes(48).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(origin),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  }).toString();
  const cookie = Buffer.from(JSON.stringify({ state, verifier, next } satisfies GoogleState)).toString('base64url');
  return { url: url.toString(), cookie };
}

export function readGoogleState(cookie: string | undefined): GoogleState | null {
  if (!cookie || cookie.length > 1000) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cookie, 'base64url').toString('utf8')) as Partial<GoogleState>;
    if (typeof parsed.state !== 'string' || typeof parsed.verifier !== 'string' || typeof parsed.next !== 'string') return null;
    return parsed as GoogleState;
  } catch {
    return null;
  }
}

export function sameState(expected: string, given: string | null) {
  if (!given) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface GoogleProfile {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
}

/** Swaps the one-time code for tokens, then reads the signed-in account straight from Google. */
export async function fetchGoogleProfile(code: string, verifier: string, origin: string): Promise<GoogleProfile | null> {
  const tokenRes = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      code_verifier: verifier,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri(origin),
      grant_type: 'authorization_code',
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!tokenRes.ok) {
    console.error('Google token exchange failed', tokenRes.status, (await tokenRes.text()).slice(0, 300));
    return null;
  }
  const { access_token } = (await tokenRes.json()) as { access_token?: string };
  if (!access_token) return null;

  const infoRes = await fetch(USERINFO_URL, {
    headers: { authorization: `Bearer ${access_token}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!infoRes.ok) return null;
  const info = (await infoRes.json()) as { sub?: unknown; email?: unknown; email_verified?: unknown; name?: unknown };
  if (typeof info.sub !== 'string' || typeof info.email !== 'string') return null;
  return {
    sub: info.sub,
    email: info.email,
    emailVerified: info.email_verified === true || info.email_verified === 'true',
    name: typeof info.name === 'string' ? info.name : '',
  };
}
