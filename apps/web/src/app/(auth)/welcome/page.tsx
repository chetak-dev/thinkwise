import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { profileComplete } from '@thinkwise/db';
import { getCurrentUser, safeNext } from '@/lib/session';
import { AuthShell } from '../AuthShell';
import { ProfileForm } from '../ProfileForm';

export const metadata: Metadata = { title: 'Complete your profile · ThinkWise' };

export default async function WelcomePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/welcome?next=${encodeURIComponent(next)}`)}`);
  if (profileComplete(user)) redirect(next);
  return (
    <AuthShell title="Complete your profile" subtitle="One quick step before you play. We ask for these details once.">
      <ProfileForm initial={{ name: user.name ?? '', phone: user.phone ?? '', address: user.address ?? '' }} next={next} submitLabel="Save and continue" />
    </AuthShell>
  );
}
