import { eventFeedbackCsv } from '@thinkwise/shared';
import { getDb, getEventFeedbackExport } from '@thinkwise/db';
import { getCurrentUser } from '@/lib/session';
import { getTimeZone } from '@/lib/timeZone';
import { formatDateTime, isoDay } from '@/lib/time';

/** Host-only spreadsheet of an event's feedback beside each participant's quiz result. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response('Sign in to download feedback.', { status: 401 });
  const { id } = await params;
  const data = await getEventFeedbackExport(getDb(), user.id, id);
  if (!data) return new Response('Event not found.', { status: 404 });

  const timeZone = await getTimeZone();
  const csv = eventFeedbackCsv({
    identity: data.identity,
    beforeFields: data.beforeFields,
    afterFields: data.afterFields,
    sessions: data.sessions.map((s) => ({ id: s.id, label: `PIN ${s.pin} \u00b7 ${formatDateTime(s.createdAt, timeZone)}` })),
    players: data.players,
    submissions: data.submissions.map((s) => ({ ...s, submittedAt: formatDateTime(s.createdAt, timeZone) })),
  });
  const slug = data.title.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'event';
  return new Response(`\uFEFF${csv}\r\n`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="thinkwise-${slug}-feedback-${isoDay(new Date(), timeZone)}.csv"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
