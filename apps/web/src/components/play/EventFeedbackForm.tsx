'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { ArrowDown, ArrowUp, Loader2, Star } from 'lucide-react';
import {
  SCALE_RANGE,
  TEXT_ANSWER_MAX,
  checkFeedback,
  isUpload,
  visibleFields,
  type AnswerProblem,
  type FeedbackAnswers,
  type FormField,
} from '@thinkwise/shared';
import type { Strings } from '@/lib/i18n';

export interface PlayForm {
  title: string;
  description: string;
  fields: FormField[];
}

export interface PlayEventForm {
  ref: string;
  title: string;
  description: string;
  required: boolean;
  before: PlayForm | null;
  after: PlayForm | null;
}

const INPUT =
  'w-full rounded-2xl border-2 border-app bg-surface-2 px-4 py-3 text-base focus:border-nova-500 focus:outline-none';
const PILL = 'rounded-xl border-2 px-3 py-2.5 text-sm font-semibold transition';
const pill = (on: boolean) =>
  `${PILL} ${on ? 'border-nova-500 bg-nova-100 text-nova-900 dark:bg-nova-900 dark:text-nova-100' : 'border-app bg-surface hover:border-nova-300'}`;

type Values = Record<string, unknown>;

function initialValues(fields: FormField[]): Values {
  // A ranking starts in the host's order, so leaving it untouched is a valid answer.
  return Object.fromEntries(fields.filter((f) => f.type === 'ranking').map((f) => [f.id, f.choices.map((c) => c.id)]));
}

