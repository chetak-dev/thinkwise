import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/session';
import { AuthShell } from '../AuthShell';
import { RegisterForm } from './RegisterForm';

export const metadata: Metadata = { title: 'Create account · ThinkWise' };

export default async function RegisterPage() {
  if (await getCurrentUser()) redirect('/dashboard');
  return (
    <AuthShell title="Create your account" subtitle="Free for teachers, trainers and event hosts.">
      <RegisterForm />
    </AuthShell>
  );
}
