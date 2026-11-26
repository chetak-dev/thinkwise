import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export function parsePage(raw: string | undefined) {
  const n = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, 1), 10_000) : 1;
}

const LINK =
  'inline-flex h-10 items-center gap-1.5 rounded-xl border border-app bg-surface px-4 text-sm font-semibold transition hover:bg-surface-2';

/** Previous / next links for a server-paged list; other query parameters are kept. */
export function Pager({
  basePath,
  params,
  page,
  hasNext,
}: {
  basePath: string;
  params: Record<string, string | undefined>;
  page: number;
  hasNext: boolean;
}) {
  if (page <= 1 && !hasNext) return null;
  const href = (p: number) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
    if (p > 1) qs.set('page', String(p));
    const s = qs.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  return (
    <nav aria-label="Pages" className="flex items-center justify-between gap-3">
      {page > 1 ? (
        <Link href={href(page - 1)} className={LINK}>
          <ChevronLeft className="size-4" aria-hidden="true" />
          Previous
        </Link>
      ) : (
        <span />
      )}
      <span className="text-sm font-semibold text-muted">Page {page}</span>
      {hasNext ? (
        <Link href={href(page + 1)} className={LINK}>
          Next
          <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
