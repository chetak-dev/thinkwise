'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Archive, ArchiveRestore, Copy, Ellipsis, Eye, Heart, Loader2, Pencil, Play, Trash2, Users } from 'lucide-react';
import {
  copyQuizAction,
  deleteQuizAction,
  duplicateQuizAction,
  setArchivedAction,
  setFavouriteAction,
} from '@/app/(app)/quiz-actions';
import { useHostQuiz } from '@/lib/hostQuiz';
import { StartSessionDialog } from '@/components/StartSessionDialog';

const BANNERS = [
  'linear-gradient(135deg,#6d4aff,#ff5d73)',
  'linear-gradient(135deg,#14c9b8,#6d4aff)',
  'linear-gradient(135deg,#ffb627,#ff5d73)',
  'linear-gradient(135deg,#0067a5,#14c9b8)',
  'linear-gradient(135deg,#9a4a82,#6d4aff)',
];

function bannerFor(id: string) {
  let h = 2166136261;
  for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return BANNERS[h % BANNERS.length]!;
}

export interface QuizCardData {
  id: string;
  title: string;
  questionCount: number;
  status: 'draft' | 'published';
  favourite: boolean;
  archived: boolean;
  owned: boolean;
  authorName: string;
  visibility: 'private' | 'unlisted' | 'public';
  /** Times the signed-in host has hosted this quiz. */
  sessions: number;
  updatedAt: string;
}

