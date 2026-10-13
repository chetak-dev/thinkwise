import type { SessionStatus } from '@thinkwise/shared';

const DATE_TIME = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

export function formatDateTime(date: Date) {
  return DATE_TIME.format(date);
}

export const MODE_LABELS = { live: 'Live', self: 'Self-paced' } as const;

const STATUS_STYLES: Record<SessionStatus, string> = {
  live: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200',
  ended: 'bg-surface-2 text-muted',
  abandoned: 'bg-surface-2 text-muted',
};

export function StatusBadge({ status }: { status: SessionStatus }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[status]}`}>
      {status === 'live' ? 'in progress' : status === 'abandoned' ? 'not played' : 'ended'}
    </span>
  );
}
