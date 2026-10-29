'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { hostPublishedQuizAction, hostQuizAction, type HostResult, type StartOptions } from '@/app/(app)/quiz-actions';

export const HOST_SESSION_KEY = 'tw-host-session';
export const HOST_QUIZ_KEY = 'tw-host-quiz';

/** 'draft' hosts the owner's current editor version; 'published' hosts the published copy. */
export type HostSource = 'draft' | 'published';

export function hostAction(source: HostSource) {
  return source === 'published' ? hostPublishedQuizAction : hostQuizAction;
}

/** Reads back what rememberHostSession stored, so a new lobby replays the same quiz. */
export function rememberedQuiz(): { id: string; source: HostSource } | null {
  const raw = sessionStorage.getItem(HOST_QUIZ_KEY);
  if (!raw) return null;
  return raw.startsWith('published:') ? { id: raw.slice(10), source: 'published' } : { id: raw, source: 'draft' };
}

export function rememberHostSession(gameId: string, hostToken: string, quizId: string | null, source: HostSource = 'draft') {
  sessionStorage.setItem(HOST_SESSION_KEY, JSON.stringify({ gameId, hostToken }));
  if (quizId) sessionStorage.setItem(HOST_QUIZ_KEY, source === 'published' ? `published:${quizId}` : quizId);
  else sessionStorage.removeItem(HOST_QUIZ_KEY);
}

/** Starts a live game from a saved quiz and opens the host screen. */
export function useHostQuiz(source: HostSource = 'draft') {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [failure, setFailure] = useState<Extract<HostResult, { ok: false }> | null>(null);

  const host = (quizId: string, beforeHost?: () => Promise<boolean>, options?: StartOptions) => {
    setFailure(null);
    startTransition(async () => {
      if (beforeHost && !(await beforeHost())) return;
      const result = await hostAction(source)(quizId, options);
      if (!result.ok) {
        setFailure(result);
        return;
      }
      if ('selfId' in result) {
        router.push(`/self/${result.selfId}`);
        return;
      }
      rememberHostSession(result.gameId, result.hostToken, quizId, source);
      router.push('/host');
    });
  };

  return { host, pending, failure, clearFailure: () => setFailure(null) };
}