function FieldInput({ field, value, set, t }: { field: FormField; value: unknown; set: (v: unknown) => void; t: Strings }) {
  const id = `fb-${field.id}`;
  switch (field.type) {
    case 'short_text':
      return <input id={id} value={(value as string) ?? ''} maxLength={TEXT_ANSWER_MAX.short_text} onChange={(e) => set(e.target.value)} className={INPUT} />;
    case 'long_text':
      return (
        <textarea
          id={id}
          rows={4}
          value={(value as string) ?? ''}
          maxLength={TEXT_ANSWER_MAX.long_text}
          onChange={(e) => set(e.target.value)}
          className={`${INPUT} resize-y`}
        />
      );
    case 'email':
      return <input id={id} type="email" autoComplete="email" value={(value as string) ?? ''} onChange={(e) => set(e.target.value)} className={INPUT} />;
    case 'phone':
      return <input id={id} type="tel" autoComplete="tel" value={(value as string) ?? ''} onChange={(e) => set(e.target.value)} className={INPUT} />;
    case 'number':
      return <input id={id} inputMode="decimal" value={(value as string) ?? ''} onChange={(e) => set(e.target.value)} className={INPUT} />;
    case 'date':
      return <input id={id} type="date" value={(value as string) ?? ''} onChange={(e) => set(e.target.value)} className={INPUT} />;
    case 'datetime':
      return <input id={id} type="datetime-local" value={(value as string) ?? ''} onChange={(e) => set(e.target.value)} className={INPUT} />;
    case 'dropdown':
      return (
        <select id={id} value={(value as string) ?? ''} onChange={(e) => set(e.target.value)} className={`${INPUT} h-14`}>
          <option value="">{t.choose}</option>
          {field.choices.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      );
    case 'single':
    case 'checkboxes': {
      const multi = field.type === 'checkboxes';
      const picked = multi ? ((value as string[]) ?? []) : [value as string];
      return (
        <div className="grid gap-2">
          {field.choices.map((c) => (
            <label key={c.id} className={`${pill(picked.includes(c.id))} flex cursor-pointer items-center gap-3`}>
              <input
                type={multi ? 'checkbox' : 'radio'}
                name={id}
                checked={picked.includes(c.id)}
                onChange={() => set(multi ? (picked.includes(c.id) ? picked.filter((x) => x !== c.id) : [...picked, c.id]) : c.id)}
                className="size-4 accent-nova-600"
              />
              {c.label}
            </label>
          ))}
        </div>
      );
    }
    case 'rating':
    case 'scale':
    case 'stars': {
      const [min, max] = SCALE_RANGE[field.type];
      const values = Array.from({ length: max - min + 1 }, (_, i) => min + i);
      if (field.type === 'stars') {
        return (
          <div role="radiogroup" className="flex gap-1">
            {values.map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={value === n}
                aria-label={t.outOf(n, max)}
                onClick={() => set(n)}
                className="rounded-lg p-1 transition hover:scale-110"
              >
                <Star
                  className={`size-9 ${typeof value === 'number' && n <= value ? 'fill-amber-400 text-amber-400' : 'text-muted'}`}
                  aria-hidden="true"
                />
              </button>
            ))}
          </div>
        );
      }
      return (
        <div role="radiogroup" className={`grid gap-1.5 ${max > 5 ? 'grid-cols-5 sm:grid-cols-10' : 'grid-cols-5'}`}>
          {values.map((n) => (
            <button key={n} type="button" role="radio" aria-checked={value === n} onClick={() => set(n)} className={`${pill(value === n)} tabular-nums`}>
              {n}
            </button>
          ))}
        </div>
      );
    }
    case 'yes_no':
      return (
        <div role="radiogroup" className="grid grid-cols-2 gap-2">
          {(['yes', 'no'] as const).map((v) => (
            <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => set(v)} className={pill(value === v)}>
              {v === 'yes' ? t.yes : t.no}
            </button>
          ))}
        </div>
      );
    case 'consent':
      return (
        <label className={`${pill(value === true)} flex cursor-pointer items-start gap-3`}>
          <input type="checkbox" checked={value === true} onChange={(e) => set(e.target.checked)} className="mt-0.5 size-4 accent-nova-600" />
          <span>{field.description || field.label}</span>
        </label>
      );
    case 'matrix': {
      const grid = (value as Record<string, string>) ?? {};
      return (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th scope="col" className="sr-only">
                  {field.label}
                </th>
                {field.choices.map((c) => (
                  <th key={c.id} scope="col" className="px-2 pb-2 text-center font-semibold text-muted">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {field.rows.map((r) => (
                <tr key={r.id} className="border-t border-app">
                  <th scope="row" className="py-2.5 pr-2 text-left font-semibold">
                    {r.label}
                  </th>
                  {field.choices.map((c) => (
                    <td key={c.id} className="text-center">
                      <input
                        type="radio"
                        name={`${id}-${r.id}`}
                        aria-label={`${r.label}: ${c.label}`}
                        checked={grid[r.id] === c.id}
                        onChange={() => set({ ...grid, [r.id]: c.id })}
                        className="size-5 accent-nova-600"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case 'ranking': {
      const order = (value as string[]) ?? field.choices.map((c) => c.id);
      const label = (cid: string) => field.choices.find((c) => c.id === cid)?.label ?? '';
      const move = (i: number, j: number) => {
        const next = [...order];
        [next[i], next[j]] = [next[j]!, next[i]!];
        set(next);
      };
      return (
        <ol className="space-y-2">
          {order.map((cid, i) => (
            <li key={cid} className="flex items-center gap-2 rounded-xl border-2 border-app bg-surface px-3 py-2">
              <span className="w-6 font-display font-bold tabular-nums text-muted">{i + 1}</span>
              <span className="flex-1 font-semibold">{label(cid)}</span>
              <button type="button" aria-label={t.moveUp(label(cid))} disabled={i === 0} onClick={() => move(i, i - 1)} className="rounded-lg p-1.5 hover:bg-surface-2 disabled:opacity-30">
                <ArrowUp className="size-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label={t.moveDown(label(cid))}
                disabled={i === order.length - 1}
                onClick={() => move(i, i + 1)}
                className="rounded-lg p-1.5 hover:bg-surface-2 disabled:opacity-30"
              >
                <ArrowDown className="size-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ol>
      );
    }
    default:
      return isUpload(field.type) ? <p className="rounded-xl bg-surface-2 px-4 py-3 text-sm text-muted">{t.uploadsSoon}</p> : null;
  }
}

/** Groups use a fieldset legend; single inputs use a label. */
const LABELLED_BY_LABEL = new Set<FormField['type']>(['short_text', 'long_text', 'email', 'phone', 'number', 'date', 'datetime', 'dropdown']);

export function EventFeedbackForm({
  form,
  title,
  description,
  intro,
  submitLabel,
  note,
  t,
  onSubmit,
  onSkip,
}: {
  form: PlayForm;
  title: string;
  description: string;
  intro: string;
  submitLabel: string;
  note?: string;
  t: Strings;
  onSubmit: (answers: FeedbackAnswers) => Promise<'ok' | 'failed' | Record<string, AnswerProblem>>;
  onSkip?: () => void;
}) {
  const { fields } = form;
  const [values, setValues] = useState<Values>(() => initialValues(fields));
  const [problems, setProblems] = useState<Record<string, AnswerProblem>>({});
  const [failed, setFailed] = useState(false);
  const [sending, setSending] = useState(false);
  const shown = useMemo(() => visibleFields(fields, values as FeedbackAnswers), [fields, values]);

  const set = (fieldId: string, v: unknown) => {
    setValues((prev) => ({ ...prev, [fieldId]: v }));
    setProblems(({ [fieldId]: _, ...rest }) => rest);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setFailed(false);
    const checked = checkFeedback(fields, values);
    if (!checked.ok) {
      setProblems(checked.problems);
      document.getElementById(`fb-q-${Object.keys(checked.problems)[0]}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setSending(true);
    const result = await onSubmit(checked.answers);
    setSending(false);
    if (result === 'failed') setFailed(true);
    else if (result !== 'ok') setProblems(result);
  };

  const hasProblems = Object.keys(problems).length > 0;

  return (
    <form onSubmit={submit} noValidate className="mx-auto w-full max-w-xl animate-rise space-y-4 px-4 pb-16">
      <div className="glass-panel rounded-[2rem] p-6">
        <p className="text-sm font-bold text-nova-700 dark:text-nova-300">{intro}</p>
        <h1 className="mt-1 font-display text-2xl font-bold">{title}</h1>
        {description && <p className="mt-2 whitespace-pre-line text-muted">{description}</p>}
      </div>

      {shown.map((field) => {
        const problem = problems[field.id];
        if (field.type === 'heading') {
          return (
            <div key={field.id} className="px-2 pt-2">
              <h2 className="font-display text-xl font-bold">{field.label}</h2>
              {field.description && <p className="text-sm text-muted">{field.description}</p>}
            </div>
          );
        }
        const byLabel = LABELLED_BY_LABEL.has(field.type);
        const Title = byLabel ? 'label' : 'legend';
        const Wrapper = byLabel ? 'div' : 'fieldset';
        return (
          <Wrapper
            key={field.id}
            id={`fb-q-${field.id}`}
            className={`glass-panel block w-full space-y-3 rounded-2xl p-5 ${problem ? 'ring-2 ring-rose-400' : ''}`}
            aria-describedby={problem ? `fb-err-${field.id}` : undefined}
          >
            <Title {...(byLabel ? { htmlFor: `fb-${field.id}` } : {})} className="block font-semibold">
              {field.type === 'consent' ? field.label : field.label || '\u2014'}
              {field.required && !isUpload(field.type) && (
                <span className="text-coral-600" title={t.requiredMark}>
                  {' '}
                  *<span className="sr-only"> ({t.requiredMark})</span>
                </span>
              )}
            </Title>
            {field.description && field.type !== 'consent' && <p className="-mt-1 text-sm text-muted">{field.description}</p>}
            <FieldInput field={field} value={values[field.id]} set={(v) => set(field.id, v)} t={t} />
            {problem && (
              <p id={`fb-err-${field.id}`} role="alert" className="text-sm font-semibold text-rose-600 dark:text-rose-300">
                {problem === 'required' ? t.answerRequired : t.answerInvalid}
              </p>
            )}
          </Wrapper>
        );
      })}

      {(hasProblems || failed) && (
        <p role="alert" className="text-center text-sm font-semibold text-rose-600 dark:text-rose-300">
          {failed ? t.feedbackFailed : t.fixAnswers}
        </p>
      )}
      <button
        type="submit"
        disabled={sending}
        className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(100deg,#6d4aff,#ff5d73)] text-lg font-bold text-white shadow-lift transition hover:brightness-110 disabled:opacity-60"
      >
        {sending && <Loader2 className="size-5 animate-spin" aria-hidden="true" />}
        {sending ? t.sending : submitLabel}
      </button>
      {onSkip && (
        <button type="button" onClick={onSkip} disabled={sending} className="h-12 w-full rounded-2xl font-semibold text-muted hover:bg-surface-2 hover:text-app">
          {t.skipFeedback}
        </button>
      )}
      {note && <p className="text-center text-xs text-muted">{note}</p>}
    </form>
  );
}
