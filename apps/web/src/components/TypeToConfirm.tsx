'use client';

import { useId } from 'react';

const normalise = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

/** True when what was typed matches the expected name (spacing and letter case don't matter). */
export function confirmMatches(typed: string, expected: string) {
  return normalise(typed) !== '' && normalise(typed) === normalise(expected);
}

export function TypeToConfirm({
  expected,
  value,
  onChange,
  onEnter,
}: {
  expected: string;
  value: string;
  onChange: (value: string) => void;
  onEnter?: () => void;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm">
        Type <strong className="font-semibold">{expected}</strong> to confirm.
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && onEnter && confirmMatches(value, expected)) onEnter();
        }}
        onPaste={(e) => e.preventDefault()}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        className="h-10 w-full rounded-xl border border-app bg-surface px-3 text-sm outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-300/40"
      />
    </div>
  );
}
