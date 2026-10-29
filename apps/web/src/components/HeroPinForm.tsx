'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export function HeroPinForm() {
  const router = useRouter();
  const [pin, setPin] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const clean = pin.replace(/\D/g, '').slice(0, 7);
    router.push(clean.length === 7 ? `/play/self?pin=${clean}` : clean ? `/play?pin=${clean}` : '/play');
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <label htmlFor="hero-pin" className="block text-center font-display text-lg font-bold">
        Joining a game?
      </label>
      <div className="flex gap-2">
        <input
          id="hero-pin"
          inputMode="numeric"
          autoComplete="off"
          maxLength={7}
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="123 456"
          className="h-14 min-w-0 flex-1 rounded-2xl border-2 border-app bg-surface-2 text-center font-display text-2xl font-bold tracking-[0.25em] placeholder:tracking-normal placeholder:text-muted/60 focus:border-nova-500 focus:outline-none"
        />
        <button
          type="submit"
          className="h-14 rounded-2xl bg-ink-900 px-6 font-bold text-white hover:bg-ink-800 dark:bg-white dark:text-ink-900"
        >
          Go
        </button>
      </div>
    </form>
  );
}
