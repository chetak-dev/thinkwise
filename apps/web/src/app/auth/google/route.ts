import { NextResponse, type NextRequest } from 'next/server';
import { GOOGLE_STATE_COOKIE, GOOGLE_STATE_TTL_S, isGoogleEnabled, publicOrigin, startGoogleSignIn } from '@/lib/google';
import { safeNext } from '@/lib/session';

export function GET(request: NextRequest) {
  const origin = publicOrigin(request);
  if (!isGoogleEnabled()) return NextResponse.redirect(new URL('/login?error=google', origin));
  const next = safeNext(request.nextUrl.searchParams.get('next'));
  const { url, cookie } = startGoogleSignIn(origin, next);
  const response = NextResponse.redirect(url);
  response.cookies.set(GOOGLE_STATE_COOKIE, cookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    // Lax still sends it on Google's top-level redirect back to us.
    sameSite: 'lax',
    path: '/auth/google',
    maxAge: GOOGLE_STATE_TTL_S,
  });
  return response;
}
