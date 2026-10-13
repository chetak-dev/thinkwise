import { Plus } from 'lucide-react';
import { createQuizAction } from '@/app/(app)/quiz-actions';

export function NewQuizButton({ label = 'New quiz', className = '' }: { label?: string; className?: string }) {
  return (
    <form action={createQuizAction}>
      <button
        type="submit"
        className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[linear-gradient(100deg,#6d4aff,#ff5d73)] px-5 font-semibold text-white shadow-[0_10px_30px_-10px_rgb(255_93_115/0.7)] transition hover:-translate-y-0.5 hover:brightness-110 ${className}`}
      >
        <Plus className="size-5" aria-hidden="true" />
        {label}
      </button>
    </form>
  );
}
