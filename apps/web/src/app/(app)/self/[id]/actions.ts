'use server';

import { revalidatePath } from 'next/cache';
import { closeSelfSession, getDb, setSelfClosesAt } from '@thinkwise/db';
import { requireUser } from '@/lib/session';

export async function closeSelfAction(id: string) {
  const user = await requireUser();
  const ok = await closeSelfSession(getDb(), user.id, String(id));
  revalidatePath(`/self/${id}`);
  revalidatePath('/dashboard');
  return { ok: !!ok };
}

export async function setSelfClosesAtAction(id: string, closesAtMs: number) {
  const user = await requireUser();
  if (typeof closesAtMs !== 'number' || !Number.isFinite(closesAtMs)) return { ok: false };
  const ok = await setSelfClosesAt(getDb(), user.id, String(id), new Date(closesAtMs));
  revalidatePath(`/self/${id}`);
  return { ok };
}
