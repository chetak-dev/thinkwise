import type { Metadata } from 'next';
import { requireUser } from '@/lib/session';
import { HostClient } from './HostClient';

export const metadata: Metadata = { title: 'Host · ThinkWise' };

export default async function HostPage() {
  await requireUser('/host');
  return <HostClient />;
}
