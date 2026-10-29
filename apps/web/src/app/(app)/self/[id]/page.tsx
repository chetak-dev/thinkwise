import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getDb, selfHostView } from '@thinkwise/db';
import { getAccess, requireUser } from '@/lib/session';
import { getTimeZone } from '@/lib/timeZone';
import { SelfHostPanel } from './SelfHostPanel';

export const metadata: Metadata = { title: 'Self-paced quiz · ThinkWise' };

export default async function SelfSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/self/${id}`);
  const [view, timeZone] = await Promise.all([selfHostView(getDb(), user.id, id), getTimeZone()]);
  if (!view) notFound();
  return <SelfHostPanel view={view} timeZone={timeZone} canHost={getAccess(user).canHost} />;
}
