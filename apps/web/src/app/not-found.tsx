import Link from 'next/link';
import { Logo } from '@/components/Logo';

export default function NotFound() {
  return (
    <main id="main" className="relative flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="decorative arena-grid pointer-events-none absolute inset-0 -z-10" aria-hidden="true" />
      <Link href="/" aria-label="ThinkWise home" className="mb-4">
        <Logo className="text-2xl" />
      </Link>
      <p className="nova-text font-display text-7xl font-bold">404</p>
      <h1 className="font-display text-3xl font-bold">We couldn’t find that page</h1>
      <p className="max-w-md text-muted">It may have moved or been deleted, or you may not have permission to see it.</p>
      <div className="mt-2 flex flex-wrap justify-center gap-3">
        <Link
          href="/"
          className="inline-flex h-12 items-center justify-center rounded-xl bg-nova-600 px-6 font-semibold text-white shadow-[0_6px_20px_-8px_rgb(90_47_242/0.7)] transition hover:-translate-y-0.5 hover:bg-nova-700"
        >
          Go home
        </Link>
        <Link
          href="/play"
          className="inline-flex h-12 items-center justify-center rounded-xl border border-app bg-surface px-6 font-semibold text-app transition hover:-translate-y-0.5 hover:border-nova-400"
        >
          Join a game
        </Link>
      </div>
    </main>
  );
}
