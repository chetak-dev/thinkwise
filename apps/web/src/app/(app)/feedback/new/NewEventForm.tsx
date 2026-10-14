'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { AlertCircle, Loader2, Sparkles } from 'lucide-react';
import {
  DEFAULT_EVENT_TITLE,
  EVENT_FLOWS,
  EVENT_FLOW_INFO,
  EVENT_IDENTITIES,
  EVENT_IDENTITY_INFO,
  FORM_DESCRIPTION_MAX,
  FORM_TITLE_MAX,
  type EventFlow,
  type EventIdentity,
} from '@thinkwise/shared';
import { Switch } from '@/components/Switch';
import { createFeedbackEventAction, updateFeedbackEventAction } from '../actions';

interface Option {
  id: string;
  title: string;
  count: number;
}

const INPUT =
  'w-full rounded-xl border border-app bg-surface px-3 py-2 text-sm font-normal focus:border-nova-400 focus:outline-none focus:ring-4 focus:ring-nova-500/15';
const SELECT = 'h-10 w-full rounded-xl border border-app bg-surface px-3 text-sm font-medium focus:border-nova-400 focus:outline-none';
const CARD = 'space-y-4 rounded-2xl border border-app bg-surface p-5 shadow-soft';

function choiceClass(selected: boolean) {
  return `block cursor-pointer rounded-2xl border-2 p-4 transition has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-nova-500/25 ${
    selected ? 'border-nova-500 bg-nova-50 dark:bg-nova-950/50' : 'border-app hover:border-nova-300'
  }`;
}

export interface EventFormValues {
  title: string;
  description: string;
  quizId: string;
  formId: string | null;
  afterFormId: string | null;
  flow: EventFlow;
  identity: EventIdentity;
  feedbackRequired: boolean;
  allowLateEntry: boolean;
}

