'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { loginAction, type FormState } from '../actions';
import { INPUT, SUBMIT } from '../AuthShell';

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<FormState | undefined, FormData>(loginAction, undefined);

  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next} />
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
          className={INPUT}
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="password" className="block text-sm font-semibold text-app">
          Password
        </label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className={INPUT} />
      </div>
      {state?.error && (
        <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className={SUBMIT}>
        {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
        Sign in
      </button>
      <p className="text-center text-sm text-muted">
        New to ThinkWise?{' '}
        <Link href="/register" className="font-semibold text-nova-600 hover:underline dark:text-nova-300">
          Create a free account
        </Link>
      </p>
    </form>
  );
}
