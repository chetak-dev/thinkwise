import { AccessProvider } from '@/components/AccessProvider';
import { AppShell } from '@/components/AppShell';
import { TimeZoneSync } from '@/components/TimeZoneSync';
import { getAccess, requireUser } from '@/lib/session';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const access = getAccess(user);
  return (
    <AccessProvider value={access}>
      <AppShell user={{ name: user.name, email: user.email }}>
        <TimeZoneSync />
        {children}
      </AppShell>
    </AccessProvider>
  );
}