/** Creates an event, or edits one when `eventId` and `initial` are given. */
export function NewEventForm({
  quizzes,
  forms,
  eventId,
  initial,
}: {
  quizzes: Option[];
  forms: Option[];
  eventId?: string;
  initial?: EventFormValues;
}) {
  const [title, setTitle] = useState(initial?.title ?? DEFAULT_EVENT_TITLE);
  const [description, setDescription] = useState(initial?.description ?? '');
  const [quizId, setQuizId] = useState(initial?.quizId ?? quizzes[0]?.id ?? '');
  const [formId, setFormId] = useState(initial?.formId ?? forms[0]?.id ?? '');
  const [afterFormId, setAfterFormId] = useState(initial?.afterFormId ?? forms[1]?.id ?? forms[0]?.id ?? '');
  const [flow, setFlow] = useState<EventFlow>(initial?.flow ?? 'before');
  const [identity, setIdentity] = useState<EventIdentity>(initial?.identity ?? 'identified');
  const [feedbackRequired, setFeedbackRequired] = useState(initial?.feedbackRequired ?? true);
  const [allowLateEntry, setAllowLateEntry] = useState(initial?.allowLateEntry ?? true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const needsForm = flow !== 'quiz_only';
  const canRequire = flow === 'before' || flow === 'after' || flow === 'both';

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const values = {
        title,
        description,
        quizId,
        formId: needsForm ? formId || null : null,
        afterFormId: flow === 'both' ? afterFormId || null : null,
        flow,
        identity,
        feedbackRequired,
        allowLateEntry,
      };
      const result = eventId ? await updateFeedbackEventAction(eventId, values) : await createFeedbackEventAction(values);
      // Success redirects, so only failures return here.
      if (result && !result.ok) setError(result.error);
    });
  };

  const formSelect = (id: string, label: string, value: string, onChange: (v: string) => void) => (
    <label htmlFor={id} className="block space-y-1.5 text-sm font-semibold">
      {label}
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={SELECT}>
        {forms.map((f) => (
          <option key={f.id} value={f.id}>
            {f.title || 'Untitled feedback form'} ({f.count} {f.count === 1 ? 'field' : 'fields'})
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <form onSubmit={submit} className="space-y-6">
      <section className={CARD}>
        <label className="block space-y-1.5 text-sm font-semibold">
          Event name
          <input value={title} maxLength={FORM_TITLE_MAX} onChange={(e) => setTitle(e.target.value)} className={INPUT} />
        </label>
        <label className="block space-y-1.5 text-sm font-semibold">
          Description
          <textarea
            value={description}
            rows={2}
            maxLength={FORM_DESCRIPTION_MAX}
            placeholder="Shown to participants when they join"
            onChange={(e) => setDescription(e.target.value)}
            className={`${INPUT} resize-y`}
          />
        </label>
        {quizzes.length === 0 ? (
          <p className="rounded-xl bg-surface-2 p-3 text-sm text-muted">
            You don’t have any quizzes yet.{' '}
            <Link href="/library" className="font-semibold text-nova-700 underline dark:text-nova-300">
              Create one in the library
            </Link>{' '}
            first.
          </p>
        ) : (
          <label htmlFor="event-quiz" className="block space-y-1.5 text-sm font-semibold">
            Quiz
            <select id="event-quiz" value={quizId} onChange={(e) => setQuizId(e.target.value)} className={SELECT}>
              {quizzes.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.title || 'Untitled quiz'} ({q.count} {q.count === 1 ? 'question' : 'questions'})
                </option>
              ))}
            </select>
          </label>
        )}
      </section>

      <fieldset className={CARD}>
        <legend className="sr-only">Participant flow</legend>
        <div>
          <h2 className="font-display text-lg font-bold">Participant flow</h2>
          <p className="text-sm text-muted">Where feedback fits around the quiz.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {EVENT_FLOWS.map((value) => (
            <label key={value} className={choiceClass(flow === value)}>
              <input type="radio" name="flow" value={value} checked={flow === value} onChange={() => setFlow(value)} className="sr-only" />
              <span className="block font-semibold">{EVENT_FLOW_INFO[value].label}</span>
              <span className="mt-1 block text-sm text-muted">{EVENT_FLOW_INFO[value].description}</span>
            </label>
          ))}
        </div>
        {needsForm &&
          (forms.length === 0 ? (
            <p className="rounded-xl bg-surface-2 p-3 text-sm text-muted">
              You don’t have a feedback form yet.{' '}
              <Link href="/feedback" className="font-semibold text-nova-700 underline dark:text-nova-300">
                Create one
              </Link>{' '}
              first, or choose “Quiz only”.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {formSelect('event-form', flow === 'both' ? 'Form before the quiz' : 'Feedback form', formId, setFormId)}
              {flow === 'both' && formSelect('event-after-form', 'Form after the quiz', afterFormId, setAfterFormId)}
            </div>
          ))}
      </fieldset>

      {needsForm && (
        <fieldset className={CARD}>
          <legend className="sr-only">Response identity</legend>
          <div>
            <h2 className="font-display text-lg font-bold">Response identity</h2>
            <p className="text-sm text-muted">{EVENT_IDENTITY_INFO[identity].description}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {EVENT_IDENTITIES.map((value) => (
              <label key={value} className={choiceClass(identity === value)}>
                <input
                  type="radio"
                  name="identity"
                  value={value}
                  checked={identity === value}
                  onChange={() => setIdentity(value)}
                  className="sr-only"
                />
                <span className="block text-center font-semibold">{EVENT_IDENTITY_INFO[value].label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <section className={CARD}>
        {canRequire && (
          <Switch
            checked={feedbackRequired}
            onChange={setFeedbackRequired}
            label="Feedback required"
            description="Participants must submit the form before they can continue"
          />
        )}
        <Switch
          checked={allowLateEntry}
          onChange={setAllowLateEntry}
          label="Allow late entry"
          description="People can still join after the quiz has started"
        />
      </section>

      {error && (
        <p role="alert" className="flex items-center gap-2 rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
          <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Link
          href={eventId ? `/feedback/events/${eventId}` : '/feedback'}
          className="inline-flex h-11 items-center rounded-xl border border-app bg-surface px-5 text-sm font-semibold hover:border-nova-400"
        >
          Cancel
        </Link>
        <button
          type="submit"
          disabled={pending || quizzes.length === 0 || (needsForm && forms.length === 0)}
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-[linear-gradient(100deg,#6d4aff,#ff5d73)] px-5 text-sm font-semibold text-white shadow-lift transition hover:brightness-110 disabled:pointer-events-none disabled:opacity-50"
        >
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Sparkles className="size-4" aria-hidden="true" />}
          {eventId ? 'Save changes' : 'Create event'}
        </button>
      </div>
    </form>
  );
}
