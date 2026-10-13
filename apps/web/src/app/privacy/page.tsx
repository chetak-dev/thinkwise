import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/Logo';

export const metadata: Metadata = { title: 'Privacy · ThinkWise' };

const SECTIONS: { title: string; body: React.ReactNode }[] = [
  {
    title: 'Players (no account)',
    body: (
      <>
        <p>
          Joining a game needs only a PIN. We keep the nickname and avatar you choose and the answers you give, with how long
          each took, so the game can be scored and the host can see the results. We never ask players for an email address,
          phone number or real name.
        </p>
        <p>
          Your browser remembers a random token for the game you joined, so a dropped connection can rejoin with the same score,
          and your display settings (language, sound, text size). These stay on your device.
        </p>
      </>
    ),
  },
  {
    title: 'Hosts (account holders)',
    body: (
      <>
        <p>
          For an account we keep your name, email address and, if you choose one, your organisation. Passwords are stored only
          as a one-way hash; if you sign in with Google we keep Google’s account id instead and never see your Google password.
        </p>
        <p>
          We also keep the quizzes you write, the results of games you host, and a record of sign-ins for security. A small
          cookie keeps you signed in, and another remembers your time zone so dates show in your local time.
        </p>
      </>
    ),
  },
  {
    title: 'Children and schools',
    body: (
      <p>
        ThinkWise is built so pupils can take part without sharing personal details. Hosts should ask players to use first
        names or made-up nicknames, and schools should follow their own rules for collecting pupils’ data.
      </p>
    ),
  },
  {
    title: 'How long we keep things',
    body: (
      <p>
        Live games run in memory and disappear when they end; their results are then saved for the host. Hosts can delete
        their quizzes at any time. To remove an account or past results, contact the organisation that runs this ThinkWise
        site.
      </p>
    ),
  },
  {
    title: 'Security',
    body: (
      <p>
        All traffic is encrypted. Correct answers stay on the server until each question is revealed, scores are worked out
        on the server, and sign-in attempts are rate-limited. We don’t sell data or show adverts.
      </p>
    ),
  },
  {
    title: 'Who is responsible',
    body: (
      <p>
        The organisation running this site decides how ThinkWise is used and is responsible for its users’ data. It should
        adapt this notice to the laws that apply to it, such as India’s Digital Personal Data Protection Act 2023 or the GDPR.
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <div className="min-h-dvh">
      <a
        href="#main"
        className="sr-only-focusable fixed left-3 top-3 z-[100] rounded-lg bg-nova-600 px-4 py-2 font-semibold text-white"
      >
        Skip to content
      </a>
      <header className="mx-auto flex max-w-3xl items-center justify-between px-4 py-6">
        <Link href="/" aria-label="ThinkWise home">
          <Logo />
        </Link>
        <Link href="/play" className="rounded-xl px-3 py-2 text-sm font-semibold text-muted hover:bg-surface-2">
          Join a game
        </Link>
      </header>
      <main id="main" className="mx-auto max-w-3xl px-4 pb-16">
        <h1 className="font-display text-4xl font-bold">Privacy notice</h1>
        <p className="mt-3 text-lg text-muted">What ThinkWise stores, why, and for how long.</p>
        <div className="mt-8 space-y-8">
          {SECTIONS.map((s) => (
            <section key={s.title} className="space-y-3 rounded-3xl border border-app bg-surface p-6 shadow-soft">
              <h2 className="font-display text-xl font-bold">{s.title}</h2>
              <div className="space-y-3 leading-relaxed text-muted">{s.body}</div>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
