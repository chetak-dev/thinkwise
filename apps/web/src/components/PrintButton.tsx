'use client';

import { Printer } from 'lucide-react';

export function PrintButton({ label = 'Print / PDF', className }: { label?: string; className?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={className}>
      <Printer className="size-4" aria-hidden="true" />
      {label}
    </button>
  );
}
