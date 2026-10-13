'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { Copy, Loader2, Pencil, Play } from 'lucide-react';
import { copyQuizAction } from '@/app/(app)/quiz-actions';
import { useHostQuiz } from '@/lib/hostQuiz';
import { StartSessionDialog } from '@/components/StartSessionDialog';

export function SharedQuizActions({ id, owned }: { id: string; owned: boolean }) {
  const [startOpen, setStartOpen] = useState(false);
  const [copying, startCopy] = useTransition();
  const [copyError, setCopyError] = useState<string | null>(null);
  const { host, pending: hosting, failure } = useHostQuiz('published');

  useEffect(() => {
    if (failure) setStartOpen(false);
  }, [failure]);

  return (
    <>
      <div className="mt-6 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={hosting}
          onClick={() => setStartOpen(true)}
          className="inline-flex h-12 select-none items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-surface-2 px-6 text-base font-semibold text-app transition-all duration-200 hover:-translate-y-0.5 hover:bg-nova-100 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 dark:hover:bg-ink-700"
        >
          {hosting ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : <Play className="size-5" aria-hidden="true" />}
          Host live
        </button>
        {owned && (
          <Link
            href={`/quiz/${id}/edit`}
            className="inline-flex h-12 items-center gap-2 rounded-xl bg-white/15 px-6 font-semibold hover:bg-white/25"
          >
            <Pencil className="size-5" aria-hidden="true" />
            Edit quiz
          </Link>
        )}
        <button
          type="button"
          disabled={copying}
          onClick={() =>
            startCopy(async () => {
              setCopyError(null);
              const res = await copyQuizAction(id);
              if (res && !res.ok) setCopyError(res.error);
            })
          }
          className="inline-flex h-12 items-center gap-2 rounded-xl bg-white/15 px-6 font-semibold hover:bg-white/25 disabled:opacity-60"
        >
          {copying ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : <Copy className="size-5" aria-hidden="true" />}
          Copy to my library
        </button>
      </div>
      {(failure || copyError) && (
        <p role="alert" className="mt-3 rounded-xl bg-white/90 px-3 py-2 text-sm font-semibold text-rose-700">
          {failure?.error ?? copyError}
        </p>
      )}
      <StartSessionDialog
        open={startOpen}
        onClose={() => setStartOpen(false)}
        pending={hosting}
        onStart={(options) => host(id, undefined, options)}
      />
    </>
  );
}
