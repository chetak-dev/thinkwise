'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Modal } from '@/components/Modal';

/** A delete button that asks first. `action` is a server action that redirects when done. */
export function ConfirmDeleteButton({
  label,
  title,
  description,
  action,
  className,
}: {
  label: string;
  title: string;
  description: string;
  action: () => Promise<void>;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ??
          'inline-flex h-10 items-center gap-2 rounded-xl border border-app bg-surface px-4 text-sm font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/40'
        }
      >
        <Trash2 className="size-4" aria-hidden="true" />
        {label}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={title} description={description} size="max-w-md">
        <form action={action} className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="inline-flex h-10 items-center rounded-xl border border-app px-4 text-sm font-semibold hover:border-nova-400"
          >
            Cancel
          </button>
          <button type="submit" className="inline-flex h-10 items-center gap-2 rounded-xl bg-rose-600 px-4 text-sm font-semibold text-white hover:bg-rose-700">
            <Trash2 className="size-4" aria-hidden="true" />
            Delete
          </button>
        </form>
      </Modal>
    </>
  );
}
