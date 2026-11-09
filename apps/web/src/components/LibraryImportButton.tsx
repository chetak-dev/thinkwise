'use client';

import { useState } from 'react';
import { FileUp } from 'lucide-react';
import { importQuizCsvAction } from '@/app/(app)/quiz-actions';
import { ImportCsvDialog } from '@/components/ImportCsvDialog';

export function LibraryImportButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-app bg-surface px-3 font-semibold sm:w-auto sm:px-5 text-app transition hover:-translate-y-0.5 hover:border-nova-400 hover:text-nova-700 dark:hover:text-nova-300"
      >
        <FileUp className="size-5" aria-hidden="true" />
        Import<span className="hidden sm:inline"> Excel / CSV</span>
      </button>
      <ImportCsvDialog
        open={open}
        onClose={() => setOpen(false)}
        description="Create a quiz from an Excel workbook (.xlsx) or CSV, including multiple languages."
        onFile={(text, name) => importQuizCsvAction(name, text)}
      />
    </>
  );
}
