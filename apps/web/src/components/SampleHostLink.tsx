'use client';

import Link from 'next/link';
import { Play } from 'lucide-react';
import { HOST_QUIZ_KEY, HOST_SESSION_KEY } from '@/lib/hostQuiz';

/** Opens the host screen with the built-in sample quiz, forgetting any saved quiz session. */
export function SampleHostLink({ className, onNavigate }: { className: string; onNavigate?: () => void }) {
  return (
    <Link
      href="/host"
      onClick={() => {
        sessionStorage.removeItem(HOST_SESSION_KEY);
        sessionStorage.removeItem(HOST_QUIZ_KEY);
        onNavigate?.();
      }}
      className={className}
    >
      <Play className="size-4" aria-hidden="true" />
      Host the sample quiz
    </Link>
  );
}
