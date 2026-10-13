import type { SocketStatus } from '@/lib/useGameSocket';

export function ConnectionBadge({ status }: { status: SocketStatus }) {
  if (status === 'open') return null;
  return (
    <div
      role="status"
      className="fixed inset-x-0 top-3 z-50 mx-auto w-fit rounded-full bg-sun-500 px-4 py-1.5 text-sm font-bold text-ink-900 shadow-lift"
    >
      {status === 'connecting' ? 'Connecting…' : 'Connection lost — reconnecting…'}
    </div>
  );
}
