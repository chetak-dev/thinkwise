import type { Metadata } from 'next';
import { requireHost } from '@/lib/session';
import { HostClient } from './HostClient';

export const metadata: Metadata = { title: 'Host · ThinkWise' };

export default async function HostPage() {
  await requireHost('/host');
  return <HostClient />;
}
