import Link from 'next/link';
import { Logo } from '@/components/Logo';

export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <a
        href="#main"
        className="sr-only-focusable fixed left-3 top-3 z-[100] rounded-lg bg-nova-600 px-4 py-2 font-semibold text-white"
      >
        Skip to content
      </a>
      <div className="arena-sheen nova-gradient relative hidden overflow-hidden p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <Link href="/" aria-label="ThinkWise home" className="w-fit">
          <Logo className="text-2xl text-white" />
        </Link>
        <div className="decorative absolute -right-20 top-1/3 size-80 animate-float rounded-full bg-white/10 blur-xl" aria-hidden="true" />
        <div className="relative">
          <p className="font-display text-4xl font-bold leading-tight">
            Ask the question.
            <br />
            Let the room answer.
          </p>
          <p className="mt-4 max-w-md text-white/80">
            Live quizzes, instant results and a leaderboard everyone can see — for classrooms, campuses and events.
          </p>
        </div>
        <p className="text-sm text-white/70">Players never need an account · Works on any phone</p>
      </div>
      <main id="main" className="relative flex items-center justify-center px-4 py-10">
        <div className="decorative arena-grid pointer-events-none absolute inset-0 -z-10" aria-hidden="true" />
        <div className="glass-panel w-full max-w-md rounded-[2rem] p-6 sm:p-8">
          <Link href="/" aria-label="ThinkWise home" className="mb-8 block w-fit lg:hidden">
            <Logo className="text-2xl" />
          </Link>
          <h1 className="font-display text-3xl font-bold">{title}</h1>
          <p className="mb-6 mt-1 text-muted">{subtitle}</p>
          {children}
        </div>
      </main>
    </div>
  );
}

export const INPUT =
  'h-11 w-full rounded-xl border border-app bg-surface px-3.5 text-app placeholder:text-muted/70 transition focus:border-nova-400 focus:outline-none focus:ring-4 focus:ring-nova-500/15 disabled:opacity-60 aria-[invalid=true]:border-rose-400';

export const SUBMIT =
  'inline-flex h-12 w-full select-none items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-nova-600 font-semibold text-white shadow-[0_6px_20px_-8px_rgb(90_47_242/0.7)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-nova-700 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50';

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-xs font-semibold text-rose-600 dark:text-rose-300">
      {message}
    </p>
  );
}
