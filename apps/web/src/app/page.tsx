import Link from 'next/link';
import {
  BarChart3,
  Globe2,
  Heart,
  Layers,
  Leaf,
  Lock,
  QrCode,
  Sparkles,
  Star,
  Timer,
  Users,
  Zap,
} from 'lucide-react';
import { Logo } from '@/components/Logo';
import { HeroPinForm } from '@/components/HeroPinForm';
import { getCurrentUser } from '@/lib/session';

const BTN =
  'inline-flex select-none items-center justify-center whitespace-nowrap font-semibold transition-all duration-200 active:scale-[0.97] hover:-translate-y-0.5';
const BTN_PRIMARY_LG = `${BTN} text-white bg-[linear-gradient(100deg,#6d4aff,#ff5d73)] hover:brightness-110 shadow-[0_10px_30px_-10px_rgb(255_93_115/0.7)] h-14 px-8 text-lg gap-2.5 rounded-2xl`;
const BTN_OUTLINE_LG = `${BTN} border border-app bg-surface text-app hover:border-nova-400 hover:text-nova-700 dark:hover:text-nova-300 h-14 px-8 text-lg gap-2.5 rounded-2xl`;
const BTN_SM = `${BTN} bg-nova-600 text-white hover:bg-nova-700 active:bg-nova-800 shadow-[0_6px_20px_-8px_rgb(90_47_242/0.7)] h-10 px-4 text-sm gap-2 rounded-xl`;

const DEMO_ANSWERS = [
  { label: 'Pacific', color: 'bg-answer-1', Icon: Star },
  { label: 'Atlantic', color: 'bg-answer-2', Icon: Heart },
  { label: 'Indian', color: 'bg-answer-3', Icon: Leaf },
  { label: 'Arctic', color: 'bg-answer-4', Icon: Zap },
];

const FEATURES = [
  {
    Icon: Users,
    title: 'Hundreds in one room',
    body: 'Run a single class or a packed auditorium. The game server is built to keep every phone in sync.',
  },
  {
    Icon: QrCode,
    title: 'PIN, QR or link',
    body: 'Players scan or type six digits and pick a nickname. Nothing to install, nothing to sign up for.',
  },
  {
    Icon: Timer,
    title: 'Fair timing',
    body: 'The clock and the scoring run on the server, so a slow phone never costs anyone points.',
  },
  {
    Icon: Layers,
    title: 'Ten ways to ask',
    body: 'Single or multiple answers, true/false, typed and numeric answers, ordering, polls, word clouds and ratings.',
  },
  {
    Icon: BarChart3,
    title: 'Results you can use',
    body: 'See which questions tripped people up and how each player did, then export the numbers.',
  },
  {
    Icon: Lock,
    title: 'Nicknames only',
    body: 'Players never share personal details, and correct answers stay on the server until the reveal.',
  },
  {
    Icon: Globe2,
    title: 'English, हिन्दी, मराठी',
    body: 'Players choose their language on the join screen. More languages can be added later.',
  },
  {
    Icon: Sparkles,
    title: 'Loud or low-key',
    body: 'Go all-in with streaks and a podium, or switch to a calm, accuracy-only session for revision.',
  },
];