export function QuizCard({ quiz }: { quiz: QuizCardData }) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const [favourite, setFavourite] = useState(quiz.favourite);
  const [busy, startTransition] = useTransition();
  const { host, pending: hosting, failure } = useHostQuiz(quiz.owned ? 'draft' : 'published');
  const href = quiz.owned ? `/quiz/${quiz.id}/edit` : `/quiz/${quiz.id}`;
  const menuRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (failure) setStartOpen(false);
  }, [failure]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [menuOpen]);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (confirmOpen && !d.open) d.showModal();
    if (!confirmOpen && d.open) d.close();
  }, [confirmOpen]);

  const updated = new Date(quiz.updatedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

  const toggleFavourite = () => {
    const next = !favourite;
    setFavourite(next);
    startTransition(async () => {
      const res = await setFavouriteAction(quiz.id, next);
      if (!res.ok) setFavourite(!next);
      router.refresh();
    });
  };

  const toggleArchived = () => {
    setMenuOpen(false);
    startTransition(async () => {
      await setArchivedAction(quiz.id, !quiz.archived);
      router.refresh();
    });
  };

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-3xl border border-app bg-surface shadow-soft transition duration-300 hover:-translate-y-1 hover:border-nova-300 hover:shadow-lift">
      <Link href={href} className="block" aria-label={`${quiz.owned ? 'Edit' : 'View'} ${quiz.title}`}>
        <div className="arena-sheen relative h-32 overflow-hidden" style={{ background: bannerFor(quiz.id) }}>
          <div className="decorative absolute -right-6 -top-6 size-28 rounded-full bg-white/15" aria-hidden="true" />
          <div className="decorative absolute bottom-3 right-10 size-10 rounded-full bg-white/10" aria-hidden="true" />
          <div className="absolute bottom-3 left-4 flex gap-1.5">
            {quiz.owned && quiz.status === 'draft' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-0.5 text-xs font-semibold text-ink-900">
                Draft
              </span>
            )}
            {!quiz.owned && (
              <span className="inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-0.5 text-xs font-semibold capitalize text-ink-900">
                {quiz.visibility}
              </span>
            )}
            {quiz.archived && (
              <span className="inline-flex items-center gap-1 rounded-full bg-ink-900/80 px-2.5 py-0.5 text-xs font-semibold text-white">
                Archived
              </span>
            )}
          </div>
        </div>
        <div className="p-4 pb-2">
          <h3 className="line-clamp-2 font-display text-base font-bold leading-snug">{quiz.title || 'Untitled quiz'}</h3>
          <p className="mt-1 text-xs text-muted">
            {quiz.questionCount} {quiz.questionCount === 1 ? 'question' : 'questions'}
            {!quiz.owned && ` · by ${quiz.authorName}`}
          </p>
        </div>
      </Link>

      {failure && (
        <p role="alert" className="mx-4 rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
          {failure.error}{' '}
          {failure.problems && quiz.owned && (
            <Link href={`/quiz/${quiz.id}/edit`} className="underline">
              Open editor
            </Link>
          )}
        </p>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 p-4 pt-2">
        <span className="flex items-center gap-1 text-xs text-muted" title={quiz.owned ? `Edited ${updated}` : undefined}>
          <Users className="size-3.5" aria-hidden="true" />
          {quiz.sessions} {quiz.sessions === 1 ? 'session' : 'sessions'}
        </span>
        <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label={favourite ? 'Remove from favourites' : 'Add to favourites'}
          aria-pressed={favourite}
          onClick={toggleFavourite}
          className={`rounded-lg p-1.5 hover:bg-surface-2 ${favourite ? 'text-coral-500' : 'text-muted'}`}
        >
          <Heart className={`size-4 ${favourite ? 'fill-current' : ''}`} aria-hidden="true" />
        </button>
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            aria-label="More actions"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
            className="rounded-lg p-1.5 text-muted hover:bg-surface-2"
          >
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Ellipsis className="size-4" aria-hidden="true" />}
          </button>
          {menuOpen && !quiz.owned && (
            <div role="menu" className="absolute bottom-full right-0 z-20 mb-1 w-48 animate-pop rounded-xl border border-app bg-surface p-1 shadow-lift">
              <Link role="menuitem" href={href} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold hover:bg-surface-2">
                <Eye className="size-4" aria-hidden="true" />
                View
              </Link>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  startTransition(async () => {
                    await copyQuizAction(quiz.id);
                  });
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold hover:bg-surface-2"
              >
                <Copy className="size-4" aria-hidden="true" />
                Copy to my library
              </button>
            </div>
          )}
          {menuOpen && quiz.owned && (
            <div role="menu" className="absolute bottom-full right-0 z-20 mb-1 w-40 animate-pop rounded-xl border border-app bg-surface p-1 shadow-lift">
              <Link role="menuitem" href={`/quiz/${quiz.id}/edit`} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold hover:bg-surface-2">
                <Pencil className="size-4" aria-hidden="true" />
                Edit
              </Link>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  startTransition(async () => {
                    const res = await duplicateQuizAction(quiz.id);
                    if (res.ok) router.refresh();
                  });
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold hover:bg-surface-2"
              >
                <Copy className="size-4" aria-hidden="true" />
                Duplicate
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={toggleArchived}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold hover:bg-surface-2"
              >
                {quiz.archived ? <ArchiveRestore className="size-4" aria-hidden="true" /> : <Archive className="size-4" aria-hidden="true" />}
                {quiz.archived ? 'Restore' : 'Archive'}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  setConfirmOpen(true);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/50"
              >
                <Trash2 className="size-4" aria-hidden="true" />
                Delete
              </button>
            </div>
          )}
        </div>
        <button
          type="button"
          disabled={hosting}
          onClick={() => setStartOpen(true)}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-nova-600 px-3 text-sm font-semibold text-white shadow-[0_6px_20px_-8px_rgb(90_47_242/0.7)] transition hover:-translate-y-0.5 hover:bg-nova-700 active:bg-nova-800 disabled:opacity-60"
        >
          {hosting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}
          Host
        </button>
        </div>
      </div>

      <dialog
        ref={dialogRef}
        onClose={() => setConfirmOpen(false)}
        aria-labelledby={`del-${quiz.id}`}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-3xl border border-app bg-surface p-0 text-app shadow-lift backdrop:bg-ink-950/50 backdrop:backdrop-blur-sm open:animate-pop"
      >
        <div className="p-6">
          <h2 id={`del-${quiz.id}`} className="font-display text-xl font-bold">
            Delete “{quiz.title || 'Untitled quiz'}”?
          </h2>
          <p className="mt-2 text-sm text-muted">This removes the quiz and its questions for good. Games already played aren’t affected.</p>
          <div className="mt-6 flex justify-end gap-2">
            <button type="button" onClick={() => setConfirmOpen(false)} className="h-10 rounded-xl border border-app px-4 text-sm font-semibold hover:bg-surface-2">
              Keep it
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmOpen(false);
                startTransition(async () => {
                  await deleteQuizAction(quiz.id);
                  router.refresh();
                });
              }}
              className="h-10 rounded-xl bg-rose-600 px-4 text-sm font-semibold text-white hover:bg-rose-700"
            >
              Delete quiz
            </button>
          </div>
        </div>
      </dialog>

      <StartSessionDialog
        open={startOpen}
        onClose={() => setStartOpen(false)}
        pending={hosting}
        onStart={(options) => host(quiz.id, undefined, options)}
      />
    </article>
  );
}
