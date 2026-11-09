import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { afterSignIn, getCurrentUser, safeNext } from '@/lib/session';
import { isGoogleEnabled } from '@/lib/google';
import { AuthShell } from '../AuthShell';
import { GoogleSignIn } from '../GoogleSignIn';
import { RegisterForm } from './RegisterForm';

export const metadata: Metadata = { title: 'Create account · ThinkWise' };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  const user = await getCurrentUser();
  if (user) redirect(afterSignIn(user, next));
  return (
    <AuthShell title="Create your account" subtitle="Free to join. Play quizzes and keep a history of your scores.">
      {isGoogleEnabled() && (
        <div className="mb-4">
          <GoogleSignIn label="Sign up with Google" next={next} />
        </div>
      )}
      <RegisterForm next={next} />
    </AuthShell>
  );
}