const STEPS = [
  { title: 'Build', body: 'Write your questions, set a timer and points for each, and preview them on a phone.' },
  { title: 'Run', body: 'Put the PIN on the big screen, wait for names to roll in, then move through the questions at your pace.' },
  { title: 'Review', body: 'Look back at every answer, spot the tricky topics and share the results with your group.' },
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
      <div className="decorative arena-grid pointer-events-none absolute inset-x-0 top-0 -z-10 h-[58rem]" aria-hidden="true" />

      <header className="glass-panel mx-3 mt-3 flex items-center justify-between gap-2 rounded-2xl px-2.5 py-3 min-[360px]:px-3 sm:px-6 xl:mx-auto xl:max-w-7xl">
        <Logo className="shrink-0 max-[359px]:text-base min-[360px]:max-sm:text-lg" />
        <nav aria-label="Account" className="flex min-w-0 items-center gap-1 sm:gap-2">
          <Link href="/play" className="hidden rounded-xl px-3 py-2 text-sm font-semibold text-muted hover:bg-surface-2 sm:inline-flex">
            Join a game
          </Link>
          {user ? (
            <Link href="/dashboard" className={BTN_SM}>
              Open dashboard
            </Link>
          ) : (
            <>
              <Link href="/login" className="whitespace-nowrap rounded-xl px-2 py-2 text-sm font-semibold text-app hover:bg-surface-2 min-[360px]:px-2.5 sm:px-3">
                Sign in
              </Link>
              <Link href="/register" className={`${BTN_SM} max-sm:px-3`}>
                <span className="sm:hidden">Sign up</span>
                <span className="hidden sm:inline">Create free account</span>
              </Link>
            </>
          )}
        </nav>
      </header>

      <main id="main">
        <section className="relative mx-auto grid min-h-[46rem] max-w-7xl grid-cols-1 items-center gap-12 px-4 pb-24 pt-12 sm:px-6 lg:grid-cols-[1.08fr_0.92fr] lg:pt-20">
          <div className="min-w-0 animate-rise">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-nova-100 px-3 py-1 text-sm font-semibold text-nova-800 dark:bg-nova-900/60 dark:text-nova-200">
              <Sparkles className="size-4" aria-hidden="true" />
              Live quiz games for classrooms, campuses and events
            </p>
            <h1 className="font-display text-5xl font-bold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
              Make every answer a moment <span className="nova-text">the whole room feels.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg text-muted">
              Put a question on the big screen and watch the room react. Players answer on their own phones, the
              leaderboard shifts after every round, and nobody needs an account to play.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={user ? '/dashboard' : '/register'} className={BTN_PRIMARY_LG}>
                Host a free game
              </Link>
              <Link href="/play" className={BTN_OUTLINE_LG}>
                I have a PIN
              </Link>
            </div>
          </div>

          <div className="relative">
            <div className="decorative nova-gradient absolute -inset-8 -z-10 rounded-[3rem] opacity-25 blur-3xl" aria-hidden="true" />
            <div className="arena-sheen glass-panel relative rounded-[2rem] p-6">
              <HeroPinForm />
              <div className="mt-6 grid grid-cols-2 gap-3" aria-hidden="true">
                {DEMO_ANSWERS.map(({ label, color, Icon }) => (
                  <div
                    key={label}
                    className={`${color} flex animate-rise items-center gap-2 rounded-2xl px-4 py-4 font-bold text-white shadow-[0_5px_0_0_rgb(0_0_0/0.18)]`}
                  >
                    <Icon className="size-5" />
                    {label}
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-ink-950 px-4 py-3 text-white">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[.16em] text-white/50">Sample question</p>
                  <p className="font-display font-bold">Which ocean is the largest?</p>
                </div>
                <span className="flex items-center gap-1.5 rounded-full bg-emerald-400/15 px-2.5 py-1 text-xs font-bold text-emerald-300">
                  <span className="size-2 animate-pulse rounded-full bg-emerald-400" />
                  Live
                </span>
              </div>
              <div className="mt-3 rounded-xl border border-dashed border-app px-3 py-2 text-center text-xs font-semibold text-muted">
                In a real game, player names pop up here the moment they answer
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="features-heading" className="border-y border-app bg-surface py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <h2 id="features-heading" className="max-w-2xl font-display text-3xl font-bold sm:text-4xl">
              Made for busy classrooms and big halls alike.
            </h2>
            <p className="mt-3 max-w-2xl text-muted">
              Everything a host needs to run a lively quiz, and nothing that gets in the players’ way.
            </p>
            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map(({ Icon, title, body }) => (
                <div key={title} className="rounded-2xl border border-app bg-app p-5">
                  <Icon className="size-6 text-nova-600 dark:text-nova-300" aria-hidden="true" />
                  <h3 className="mt-3 font-display text-lg font-bold">{title}</h3>
                  <p className="mt-1 text-sm text-muted">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section aria-label="How it works" className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
          <div className="grid gap-8 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <div key={step.title}>
                <span className="flex size-12 items-center justify-center rounded-2xl bg-ink-900 font-display text-xl font-bold text-white dark:bg-white dark:text-ink-900">
                  {i + 1}
                </span>
                <h3 className="mt-4 font-display text-2xl font-bold">{step.title}</h3>
                <p className="mt-2 text-muted">{step.body}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-app py-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 text-sm text-muted sm:px-6">
          <Logo className="text-xl text-app" />
          <nav aria-label="Footer" className="flex gap-4">
            <Link href="/play" className="hover:text-app">
              Join a game
            </Link>
            <Link href="/host" className="hover:text-app">
              Host a game
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
