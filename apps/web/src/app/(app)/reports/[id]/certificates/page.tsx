import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { scoredQuestionCount } from '@thinkwise/shared';
import { getDb, getSessionReport, type SessionPlayer } from '@thinkwise/db';
import { requireUser } from '@/lib/session';
import { getTimeZone } from '@/lib/timeZone';
import { formatDate } from '@/lib/time';
import { PrintButton } from '@/components/PrintButton';

export const metadata: Metadata = { title: 'Certificates · ThinkWise' };

const FILTERS = [
  { key: '3', label: 'Top 3' },
  { key: '10', label: 'Top 10' },
  { key: 'all', label: 'Everyone' },
] as const;
type Filter = (typeof FILTERS)[number]['key'];

const ACCENT = '#6d4aff';
const INK = '#1b1440';
const SOFT = '#4b4570';

function placing(rank: number): { medal: string; title: string } {
  if (rank === 1) return { medal: '🥇', title: 'Winner' };
  if (rank === 2) return { medal: '🥈', title: 'Second place' };
  if (rank === 3) return { medal: '🥉', title: 'Third place' };
  return { medal: '🎓', title: `Rank ${rank}` };
}

function Certificate({
  player,
  quiz,
  asked,
  date,
  timeZone,
  pin,
  host,
}: {
  player: SessionPlayer;
  quiz: string;
  asked: number;
  date: Date;
  timeZone: string;
  pin: string;
  host: string;
}) {
  const { medal, title } = placing(player.rank);
  return (
    <section
      className="cert @container relative flex aspect-[297/210] w-full flex-col items-center justify-center overflow-hidden rounded-3xl bg-white p-[6%] text-center shadow-lift"
      style={{ color: INK }}
      aria-label={`Certificate for ${player.nickname}`}
    >
      <div className="absolute inset-[3%] rounded-2xl border-[3px]" style={{ borderColor: ACCENT }} />
      <div className="absolute inset-[4.2%] rounded-xl border border-dashed" style={{ borderColor: `${ACCENT}80` }} />
      <div className="absolute -top-[12%] -left-[8%] aspect-square w-[28%] rounded-full opacity-15" style={{ background: ACCENT }} />
      <div className="absolute -right-[7%] -bottom-[16%] aspect-square w-[30%] rounded-full opacity-10" style={{ background: '#14c9b8' }} />

      <p className="relative text-[1.6cqw] font-bold tracking-[.4em] uppercase" style={{ color: ACCENT }}>
        ThinkWise
      </p>
      <h2 className="relative mt-[1.5%] font-display text-[5cqw] leading-tight font-bold">Certificate of Achievement</h2>
      <p className="relative mt-[2%] text-[1.9cqw]" style={{ color: SOFT }}>
        Awarded with pride to
      </p>
      <p className="relative mt-[1.5%] font-display text-[6cqw] leading-tight font-bold break-words" style={{ color: ACCENT }}>
        {player.nickname}
      </p>
      <p className="relative mt-[1.5%] max-w-[75%] text-[1.9cqw]" style={{ color: SOFT }}>
        for finishing <strong style={{ color: INK }}>{medal} {title}</strong> in <strong style={{ color: INK }}>{quiz}</strong>, scoring{' '}
        <strong style={{ color: INK }}>{player.score} points</strong> with {player.correctCount} of {asked} answers right.
      </p>
      <div className="relative mt-[5%] flex w-[70%] items-end justify-between text-[1.4cqw]" style={{ color: SOFT }}>
        <div className="text-left">
          <p className="font-semibold" style={{ color: INK }}>
            <time dateTime={date.toISOString()}>
              {formatDate(date, timeZone)}
            </time>
          </p>
          <p className="mt-1 border-t pt-1" style={{ borderColor: `${INK}4d` }}>
            Date
          </p>
        </div>
        <div className="text-[4.5cqw]" aria-hidden="true">
          {medal}
        </div>
        <div className="text-right">
          <p className="font-semibold" style={{ color: INK }}>
            {host}
          </p>
          <p className="mt-1 border-t pt-1" style={{ borderColor: `${INK}4d` }}>
            Quiz host · PIN {pin}
          </p>
        </div>
      </div>
    </section>
  );
}

export default async function CertificatesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ top?: string | string[] }>;
}) {
  const { id } = await params;
  const user = await requireUser(`/reports/${id}/certificates`);
  const report = await getSessionReport(getDb(), user.id, id);
  if (!report) notFound();

  const raw = (await searchParams).top;
  const filter: Filter = FILTERS.some((f) => f.key === raw) ? (raw as Filter) : 'all';
  const players =
    report.status === 'live' ? [] : filter === 'all' ? report.players : report.players.filter((p) => p.rank <= Number(filter));
  const date = report.endedAt ?? report.createdAt;
  const timeZone = await getTimeZone();

  return (
    <div className="space-y-6">
      <style>{`@media print { @page { size: A4 landscape; margin: 0; } .cert { break-after: page; height: 100vh; width: 100%; aspect-ratio: auto; border-radius: 0 !important; box-shadow: none !important; } }`}</style>
      <div className="flex flex-wrap items-end justify-between gap-4 print:hidden">
        <div>
          <Link
            href={`/reports/${report.id}`}
            className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-app"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Report
          </Link>
          <h1 className="font-display text-3xl font-bold">Certificates</h1>
          <p className="text-muted">
            {players.length} {players.length === 1 ? 'certificate' : 'certificates'} · one per A4 landscape page when printed or
            saved as PDF.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <nav aria-label="Who gets a certificate" className="flex rounded-xl border border-app bg-surface p-1">
            {FILTERS.map((f) => (
              <Link
                key={f.key}
                href={`?top=${f.key}`}
                aria-current={f.key === filter ? 'page' : undefined}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                  f.key === filter ? 'bg-nova-500 text-white' : 'text-muted hover:text-app'
                }`}
              >
                {f.label}
              </Link>
            ))}
          </nav>
          <PrintButton
            label="Print / Save PDF"
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-nova-500 px-4 text-sm font-semibold text-white hover:bg-nova-600 disabled:opacity-50"
          />
        </div>
      </div>

      {players.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-app bg-surface p-6 text-center text-muted">
          {report.status === 'live'
            ? 'Certificates become available once the game has finished.'
            : 'Nobody played this game, so there are no certificates to print.'}
        </p>
      ) : (
        <div className="space-y-6 print:space-y-0">
          {players.map((p) => (
            <Certificate
              key={`${p.rank}-${p.nickname}`}
              player={p}
              quiz={report.title}
              asked={scoredQuestionCount(report.questions, report.questionsAsked)}
              date={date}
              timeZone={timeZone}
              pin={report.pin}
              host={user.name}
            />
          ))}
        </div>
      )}
    </div>
  );
}
