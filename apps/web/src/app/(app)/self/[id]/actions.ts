'use server';

import { revalidatePath } from 'next/cache';
import { canHost, closeSelfSession, getDb, reopenSelfSession, updateSelfSettings } from '@thinkwise/db';
import { requireUser } from '@/lib/session';

export async function closeSelfAction(id: string) {
  const user = await requireUser();
  const ok = await closeSelfSession(getDb(), user.id, String(id));
  revalidatePath(`/self/${id}`);
  revalidatePath('/dashboard');
  return { ok: !!ok };
}

export interface SelfSettingsInput {
  title?: string;
  opensAtMs?: number;
  closesAtMs?: number;
  timeLimitMinutes?: number;
  showLeaderboard?: boolean;
  showCorrect?: boolean;
}

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

export async function updateSelfSettingsAction(id: string, input: SelfSettingsInput) {
  const user = await requireUser();
  const i = input ?? {};
  const result = await updateSelfSettings(getDb(), user.id, String(id), {
    ...(typeof i.title === 'string' ? { title: i.title } : {}),
    ...(finite(i.opensAtMs) ? { opensAt: new Date(i.opensAtMs) } : {}),
    ...(finite(i.closesAtMs) ? { closesAt: new Date(i.closesAtMs) } : {}),
    ...(finite(i.timeLimitMinutes) ? { timeLimitMs: i.timeLimitMinutes * 60_000 } : {}),
    ...(typeof i.showLeaderboard === 'boolean' ? { showLeaderboard: i.showLeaderboard } : {}),
    ...(typeof i.showCorrect === 'boolean' ? { showCorrect: i.showCorrect } : {}),
  });
  revalidatePath(`/self/${id}`);
  revalidatePath('/dashboard');
  return result;
}

export async function reopenSelfAction(id: string, input: { opensAtMs: number; closesAtMs: number; timeLimitMinutes: number }) {
  const user = await requireUser();
  if (!canHost(user)) return { ok: false as const, error: 'Only admins can host quizzes.' };
  if (!finite(input?.opensAtMs) || !finite(input?.closesAtMs) || !finite(input?.timeLimitMinutes)) {
    return { ok: false as const, error: 'Fill in when it opens, closes and the time limit.' };
  }
  const result = await reopenSelfSession(getDb(), user, String(id), {
    opensAt: new Date(input.opensAtMs),
    closesAt: new Date(input.closesAtMs),
    timeLimitMs: input.timeLimitMinutes * 60_000,
  });
  revalidatePath('/dashboard');
  return result;
}
