import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser, safeNext } from '@/lib/session';
import { isGoogleEnabled } from '@/lib/google';
import { AuthShell } from '../AuthShell';
import { GoogleSignIn } from '../GoogleSignIn';
import { LoginForm } from './LoginForm';

export const metadata: Metadata = { title: 'Sign in · ThinkWise' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const params = await searchParams;
  const next = safeNext(params.next);
  if (await getCurrentUser()) redirect(next);
  return (
    <AuthShell title="Welcome back" subtitle="Sign in to build and host your quizzes.">
      {params.error === 'google' && (
        <p role="alert" className="mb-4 rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
          We couldn’t sign you in with Google. Please try again, or use your email and password.
        </p>
      )}
      {isGoogleEnabled() && (
        <div className="mb-4">
          <GoogleSignIn next={next} />
        </div>
      )}
      <LoginForm next={next} />
    </AuthShell>
  );
}
