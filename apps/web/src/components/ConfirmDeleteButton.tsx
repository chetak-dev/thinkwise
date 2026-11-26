'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Modal } from '@/components/Modal';
import { TypeToConfirm, confirmMatches } from '@/components/TypeToConfirm';

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
  const [typed, setTyped] = useState('');
  const show = () => {
    setTyped('');
    setOpen(true);
  };
  return (
    <>
      <button
        type="button"
        onClick={show}
        className={
          className ??
          'inline-flex h-10 items-center gap-2 rounded-xl border border-app bg-surface px-4 text-sm font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/40'
        }
      >
        <Trash2 className="size-4" aria-hidden="true" />
        {label}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={title} description={description} size="max-w-md">
        <form action={action} className="space-y-4">
          <TypeToConfirm expected="DELETE" value={typed} onChange={setTyped} />
          <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="inline-flex h-10 items-center rounded-xl border border-app px-4 text-sm font-semibold hover:border-nova-400"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!confirmMatches(typed, 'DELETE')}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-rose-600 px-4 text-sm font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 className="size-4" aria-hidden="true" />
            Delete
          </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
