import type { Metadata } from 'next';
import { phoneForForm } from '@thinkwise/db';
import { requireUser } from '@/lib/session';
import { ProfileForm } from '@/app/(auth)/ProfileForm';

export const metadata: Metadata = { title: 'My profile · ThinkWise' };

export default async function ProfilePage() {
  const user = await requireUser('/profile');
  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">My profile</h1>
        <p className="text-muted">Signed in as {user.email}</p>
      </div>
      <div className="rounded-2xl border border-app bg-surface p-6 shadow-soft">
        <ProfileForm
          initial={{ name: user.name ?? '', phone: phoneForForm(user.phone), address: user.address ?? '', gender: user.gender ?? '' }}
          submitLabel="Save changes"
        />
      </div>
    </div>
  );
}
