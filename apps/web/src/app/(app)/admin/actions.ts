'use server';

import { revalidatePath } from 'next/cache';
import { getDb, setUserCanHost } from '@thinkwise/db';
import { requireSiteAdmin } from '@/lib/session';

export async function setAdminAction(userId: string, on: boolean) {
  const actor = await requireSiteAdmin('/admin');
  const result = await setUserCanHost(getDb(), actor, String(userId), on === true);
  revalidatePath('/admin');
  return result;
}
