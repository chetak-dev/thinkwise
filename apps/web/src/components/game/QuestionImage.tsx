'use client';

import { useState } from 'react';
import { ImageIcon } from 'lucide-react';

/** Host-supplied picture for a question. External link, so no referrer and it quietly disappears if it fails. */
export function QuestionImage({
  url,
  lowData = false,
  showLabel = 'Show image',
  className = 'max-h-56',
}: {
  url: string;
  lowData?: boolean;
  showLabel?: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const [requested, setRequested] = useState(false);

  if (failed) return null;
  if (lowData && !requested) {
    return (
      <button
        type="button"
        onClick={() => setRequested(true)}
        className="mx-auto flex items-center gap-2 rounded-xl border border-app bg-surface px-3 py-2 text-sm font-semibold text-muted hover:text-app"
      >
        <ImageIcon className="size-4" aria-hidden="true" />
        {showLabel}
      </button>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- arbitrary host-supplied URLs can't go through next/image
    <img
      key={url}
      src={url}
      alt=""
      referrerPolicy="no-referrer"
      decoding="async"
      onError={() => setFailed(true)}
      className={`mx-auto w-auto max-w-full rounded-2xl object-contain ${className}`}
    />
  );
}
