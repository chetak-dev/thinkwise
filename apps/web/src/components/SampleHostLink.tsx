'use client';

import Link from 'next/link';
import { Play } from 'lucide-react';
import { useAccess } from '@/components/AccessProvider';
import { HOST_QUIZ_KEY, HOST_SESSION_KEY } from '@/lib/hostQuiz';

/** Opens the host screen with the built-in sample quiz, forgetting any saved quiz session. */
export function SampleHostLink({
  className,
  labelClassName = '',
  onNavigate,
}: {
  className: string;
  labelClassName?: string;
  onNavigate?: () => void;
}) {
  const { canHost } = useAccess();
  if (!canHost) return null;
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
      <Play className="size-4 shrink-0" aria-hidden="true" />
      <span className={labelClassName}>Host the sample quiz</span>
    </Link>
  );
}
