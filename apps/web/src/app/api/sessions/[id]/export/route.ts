import { reportToCsv } from '@thinkwise/shared';
import { getDb, getSessionReport } from '@thinkwise/db';
import { getCurrentUser } from '@/lib/session';
import { getTimeZone } from '@/lib/timeZone';
import { isoDay } from '@/lib/time';

/** Host-only spreadsheet of a finished game. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response('Sign in to download reports.', { status: 401 });
  const { id } = await params;
  const report = await getSessionReport(getDb(), user.id, id);
  if (!report) return new Response('Report not found.', { status: 404 });
  if (report.status === 'live') return new Response('This game is still running.', { status: 409 });

  const csv = reportToCsv(report.questions, report.players, report.questionsAsked);
  const day = isoDay(report.createdAt, await getTimeZone());
  const slug = report.title.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'game';
  return new Response(`\uFEFF${csv}\r\n`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="thinkwise-${slug}-${day}.csv"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
