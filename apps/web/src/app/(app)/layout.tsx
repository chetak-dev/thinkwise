import { AppShell } from '@/components/AppShell';
import { WakeRealtime } from '@/components/WakeRealtime';
import { requireUser } from '@/lib/session';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <AppShell user={{ name: user.name, email: user.email }}>
      <WakeRealtime />
      {children}
    </AppShell>
  );
}
