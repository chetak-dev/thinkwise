import { NextResponse, type NextRequest } from 'next/server';
import { createSession, getDb, signInWithGoogle } from '@thinkwise/db';
import { GOOGLE_STATE_COOKIE, fetchGoogleProfile, isGoogleEnabled, publicOrigin, readGoogleState, sameState } from '@/lib/google';
import { SESSION_COOKIE, safeNext } from '@/lib/session';

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const origin = publicOrigin(request);
  const saved = readGoogleState(request.cookies.get(GOOGLE_STATE_COOKIE)?.value);
  const goTo = (path: string) => {
    const response = NextResponse.redirect(new URL(path, origin));
    response.cookies.delete({ name: GOOGLE_STATE_COOKIE, path: '/auth/google' });
    return response;
  };

  // The person backed out of Google's account chooser.
  if (params.get('error') === 'access_denied') return goTo('/login');
  const code = params.get('code');
  if (!isGoogleEnabled() || !saved || !code || code.length > 2000 || !sameState(saved.state, params.get('state'))) {
    return goTo('/login?error=google');
  }

  try {
    const profile = await fetchGoogleProfile(code, saved.verifier, origin);
    const db = getDb();
    const user = profile && (await signInWithGoogle(db, profile));
    if (!user) return goTo('/login?error=google');
    const session = await createSession(db, user.id);
    const response = goTo(safeNext(saved.next));
    response.cookies.set(SESSION_COOKIE, session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      expires: session.expiresAt,
    });
    return response;
  } catch (err) {
    console.error('Google sign-in failed', err);
    return goTo('/login?error=google');
  }
}
