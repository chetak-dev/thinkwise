'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { registerAction, type FormState } from '../actions';
import { FieldError, INPUT, SUBMIT } from '../AuthShell';

type Field = 'name' | 'email' | 'password';

export function RegisterForm({ next = '/dashboard' }: { next?: string }) {
  const [state, action, pending] = useActionState<FormState | undefined, FormData>(registerAction, undefined);
  const err = (f: Field) => state?.fieldErrors?.[f];
  const describedBy = (f: Field, hint?: string) => [err(f) ? `${f}-error` : '', hint ?? ''].filter(Boolean).join(' ') || undefined;

  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <div className="space-y-1.5">
        <label htmlFor="name" className="block text-sm font-semibold text-app">
          Your name
        </label>
        <input
          id="name"
          name="name"
          autoComplete="name"
          required
          maxLength={80}
          defaultValue={state?.values?.name}
          aria-invalid={!!err('name')}
          aria-describedby={describedBy('name')}
          className={INPUT}
        />
        <FieldError id="name-error" message={err('name')} />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="email" className="block text-sm font-semibold text-app">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={state?.values?.email}
          aria-invalid={!!err('email')}
          aria-describedby={describedBy('email')}
          className={INPUT}
        />
        <FieldError id="email-error" message={err('email')} />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="password" className="block text-sm font-semibold text-app">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          aria-invalid={!!err('password')}
          aria-describedby={describedBy('password', 'password-hint')}
          className={INPUT}
        />
        <p id="password-hint" className="text-xs text-muted">
          8 characters or more
        </p>
        <FieldError id="password-error" message={err('password')} />
      </div>
      {state?.error && (
        <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className={SUBMIT}>
        {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
        Create account
      </button>
      <p className="text-center text-xs text-muted">
        Hosts need an account. Players just join with a PIN and a nickname.
      </p>
      <p className="text-center text-sm text-muted">
        Already have an account?{' '}
        <Link href={next === '/dashboard' ? '/login' : `/login?next=${encodeURIComponent(next)}`} className="font-semibold text-nova-600 hover:underline dark:text-nova-300">
          Sign in
        </Link>
      </p>
    </form>
  );
}
