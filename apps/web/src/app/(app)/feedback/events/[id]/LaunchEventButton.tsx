'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Loader2, Rocket } from 'lucide-react';
import { rememberHostSession } from '@/lib/hostQuiz';
import { launchFeedbackEventAction } from '../../actions';

export function LaunchEventButton({ eventId, disabled }: { eventId: string; disabled?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const launch = () => {
    setError(null);
    startTransition(async () => {
      const result = await launchFeedbackEventAction(eventId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      rememberHostSession(result.gameId, result.hostToken, result.quizId);
      router.push('/host');
    });
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={launch}
        disabled={pending || disabled}
        className="inline-flex h-10 items-center gap-2 rounded-xl bg-[linear-gradient(100deg,#6d4aff,#ff5d73)] px-4 text-sm font-semibold text-white shadow-lift transition hover:-translate-y-0.5 hover:brightness-110 disabled:pointer-events-none disabled:opacity-50"
      >
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Rocket className="size-4" aria-hidden="true" />}
        {pending ? 'Opening lobby…' : 'Launch event lobby'}
      </button>
      {error && (
        <p role="alert" className="flex max-w-sm items-start gap-1.5 text-right text-sm font-semibold text-rose-700 dark:text-rose-300">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
}
