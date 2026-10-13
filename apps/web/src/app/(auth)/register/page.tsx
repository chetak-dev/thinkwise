import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/session';
import { isGoogleEnabled } from '@/lib/google';
import { AuthShell } from '../AuthShell';
import { GoogleSignIn } from '../GoogleSignIn';
import { RegisterForm } from './RegisterForm';

export const metadata: Metadata = { title: 'Create account · ThinkWise' };

export default async function RegisterPage() {
  if (await getCurrentUser()) redirect('/dashboard');
  return (
    <AuthShell title="Create your account" subtitle="Free for teachers, trainers and event hosts.">
      {isGoogleEnabled() && (
        <div className="mb-4">
          <GoogleSignIn label="Sign up with Google" />
        </div>
      )}
      <RegisterForm />
    </AuthShell>
  );
}
