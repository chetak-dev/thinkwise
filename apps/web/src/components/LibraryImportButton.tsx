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
        className="inline-flex h-11 items-center gap-2 rounded-xl border border-app bg-surface px-5 font-semibold text-app transition hover:-translate-y-0.5 hover:border-nova-400 hover:text-nova-700 dark:hover:text-nova-300"
      >
        <FileUp className="size-5" aria-hidden="true" />
        Import CSV
      </button>
      <ImportCsvDialog
        open={open}
        onClose={() => setOpen(false)}
        description="Creates a new quiz from a spreadsheet. Export from Excel or Google Sheets as CSV."
        onFile={(text, name) => importQuizCsvAction(name, text)}
      />
    </>
  );
}
