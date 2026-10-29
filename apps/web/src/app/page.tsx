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
    Icon: QrCode,
    title: 'PIN, QR or link',
    body: 'Type the PIN, scan the code or tap the link you were sent, then pick a nickname. Nothing to install.',
  },
  {
    Icon: Users,
    title: 'No account needed',
    body: 'Players never sign up. Just join, answer and see how you did.',
  },
  {
    Icon: Zap,
    title: 'Live with the room',
    body: 'In a live game everyone answers together, and the leaderboard shifts after every question.',
  },
  {
    Icon: Timer,
    title: 'Or in your own time',
    body: 'Self-paced quizzes stay open for a while. Start when it suits you, move between questions and review before you submit.',
  },
  {
    Icon: Layers,
    title: 'Ten ways to answer',
    body: 'Pick one or several, true/false, type a word or number, put things in order, vote in polls and more.',
  },
  {
    Icon: Lock,
    title: 'Nicknames only',
    body: 'You never share personal details, and correct answers stay hidden until it’s time to reveal them.',
  },
  {
    Icon: Globe2,
    title: 'English, हिन्दी, ଓଡ଼ିଆ',
    body: 'Choose your language on the join screen.',
  },
  {
    Icon: BarChart3,
    title: 'See how you did',
    body: 'Your score, your place and the right answers, once the quiz is over.',
  },
];

const STEPS = [
  { title: 'Get the PIN or link', body: 'Your teacher or organiser shares it on the screen, in class or in a message.' },
  { title: 'Pick a nickname', body: 'Enter the PIN (or open the link), choose a name and an avatar, and you’re in.' },
  { title: 'Answer and climb', body: 'Answer on your own phone, then see your score, your place and the right answers.' },
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
        <section className="relative mx-auto grid min-h-[46rem] max-w-7xl grid-cols-1 items-center gap-12 px-4 pb-24 pt-12 sm:px-6 lg:grid-cols-[1.08fr_0.92fr] lg:pt-20">
          <div className="min-w-0 animate-rise">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-nova-100 px-3 py-1 text-sm font-semibold text-nova-800 dark:bg-nova-900/60 dark:text-nova-200">
              <Sparkles className="size-4" aria-hidden="true" />
              Live and self-paced quizzes for classrooms, campuses and events
            </p>
            <h1 className="font-display text-5xl font-bold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
              Got a PIN? <span className="nova-text">Jump straight in.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg text-muted">
              Enter the PIN or open the link your organiser shared, pick a nickname and start answering on your phone. No
              account, no app, no sign-up.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/play" className={BTN_PRIMARY_LG}>
                Join a quiz
              </Link>
              <a href="#organisers" className={BTN_OUTLINE_LG}>
                I’m an organiser
              </a>
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
              Simple to join, fun to play.
            </h2>
            <p className="mt-3 max-w-2xl text-muted">
              Whether it’s a packed hall answering together or a quiz you take in your own time, joining takes seconds.
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

        <section aria-labelledby="how-heading" className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
          <h2 id="how-heading" className="mb-10 font-display text-3xl font-bold sm:text-4xl">
            How to play
          </h2>
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

        <section id="organisers" aria-labelledby="organisers-heading" className="mx-auto max-w-7xl scroll-mt-6 px-4 pb-20 sm:px-6">
          <div className="glass-panel flex flex-col gap-6 rounded-3xl p-6 sm:p-8 md:flex-row md:items-center md:justify-between">
            <div className="max-w-2xl">
              <p className="inline-flex items-center gap-2 text-sm font-semibold text-nova-700 dark:text-nova-300">
                <Sparkles className="size-4" aria-hidden="true" />
                For organisers
              </p>
              <h2 id="organisers-heading" className="mt-2 font-display text-2xl font-bold sm:text-3xl">
                Running a quiz?
              </h2>
              <p className="mt-2 text-muted">
                Hosting live and self-paced quizzes is open to approved organisers. Sign in to your account; if you need host
                access, ask your site admin to turn it on for you.
              </p>
            </div>
            <Link href={user ? '/dashboard' : '/login'} className={`${BTN_OUTLINE_LG} shrink-0`}>
              {user ? 'Open dashboard' : 'Organiser sign in'}
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
