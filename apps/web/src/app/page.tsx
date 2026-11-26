import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { HeroPinForm } from '@/components/HeroPinForm';
import { getCurrentUser } from '@/lib/session';

const BTN =
  'inline-flex select-none items-center justify-center whitespace-nowrap font-semibold transition-all duration-200 active:scale-[0.97]';
const BTN_PRIMARY_LG = `${BTN} text-white bg-nova-600 hover:bg-nova-700 h-12 px-6 gap-2 rounded-xl`;
const BTN_SM = `${BTN} bg-nova-600 text-white hover:bg-nova-700 active:bg-nova-800 h-10 px-4 text-sm gap-2 rounded-xl`;

const STEPS = [
  { title: 'Get the PIN or link', body: 'Your teacher or organiser shares it on the screen, in class or in a message.' },
  { title: 'Sign in and pick a nickname', body: 'Choose a name, an avatar and your language. Nothing to install.' },
  { title: 'Answer on your phone', body: 'See your score, your place and the right answers when the quiz ends. Every result is saved to your history.' },
];

export default async function Home() {
  const user = await getCurrentUser();
  return (
    <div className="min-h-dvh overflow-hidden">
      <a
        href="#main"
        className="sr-only-focusable fixed left-3 top-3 z-[100] rounded-lg bg-nova-600 px-4 py-2 font-semibold text-white"
      >
        Skip to content
      </a>
      <div className="decorative arena-grid pointer-events-none absolute inset-x-0 top-0 -z-10 h-[40rem]" aria-hidden="true" />

      <header className="glass-panel mx-3 mt-3 flex items-center justify-between gap-2 rounded-2xl px-2.5 py-3 min-[360px]:px-3 sm:px-6 xl:mx-auto xl:max-w-7xl">
        <Logo className="shrink-0 max-[359px]:text-base min-[360px]:max-sm:text-lg" />
        <nav aria-label="Account" className="flex min-w-0 items-center gap-1 sm:gap-2">
          {user ? (
            <Link href="/dashboard" className="whitespace-nowrap rounded-xl px-2 py-2 text-sm font-semibold text-app hover:bg-surface-2 min-[360px]:px-2.5 sm:px-3">
              Dashboard
            </Link>
          ) : (
            <Link href="/login" className="whitespace-nowrap rounded-xl px-2 py-2 text-sm font-semibold text-app hover:bg-surface-2 min-[360px]:px-2.5 sm:px-3">
              Sign in
            </Link>
          )}
          <Link href="/play" className={`${BTN_SM} max-sm:px-3`}>
            Join a quiz
          </Link>
        </nav>
      </header>

      <main id="main">
        <section className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-4 pb-16 pt-12 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:pb-24 lg:pt-20">
          <div className="min-w-0 animate-rise">
            <p className="mb-3 text-sm font-semibold text-nova-700 dark:text-nova-300">
              Live and self-paced quizzes for classrooms, campuses and events
            </p>
            <h1 className="font-display text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl">
              Got a PIN? Jump straight in.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted">
              Enter the PIN or open the link your organiser shared, sign in and answer on your phone.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3">
              <Link href="/play" className={BTN_PRIMARY_LG}>
                Join a quiz
              </Link>
              <a href="#organisers" className="inline-flex items-center gap-1.5 font-semibold text-nova-700 hover:underline dark:text-nova-300">
                I’m an organiser
                <ArrowRight className="size-4" aria-hidden="true" />
              </a>
            </div>
          </div>

          <div className="rounded-3xl border border-app bg-surface p-6 shadow-soft">
            <HeroPinForm />
            <p className="mt-4 text-center text-xs text-muted">Live games use a 6-digit PIN, self-paced quizzes a 7-digit PIN.</p>
          </div>
        </section>

        <section aria-labelledby="how-heading" className="border-y border-app bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
            <h2 id="how-heading" className="mb-8 font-display text-2xl font-bold sm:text-3xl">
              How it works
            </h2>
            <ol className="grid gap-8 md:grid-cols-3">
              {STEPS.map((step, i) => (
                <li key={step.title} className="flex gap-4">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-app font-display font-bold text-muted">
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="font-display text-lg font-bold">{step.title}</h3>
                    <p className="mt-1 text-sm text-muted">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="organisers" aria-labelledby="organisers-heading" className="mx-auto max-w-6xl scroll-mt-6 px-4 py-12 sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-muted">
              <span id="organisers-heading" className="font-semibold text-app">
                Running a quiz?
              </span>{' '}
              Hosting is open to approved organisers. If you need host access, ask your site admin.
            </p>
            <Link
              href={user ? '/dashboard' : '/login'}
              className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-app bg-surface px-4 text-sm font-semibold hover:bg-surface-2"
            >
              {user ? 'Open dashboard' : 'Organiser sign in'}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-app py-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 text-sm text-muted sm:px-6">
          <Logo className="text-xl text-app" />
          <nav aria-label="Footer" className="flex gap-4">
            <Link href="/play" className="hover:text-app">
              Join a quiz
            </Link>
            <Link href={user ? '/dashboard' : '/login'} className="hover:text-app">
              Organiser sign in
            </Link>
            <Link href="/privacy" className="hover:text-app">
              Privacy
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
