import { AppShell } from '@/components/AppShell';
import { TimeZoneSync } from '@/components/TimeZoneSync';
import { WakeRealtime } from '@/components/WakeRealtime';
import { requireUser } from '@/lib/session';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <AppShell user={{ name: user.name, email: user.email }}>
      <TimeZoneSync />
      <WakeRealtime />
      {children}
    </AppShell>
  );
}
