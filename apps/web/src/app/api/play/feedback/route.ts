import { getDb, submitEventFeedback } from '@thinkwise/db';

const MAX_BODY = 64 * 1024;
const WINDOW_MS = 60_000;
const PER_WINDOW = 200;
// Per server instance and per address: generous because a whole classroom can share one address.
const recent = new Map<string, { count: number; resetAt: number }>();

function limited(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  const now = Date.now();
  if (recent.size > 10_000) for (const [k, v] of recent) if (v.resetAt < now) recent.delete(k);
  const entry = recent.get(ip);
  if (!entry || entry.resetAt < now) {
    recent.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > PER_WINDOW;
}

/** Public: stores a participant's feedback for one stage of an event game. */
export async function POST(request: Request) {
  if (limited(request)) return Response.json({ error: 'rate_limited' }, { status: 429 });
  const text = await request.text();
  if (text.length > MAX_BODY) return Response.json({ error: 'too_large' }, { status: 413 });
  let body: { ref?: unknown; stage?: unknown; clientId?: unknown; nickname?: unknown; answers?: unknown };
  try {
    body = JSON.parse(text) as typeof body;
  } catch {
    return Response.json({ error: 'bad_request' }, { status: 400 });
  }
  if (typeof body !== 'object' || body === null) return Response.json({ error: 'bad_request' }, { status: 400 });
  const result = await submitEventFeedback(getDb(), {
    ref: body.ref,
    stage: body.stage,
    clientId: body.clientId,
    nickname: body.nickname,
    answers: body.answers,
  });
  if (result.ok) return Response.json({ ok: true });
  const status = result.error === 'not_found' ? 404 : result.error === 'invalid' ? 422 : 400;
  return Response.json(result, { status });
}
