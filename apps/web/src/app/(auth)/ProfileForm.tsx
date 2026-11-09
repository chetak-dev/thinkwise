'use client';

import { useActionState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { GENDER_LABELS, GENDER_VALUES } from '@thinkwise/shared';
import { profileAction, type ProfileFormState } from './actions';
import { FieldError, INPUT, SUBMIT } from './AuthShell';

type Field = keyof NonNullable<ProfileFormState['values']>;

/** With `next` set the form continues there once saved; otherwise it stays and confirms. */
export function ProfileForm({
  initial,
  next,
  submitLabel,
}: {
  initial: NonNullable<ProfileFormState['values']>;
  next?: string;
  submitLabel: string;
}) {
  const [state, action, pending] = useActionState<ProfileFormState | undefined, FormData>(profileAction, undefined);
  const values = state?.values ?? initial;
  const err = (f: Field) => state?.fieldErrors?.[f];

  // Keep entered values when a server action returns validation errors.
  return (
    <form action={action} onReset={(event) => event.preventDefault()} className="space-y-4" noValidate>
      {next && <input type="hidden" name="next" value={next} />}
      <div className="space-y-1.5">
        <label htmlFor="name" className="block text-sm font-semibold text-app">
          Full name
        </label>
        <input
          id="name"
          name="name"
          autoComplete="name"
          required
          maxLength={80}
          defaultValue={values.name}
          aria-invalid={!!err('name')}
          aria-describedby={err('name') ? 'name-error' : undefined}
          className={INPUT}
        />
        <FieldError id="name-error" message={err('name')} />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="gender" className="block text-sm font-semibold text-app">
          Gender
        </label>
        <select
          id="gender"
          name="gender"
          required
          defaultValue={values.gender}
          aria-invalid={!!err('gender')}
          aria-describedby={err('gender') ? 'gender-error' : undefined}
          className={INPUT}
        >
          <option value="">Choose an option</option>
          {GENDER_VALUES.map((gender) => (
            <option key={gender} value={gender}>{GENDER_LABELS[gender]}</option>
          ))}
        </select>
        <FieldError id="gender-error" message={err('gender')} />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="phone" className="block text-sm font-semibold text-app">
          Phone number
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          required
          minLength={10}
          pattern="[0-9]{10}"
          placeholder="9876543210"
          defaultValue={values.phone}
          onInput={(event) => {
            const input = event.currentTarget;
            const digits = input.value.replace(/\D/g, '').slice(0, 12);
            // "+91 98765 43210" or "098765 43210", typed or pasted, becomes the 10-digit number.
            const local = (digits.length === 12 && digits.startsWith('91')) || (digits.length === 11 && digits.startsWith('0'))
              ? digits.slice(-10)
              : digits;
            if (input.value !== local) input.value = local;
          }}
          aria-invalid={!!err('phone')}
          aria-describedby={err('phone') ? 'phone-error' : 'phone-hint'}
          className={INPUT}
        />
        {!err('phone') && (
          <p id="phone-hint" className="text-xs text-muted">
            10 digits, without +91 or 0.
          </p>
        )}
        <FieldError id="phone-error" message={err('phone')} />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="address" className="block text-sm font-semibold text-app">
          Address
        </label>
        <textarea
          id="address"
          name="address"
          autoComplete="street-address"
          required
          rows={3}
          maxLength={300}
          defaultValue={values.address}
          aria-invalid={!!err('address')}
          aria-describedby={err('address') ? 'address-error' : undefined}
          className={`${INPUT} h-auto py-2.5`}
        />
        <FieldError id="address-error" message={err('address')} />
      </div>
      <p className="text-xs text-muted">Only you and the site admins can see these details.</p>
      {state?.error && (
        <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
          {state.error}
        </p>
      )}
      {state?.saved && (
        <p role="status" className="flex items-center gap-2 rounded-xl bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-800 dark:text-emerald-200">
          <CheckCircle2 className="size-4" aria-hidden="true" />
          Your details are saved.
        </p>
      )}
      <button type="submit" disabled={pending} className={SUBMIT}>
        {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
        {submitLabel}
      </button>
    </form>
  );
}
