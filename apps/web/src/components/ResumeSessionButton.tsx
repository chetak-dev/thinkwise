'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, MonitorPlay } from 'lucide-react';
import { resumeSessionAction } from '@/app/(app)/quiz-actions';
import { rememberHostSession } from '@/lib/hostQuiz';

export function ResumeSessionButton({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const resume = () =>
    startTransition(async () => {
      setError(null);
      const result = await resumeSessionAction(sessionId);
      if (!result.ok) {
        setError(result.error);
        router.refresh();
        return;
      }
      rememberHostSession(result.gameId, result.hostToken, result.quizId, result.source);
      router.push('/host');
    });

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={resume}
        disabled={pending}
        className="inline-flex h-10 items-center gap-2 rounded-xl bg-[linear-gradient(100deg,#6d4aff,#ff5d73)] px-4 text-sm font-semibold text-white shadow-lift transition hover:-translate-y-0.5 hover:brightness-110 disabled:opacity-60"
      >
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <MonitorPlay className="size-4" aria-hidden="true" />}
        Resume
      </button>
      {error && (
        <p role="alert" className="text-xs font-semibold text-rose-600 dark:text-rose-300">
          {error}
        </p>
      )}
    </div>
  );
}
