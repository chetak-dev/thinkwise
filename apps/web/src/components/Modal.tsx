'use client';

import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

/** Native <dialog> shell shared by the studio's pop-ups (focus trap, Esc and backdrop come from the browser). */
export function Modal({
  open,
  onClose,
  title,
  description,
  size = 'max-w-lg',
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  size?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onKeyDown={(e) => {
        // Some embedded browsers don't turn Esc into the native dialog cancel.
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
        }
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className={`m-auto w-[calc(100%-2rem)] rounded-3xl border border-app bg-surface p-0 text-app shadow-lift backdrop:bg-ink-950/50 backdrop:backdrop-blur-sm open:animate-pop ${size}`}
    >
      {open && (
        <div className="p-6">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 id={titleId} className="font-display text-xl font-bold">
                {title}
              </h2>
              {description && <p className="mt-1 text-sm text-muted">{description}</p>}
            </div>
            <button type="button" aria-label="Close" onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-app">
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
