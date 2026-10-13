import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser, safeNext } from '@/lib/session';
import { AuthShell } from '../AuthShell';
import { LoginForm } from './LoginForm';

export const metadata: Metadata = { title: 'Sign in · ThinkWise' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  if (await getCurrentUser()) redirect(next);
  return (
    <AuthShell title="Welcome back" subtitle="Sign in to build and host your quizzes.">
      <LoginForm next={next} />
    </AuthShell>
  );
}
