/** Shown instantly while the next page renders on the server. */
export default function Loading() {
  return (
    <div className="animate-pulse space-y-6" role="status" aria-label="Loading">
      <div className="h-9 w-56 rounded-xl bg-surface-2" />
      <div className="h-4 w-80 max-w-full rounded-lg bg-surface-2" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-36 rounded-2xl border border-app bg-surface" />
        ))}
      </div>
    </div>
  );
}
