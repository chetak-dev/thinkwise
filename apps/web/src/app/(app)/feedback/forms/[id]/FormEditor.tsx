'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import Link from 'next/link';
import {
  AlignLeft,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Calendar,
  CalendarClock,
  Check,
  ChevronsUpDown,
  CircleDot,
  CloudOff,
  Copy,
  FileText,
  Gauge,
  Grid3x3,
  Hash,
  Heading,
  ImageIcon,
  ListOrdered,
  Loader2,
  Mail,
  Music,
  Paperclip,
  Phone,
  Plus,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  SquareCheck,
  Star,
  ToggleLeft,
  Trash2,
  Type,
  Video,
  X,
} from 'lucide-react';
import {
  CHOICE_LABEL_MAX,
  CONDITION_OPS,
  CONDITION_OP_LABELS,
  CONDITION_VALUE_MAX,
  FIELD_DESCRIPTION_MAX,
  FIELD_LABEL_MAX,
  FIELD_TYPES,
  FIELD_TYPE_LABELS,
  FORM_DESCRIPTION_MAX,
  FORM_TITLE_MAX,
  MAX_CHOICES,
  MAX_FIELDS,
  MAX_FILES,
  MAX_FILE_MB,
  hasChoices,
  isUpload,
  newField,
  type FieldType,
  type FormField,
} from '@thinkwise/shared';
import { Switch } from '@/components/Switch';
import { ConfirmDeleteButton } from '@/components/ConfirmDeleteButton';
import { deleteFeedbackFormAction, saveFeedbackFormAction } from '../../actions';

const FIELD_ICONS: Record<FieldType, ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' }>> = {
  short_text: Type,
  long_text: AlignLeft,
  single: CircleDot,
  checkboxes: SquareCheck,
  dropdown: ChevronsUpDown,
  rating: Gauge,
  stars: Star,
  scale: SlidersHorizontal,
  yes_no: ToggleLeft,
  number: Hash,
  date: Calendar,
  datetime: CalendarClock,
  email: Mail,
  phone: Phone,
  file: Paperclip,
  image: ImageIcon,
  document: FileText,
  audio: Music,
  video: Video,
  matrix: Grid3x3,
  ranking: ListOrdered,
  consent: ShieldCheck,
  heading: Heading,
};

const INPUT_CLASS =
  'w-full rounded-xl border border-app bg-surface px-3 py-2 text-sm font-normal focus:border-nova-400 focus:outline-none focus:ring-4 focus:ring-nova-500/15';
const SELECT_CLASS =
  'h-10 w-full rounded-xl border border-app bg-surface px-3 text-sm font-medium focus:border-nova-400 focus:outline-none';
const ICON_BTN =
  'inline-flex size-8 items-center justify-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-app disabled:opacity-40';

const makeId = () => crypto.randomUUID();

interface Doc {
  title: string;
  description: string;
  fields: FormField[];
}

export interface EditorForm extends Doc {
  id: string;
}

function ChoiceList({
  label,
  addLabel,
  items,
  onChange,
}: {
  label: string;
  addLabel: string;
  items: FormField['choices'];
  onChange: (items: FormField['choices']) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1.5 text-sm font-semibold">{label}</legend>
      {items.map((item, i) => (
        <div key={item.id} className="flex items-center gap-1.5">
          <input
            aria-label={`${label} ${i + 1}`}
            value={item.label}
            maxLength={CHOICE_LABEL_MAX}
            onChange={(e) => onChange(items.map((x) => (x.id === item.id ? { ...x, label: e.target.value } : x)))}
            className={INPUT_CLASS}
          />
          <button
            type="button"
            aria-label={`Remove ${item.label || `item ${i + 1}`}`}
            disabled={items.length <= 1}
            onClick={() => onChange(items.filter((x) => x.id !== item.id))}
            className={ICON_BTN}
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      ))}
      <button
        type="button"
        disabled={items.length >= MAX_CHOICES}
        onClick={() => onChange([...items, { id: makeId(), label: `${label === 'Rows' ? 'Row' : 'Option'} ${items.length + 1}` }])}
        className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-semibold text-nova-700 hover:bg-surface-2 disabled:opacity-40 dark:text-nova-300"
      >
        <Plus className="size-4" aria-hidden="true" />
        {addLabel}
      </button>
    </fieldset>
  );
}

