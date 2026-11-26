'use server';

import { revalidatePath } from 'next/cache';
import { getDb, setUserCanHost, closeSelfSession } from '@thinkwise/db';
import { requireSiteAdmin } from '@/lib/session';
import { endLiveGame } from '@/lib/realtime';

export async function endAnyGameAction(id: string, mode: 'live' | 'self') {
  const actor = await requireSiteAdmin('/admin');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false as const, error: 'Invalid game.' };
  const ok = mode === 'self' ? await closeSelfSession(getDb(), actor, id) : await endLiveGame(id);
  revalidatePath('/admin');
  revalidatePath('/dashboard');
  return ok ? { ok: true as const } : { ok: false as const, error: 'The game has already ended or is no longer running.' };
}

export async function setAdminAction(userId: string, on: boolean) {
  const actor = await requireSiteAdmin('/admin');
  const result = await setUserCanHost(getDb(), actor, String(userId), on === true);
  revalidatePath('/admin');
  return result;
}
