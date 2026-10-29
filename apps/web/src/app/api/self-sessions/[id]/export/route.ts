import { isScored, toCsv, type QuestionType } from '@thinkwise/shared';
import { getDb, selfExport } from '@thinkwise/db';
import { getCurrentUser } from '@/lib/session';
import { getTimeZone } from '@/lib/timeZone';
import { formatDateTime, isoDay } from '@/lib/time';

function duration(ms: number) {
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${h}:${pad(m)}:${pad(s % 60)}`;
}

/** Host-only spreadsheet of a self-paced quiz: every participant, their answers and time taken. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response('Sign in to download results.', { status: 401 });
  const { id } = await params;
  const data = await selfExport(getDb(), user.id, id);
  if (!data) return new Response('Quiz not found.', { status: 404 });
  const tz = await getTimeZone();

  const header = [
    'Rank', 'Name', 'Started', 'Submitted', 'Time taken (h:mm:ss)', 'Score', 'Correct', 'Answered', 'Left the page (times)',
    ...data.questions.flatMap((q, i) => [`Q${i + 1}: ${q.text}`, `Q${i + 1} result`]),
  ];
  const rows = data.rows.map((r) => [
    r.rank,
    r.nickname,
    formatDateTime(new Date(r.startedAt), tz),
    r.submittedAt ? formatDateTime(new Date(r.submittedAt), tz) : 'Not yet',
    duration(r.timeTakenMs),
    r.score,
    r.correctCount,
    r.answered,
    r.tabSwitches,
    ...r.answers.flatMap((a, i) => {
      if (!a) return ['', 'No answer'];
      const type = data.questions[i]?.type as QuestionType | undefined;
      const unscored = !type || !isScored(type);
      return [a.answer, unscored ? 'Not scored' : a.isCorrect ? `Correct (+${a.points})` : 'Wrong'];
    }),
  ]);
  const csv = toCsv([header, ...rows]);
  const slug = data.title.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'quiz';
  return new Response(`\uFEFF${csv}\r\n`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="thinkwise-${slug}-${isoDay(new Date(), tz)}.csv"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