function clampInt(value: string, min: number, max: number, fallback: number) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

export function FormEditor({ form, usage }: { form: EditorForm; usage: { events: number; responses: number } }) {
  const [doc, setDoc] = useState<Doc>({ title: form.title, description: form.description, fields: form.fields });
  const [selectedId, setSelectedId] = useState<string | null>(form.fields[0]?.id ?? null);
  const { fields } = doc;

  // Autosave: compare a snapshot of what's on screen with what the server last accepted.
  const snapshot = useMemo(() => JSON.stringify(doc), [doc]);
  const initial = useRef(JSON.stringify({ title: form.title, description: form.description, fields: form.fields }));
  const [savedSnapshot, setSavedSnapshot] = useState(initial.current);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const latest = useRef(snapshot);
  const saved = useRef(initial.current);
  const inflight = useRef<Promise<boolean> | null>(null);
  const dirty = snapshot !== savedSnapshot;

  useEffect(() => {
    latest.current = snapshot;
  }, [snapshot]);

  const flush = useCallback(async (): Promise<boolean> => {
    while (inflight.current) await inflight.current;
    const body = latest.current;
    if (body === saved.current) return true;
    setSaving(true);
    const request = saveFeedbackFormAction(form.id, JSON.parse(body) as unknown)
      .then((result) => {
        if (!result.ok) {
          setSaveError(result.error);
          return false;
        }
        saved.current = body;
        setSavedSnapshot(body);
        setSaveError(null);
        return true;
      })
      .catch(() => {
        setSaveError('Couldn’t reach the server.');
        return false;
      });
    inflight.current = request;
    const ok = await request;
    inflight.current = null;
    setSaving(false);
    if (!ok) return false;
    return latest.current === saved.current ? true : flush();
  }, [form.id]);

  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(() => void flush(), 800);
    return () => clearTimeout(timer);
  }, [snapshot, dirty, flush]);

  useEffect(() => {
    if (!dirty && !saving) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, saving]);

  const setFields = (change: (fs: FormField[]) => FormField[]) => setDoc((d) => ({ ...d, fields: change(d.fields) }));
  const current = fields.find((f) => f.id === selectedId) ?? null;
  const updateCurrent = (patch: Partial<FormField>) =>
    current && setFields((fs) => fs.map((f) => (f.id === current.id ? { ...f, ...patch } : f)));

  const addField = (type: FieldType) => {
    if (fields.length >= MAX_FIELDS) return;
    const field = newField(type, makeId(), makeId);
    const at = current ? fields.findIndex((f) => f.id === current.id) + 1 : fields.length;
    setFields((fs) => [...fs.slice(0, at), field, ...fs.slice(at)]);
    setSelectedId(field.id);
  };

  const move = (from: number, to: number) =>
    setFields((fs) => {
      const next = [...fs];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item!);
      return next;
    });

  const duplicate = () => {
    if (!current || fields.length >= MAX_FIELDS) return;
    const copy: FormField = {
      ...current,
      id: makeId(),
      choices: current.choices.map((c) => ({ ...c, id: makeId() })),
      rows: current.rows.map((r) => ({ ...r, id: makeId() })),
    };
    const at = fields.findIndex((f) => f.id === current.id) + 1;
    setFields((fs) => [...fs.slice(0, at), copy, ...fs.slice(at)]);
    setSelectedId(copy.id);
  };

  const remove = () => {
    if (!current) return;
    const i = fields.findIndex((f) => f.id === current.id);
    // Questions that depended on this one go back to always showing.
    setFields((fs) =>
      fs.filter((f) => f.id !== current.id).map((f) => (f.condition?.fieldId === current.id ? { ...f, condition: null } : f)),
    );
    setSelectedId(fields[i + 1]?.id ?? fields[i - 1]?.id ?? null);
  };

  const conditionSources = current
    ? fields.map((f, i) => ({ ...f, number: i + 1 })).filter((f) => f.id !== current.id && f.type !== 'heading')
    : [];

  return (
    <div className="-mx-4 -my-6 flex min-h-[calc(100dvh-57px)] flex-col sm:-mx-6 lg:-mx-10 lg:-my-10 lg:min-h-dvh">
      <header className="sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b border-app bg-surface/95 px-3 py-2 backdrop-blur sm:px-4">
        <Link href="/feedback" className="inline-flex items-center gap-1.5 rounded-lg p-2 text-sm font-semibold text-muted hover:bg-surface-2">
          <ArrowLeft className="size-5" aria-hidden="true" />
          <span className="hidden sm:inline">Feedback + Quiz</span>
        </Link>
        <label htmlFor="form-title" className="sr-only">
          Form title
        </label>
        <input
          id="form-title"
          value={doc.title}
          maxLength={FORM_TITLE_MAX}
          placeholder="Name your form"
          onChange={(e) => setDoc((d) => ({ ...d, title: e.target.value }))}
          className="min-w-[12rem] flex-1 rounded-lg bg-transparent px-2 py-1.5 font-display text-lg font-bold hover:bg-surface-2 focus:bg-surface-2 focus:outline-none"
        />
        <span role="status" className="flex items-center gap-1.5 px-2 text-xs font-semibold text-muted">
          {saveError && !saving ? (
            <>
              <CloudOff className="size-3.5 text-coral-600" aria-hidden="true" />
              <span className="text-coral-600">Not saved</span>
            </>
          ) : dirty || saving ? (
            <>
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              Saving…
            </>
          ) : (
            <>
              <Check className="size-3.5 text-emerald-600" aria-hidden="true" />
              Saved
            </>
          )}
        </span>
        <button
          type="button"
          disabled={saving || (!dirty && !saveError)}
          onClick={() => void flush()}
          className="inline-flex h-8 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-nova-600 px-3 text-sm font-semibold text-white shadow-[0_6px_20px_-8px_rgb(90_47_242/0.7)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-nova-700 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50"
        >
          <Save className="size-4" aria-hidden="true" />
          Save
        </button>
        <ConfirmDeleteButton
          label="Delete form"
          title="Delete this form?"
          description={
            usage.events
              ? `It is used by ${usage.events} ${usage.events === 1 ? 'event' : 'events'}. They will need another form, and their exports and summaries will lose this form\u2019s questions.`
              : 'This can’t be undone.'
          }
          action={deleteFeedbackFormAction.bind(null, form.id)}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/40"
        />
      </header>

      {usage.responses > 0 && (
        <p className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          This form already has {usage.responses} {usage.responses === 1 ? 'response' : 'responses'}. Edits apply to new responses; answers to questions you delete drop out of the exports.
        </p>
      )}

      {saveError && !saving && (
        <p role="alert" className="border-b border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
          {saveError}
        </p>
      )}

      <div className="flex flex-1 flex-col lg:flex-row">
        <aside aria-label="Add a field" className="border-b border-app bg-surface p-4 lg:w-56 lg:shrink-0 lg:border-b-0 lg:border-r">
          <p className="mb-3 text-xs font-bold uppercase tracking-[.16em] text-muted">Add a field</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-1">
            {FIELD_TYPES.map((type) => {
              const Icon = FIELD_ICONS[type];
              return (
                <button
                  key={type}
                  type="button"
                  disabled={fields.length >= MAX_FIELDS}
                  onClick={() => addField(type)}
                  className="flex items-center gap-2 rounded-xl border border-app px-3 py-2 text-left text-sm font-semibold transition hover:border-nova-400 hover:bg-nova-50 disabled:opacity-40 dark:hover:bg-nova-950"
                >
                  <Icon className="size-4 shrink-0 text-nova-600 dark:text-nova-300" aria-hidden="true" />
                  {FIELD_TYPE_LABELS[type]}
                </button>
              );
            })}
          </div>
        </aside>

        <section aria-label="Form" className="min-w-0 flex-1 bg-surface-2 p-4 sm:p-8">
          <div className="mx-auto max-w-2xl space-y-4">
            <div className="rounded-2xl border border-app bg-surface p-5 shadow-soft">
              <input
                aria-label="Form title as participants see it"
                value={doc.title}
                maxLength={FORM_TITLE_MAX}
                placeholder="Name your form"
                onChange={(e) => setDoc((d) => ({ ...d, title: e.target.value }))}
                className="w-full bg-transparent font-display text-2xl font-bold focus:outline-none"
              />
              <textarea
                aria-label="Form description"
                value={doc.description}
                maxLength={FORM_DESCRIPTION_MAX}
                rows={2}
                placeholder="What is this feedback for? Participants see this above the questions."
                onChange={(e) => setDoc((d) => ({ ...d, description: e.target.value }))}
                className="mt-2 w-full resize-y bg-transparent text-sm text-muted focus:outline-none"
              />
            </div>

            {fields.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-app bg-surface px-6 py-10 text-center text-sm text-muted">
                Pick a field type to add your first question.
              </p>
            ) : (
              <ol className="space-y-3">
                {fields.map((field, i) => {
                  const active = field.id === selectedId;
                  const Icon = FIELD_ICONS[field.type];
                  return (
                    <li key={field.id} className="group relative">
                      <button
                        type="button"
                        aria-current={active ? 'true' : undefined}
                        onClick={() => setSelectedId(field.id)}
                        className={`flex w-full items-start gap-3 rounded-2xl border-2 bg-surface p-5 pr-24 text-left shadow-soft transition ${
                          active ? 'border-nova-500' : 'border-transparent hover:border-nova-200 dark:hover:border-ink-600'
                        }`}
                      >
                        <Icon className="mt-0.5 size-5 shrink-0 text-nova-600 dark:text-nova-300" aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                          <span className={`block break-words font-semibold ${field.type === 'heading' ? 'font-display text-lg' : ''}`}>
                            {field.label || 'Untitled question'}
                            {field.required && field.type !== 'heading' && (
                              <span className="text-coral-600" aria-label="required">
                                {' '}
                                *
                              </span>
                            )}
                          </span>
                          <span className="mt-1 flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
                            {i + 1} · {FIELD_TYPE_LABELS[field.type]}
                            {field.condition && <span className="normal-case text-nova-700 dark:text-nova-300">· Shown conditionally</span>}
                          </span>
                        </span>
                      </button>
                      <span className="absolute right-3 top-4 flex gap-1 opacity-100 transition sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
                        <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, i - 1)} className={ICON_BTN}>
                          <ArrowUp className="size-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          aria-label="Move down"
                          disabled={i === fields.length - 1}
                          onClick={() => move(i, i + 1)}
                          className={ICON_BTN}
                        >
                          <ArrowDown className="size-4" aria-hidden="true" />
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </section>

        <aside aria-label="Field settings" className="space-y-5 border-t border-app bg-surface p-4 lg:w-80 lg:shrink-0 lg:border-l lg:border-t-0">
          {!current ? (
            <p className="text-sm text-muted">Select a field to change its settings.</p>
          ) : (
            <>
              <div>
                <p className="text-xs font-bold uppercase tracking-[.16em] text-muted">Field settings</p>
                <p className="mt-1 font-display text-lg font-bold">{FIELD_TYPE_LABELS[current.type]}</p>
              </div>
              <label className="block space-y-1.5 text-sm font-semibold">
                {current.type === 'heading' ? 'Heading' : 'Question'}
                <textarea
                  value={current.label}
                  rows={2}
                  maxLength={FIELD_LABEL_MAX}
                  onChange={(e) => updateCurrent({ label: e.target.value })}
                  className={`${INPUT_CLASS} resize-y`}
                />
              </label>
              <label className="block space-y-1.5 text-sm font-semibold">
                Help text
                <textarea
                  value={current.description}
                  rows={2}
                  maxLength={FIELD_DESCRIPTION_MAX}
                  placeholder="Optional"
                  onChange={(e) => updateCurrent({ description: e.target.value })}
                  className={`${INPUT_CLASS} resize-y`}
                />
              </label>
              {current.type !== 'heading' && (
                <Switch checked={current.required} onChange={(required) => updateCurrent({ required })} label="Required" />
              )}

              {hasChoices(current.type) && (
                <ChoiceList
                  label={current.type === 'matrix' ? 'Columns' : 'Choices'}
                  addLabel={current.type === 'matrix' ? 'Add column' : 'Add choice'}
                  items={current.choices}
                  onChange={(choices) => updateCurrent({ choices })}
                />
              )}
              {current.type === 'matrix' && (
                <ChoiceList label="Rows" addLabel="Add row" items={current.rows} onChange={(rows) => updateCurrent({ rows })} />
              )}
              {isUpload(current.type) && (
                <div className="grid grid-cols-2 gap-3">
                  <label className="block space-y-1.5 text-sm font-semibold">
                    Files allowed
                    <input
                      type="number"
                      min={1}
                      max={MAX_FILES}
                      value={current.maxFiles}
                      onChange={(e) => updateCurrent({ maxFiles: clampInt(e.target.value, 1, MAX_FILES, current.maxFiles) })}
                      className={INPUT_CLASS}
                    />
                  </label>
                  <label className="block space-y-1.5 text-sm font-semibold">
                    Size limit (MB)
                    <input
                      type="number"
                      min={1}
                      max={MAX_FILE_MB}
                      value={current.maxMb}
                      onChange={(e) => updateCurrent({ maxMb: clampInt(e.target.value, 1, MAX_FILE_MB, current.maxMb) })}
                      className={INPUT_CLASS}
                    />
                  </label>
                </div>
              )}

              <div className="space-y-2">
                <div className="space-y-1.5">
                  <label htmlFor="field-condition" className="block text-sm font-semibold">
                    Show this field
                  </label>
                  <select
                    id="field-condition"
                    value={current.condition?.fieldId ?? ''}
                    disabled={conditionSources.length === 0}
                    onChange={(e) =>
                      updateCurrent({
                        condition: e.target.value ? { fieldId: e.target.value, op: current.condition?.op ?? 'equals', value: current.condition?.value ?? '' } : null,
                      })
                    }
                    className={SELECT_CLASS}
                  >
                    <option value="">Always</option>
                    {conditionSources.map((f) => (
                      <option key={f.id} value={f.id}>
                        Only if {f.number}. {(f.label || 'Untitled question').slice(0, 60)}
                      </option>
                    ))}
                  </select>
                </div>
                {current.condition && (
                  <div className="flex gap-2">
                    <select
                      aria-label="Condition"
                      value={current.condition.op}
                      onChange={(e) =>
                        updateCurrent({ condition: { ...current.condition!, op: e.target.value as (typeof CONDITION_OPS)[number] } })
                      }
                      className={`${SELECT_CLASS} w-auto`}
                    >
                      {CONDITION_OPS.map((op) => (
                        <option key={op} value={op}>
                          {CONDITION_OP_LABELS[op]}
                        </option>
                      ))}
                    </select>
                    <input
                      aria-label="Answer to match"
                      placeholder="Answer"
                      value={current.condition.value}
                      maxLength={CONDITION_VALUE_MAX}
                      onChange={(e) => updateCurrent({ condition: { ...current.condition!, value: e.target.value } })}
                      className={INPUT_CLASS}
                    />
                  </div>
                )}
              </div>

              <div className="flex gap-2 border-t border-app pt-4">
                <button
                  type="button"
                  disabled={fields.length >= MAX_FIELDS}
                  onClick={duplicate}
                  className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl border border-app text-sm font-semibold hover:border-nova-400 disabled:opacity-40"
                >
                  <Copy className="size-4" aria-hidden="true" />
                  Duplicate
                </button>
                <button
                  type="button"
                  onClick={remove}
                  className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl border border-app text-sm font-semibold text-coral-600 hover:border-coral-400 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                  Delete
                </button>
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
