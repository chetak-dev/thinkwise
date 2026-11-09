'use client';

import { useRef, useState } from 'react';
import { Download, FileUp, Loader2 } from 'lucide-react';
import { CSV_COLUMNS, CSV_MAX_BYTES, POINT_VALUES, TIME_LIMITS_S } from '@thinkwise/shared';
import { Modal } from '@/components/Modal';
import { downloadQuestionTemplate, readQuestionWorkbook } from '@/lib/questionWorkbook';

export interface ImportOutcome {
  error?: string;
  errors?: { row: number; message: string }[];
}

export function ImportCsvDialog({
  open,
  onClose,
  description,
  onFile,
}: {
  open: boolean;
  onClose: () => void;
  description: string;
  onFile: (text: string, fileName: string) => Promise<ImportOutcome | void>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setOutcome(null);
    if (file.size > CSV_MAX_BYTES) {
      setOutcome({ error: 'The file is larger than 256 KB.' });
      return;
    }
    setBusy(true);
    try {
      const text = /\.xlsx$/i.test(file.name) ? await readQuestionWorkbook(file) : await file.text();
      if (new TextEncoder().encode(text).length > CSV_MAX_BYTES) {
        setOutcome({ error: 'The extracted questions exceed 256 KB. Please split this workbook.' });
        return;
      }
      const result = await onFile(text, file.name);
      if (result) setOutcome(result);
    } catch (error) {
      setOutcome({ error: error instanceof Error ? error.message : 'Could not read the file. Please try again.' });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        setOutcome(null);
        onClose();
      }}
      title="Import questions from Excel or CSV"
      description={description}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => input.current?.click()}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-nova-600 px-5 font-semibold text-white shadow-[0_6px_20px_-8px_rgb(90_47_242/0.7)] transition hover:-translate-y-0.5 hover:bg-nova-700 disabled:opacity-60"
          >
            {busy ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : <FileUp className="size-5" aria-hidden="true" />}
            Choose file
          </button>
          <button
            type="button"
            disabled={busy}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-nova-700 hover:underline disabled:opacity-60 dark:text-nova-300"
            onClick={async () => {
              setBusy(true);
              try { await downloadQuestionTemplate(); }
              catch { setOutcome({ error: 'Could not create the sample Excel file. Please try again.' }); }
              finally { setBusy(false); }
            }}
          >
            <Download className="size-4" aria-hidden="true" />
            Download sample Excel file
          </button>
          <input
            ref={input}
            type="file"
            accept=".xlsx,.csv,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            aria-label="Excel or CSV file"
            onChange={(e) => void pick(e.target.files?.[0])}
          />
        </div>

        {outcome?.error && (
          <div role="alert" className="rounded-2xl bg-rose-50 p-3 text-sm text-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
            <p className="font-semibold">{outcome.error}</p>
            {outcome.errors && outcome.errors.length > 0 && (
              <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">
                {outcome.errors.map((e, i) => (
                  <li key={i}>
                    {e.row > 0 ? <span className="font-semibold">Row {e.row}: </span> : null}
                    {e.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="space-y-2 rounded-2xl bg-surface-2 p-3 text-sm text-muted">
          <p className="font-semibold text-app">How to fill in the sample Excel file</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Use one tab per language and name each tab after its language, e.g. <strong>English</strong>, <strong>Hindi</strong>,{' '}
              <strong>Odia</strong>. For one language, keep just one tab and delete the others.
            </li>
            <li>
              Every tab has the same columns. Give each question the same <code>question_no</code> in every tab, with its options in the
              same order.
            </li>
            <li>
              <code>correct</code> is A, B, C or D. <code>time</code> is one of {TIME_LIMITS_S.join(', ')} seconds and{' '}
              <code>points</code> one of {POINT_VALUES.join(', ')} (blank means 20 s and 1000). In the other tabs these can be left blank
              to copy the first tab.
            </li>
            <li>
              The first tab is what hosts see. Participants pick their language once, before starting. Maximum 100 questions, 20
              languages, 256 KB.
            </li>
          </ul>
        </div>
        <details className="rounded-2xl bg-surface-2 p-3 text-sm">
          <summary className="cursor-pointer font-semibold">Other question types (CSV)</summary>
          <p className="mt-2 text-muted">
            First row: <code className="break-words text-xs">{CSV_COLUMNS.join(', ')}</code>
          </p>
          <p className="mt-1 text-muted">
            <code>type</code> is <code>single</code> (one right answer), <code>multiple</code> (several right answers),{' '}
            <code>true_false</code>, <code>short_text</code> (players type the answer), <code>numeric</code>,{' '}
            <code>fill_blank</code> (mark blanks with <code>___</code>), <code>ordering</code> (items in option1… in the right
            order), <code>poll</code>, <code>word_cloud</code> or <code>rating</code>. <code>correct</code> is the option number, like{' '}
            <code>2</code>; several numbers, like <code>1;3</code>; the accepted answers, like <code>Na;Sodium</code>; a number,
            optionally with a margin like <code>10±0.5</code>; answers per blank separated by <code>|</code>, like{' '}
            <code>Pacific|Nile;River Nile</code>; a rating scale like <code>1-5</code>; <code>multiple</code> for a poll where players
            can pick several; the most words per word cloud response (1–5); or <code>true</code>/<code>false</code>. <code>time</code> is in seconds. Empty
            time and points use 20 s and 1000. Save from Excel or Google Sheets as CSV.
          </p>
        </details>
      </div>
    </Modal>
  );
}
