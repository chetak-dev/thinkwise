import {
  getDb,
  joinSelf,
  openSelfQuestion,
  recordSelfAway,
  saveSelfAnswer,
  selfInfo,
  selfPlayerState,
  submitSelf,
} from '@thinkwise/db';

const MAX_BODY = 16 * 1024;
const WINDOW_MS = 60_000;
// Per server instance and per address: generous because a whole classroom can share one address.
const PER_WINDOW = 1200;
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

const NO_STORE = { 'cache-control': 'no-store' };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: NO_STORE });

/** Public: what a self-paced PIN leads to (title, window, time limit). */
export async function GET(request: Request) {
  if (limited(request)) return json({ error: 'rate_limited' }, 429);
  const pin = new URL(request.url).searchParams.get('pin') ?? '';
  const info = await selfInfo(getDb(), pin);
  return info ? json({ info }) : json({ error: 'not_found' }, 404);
}

type Body = { action?: unknown; pin?: unknown; nickname?: unknown; avatar?: unknown; token?: unknown; index?: unknown; answer?: unknown };

/** Public: a participant's actions in a self-paced session. The token in the body identifies their attempt. */
export async function POST(request: Request) {
  if (limited(request)) return json({ error: 'rate_limited' }, 429);
  const text = await request.text();
  if (text.length > MAX_BODY) return json({ error: 'too_large' }, 413);
  let body: Body;
  try {
    body = JSON.parse(text) as Body;
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  if (typeof body !== 'object' || body === null) return json({ error: 'bad_request' }, 400);
  const db = getDb();
  const token = typeof body.token === 'string' ? body.token : '';
  const index = typeof body.index === 'number' ? body.index : -1;

  switch (body.action) {
    case 'join': {
      if (typeof body.pin !== 'string' || typeof body.nickname !== 'string' || typeof body.avatar !== 'string') {
        return json({ error: 'bad_request' }, 400);
      }
      const result = await joinSelf(db, body.pin, body.nickname, body.avatar);
      return result.ok ? json({ token: result.token }) : json({ error: result.reason }, result.reason === 'not_found' ? 404 : 409);
    }
    case 'state': {
      const state = await selfPlayerState(db, token);
      return state ? json({ state }) : json({ error: 'not_found' }, 404);
    }
    case 'open':
    case 'save':
    case 'away':
    case 'submit': {
      const result =
        body.action === 'open'
          ? await openSelfQuestion(db, token, index)
          : body.action === 'save'
            ? await saveSelfAnswer(db, token, index, body.answer ?? null)
            : body.action === 'away'
              ? await recordSelfAway(db, token)
              : await submitSelf(db, token);
      if (result.ok) return json(result);
      return json({ error: result.reason }, result.reason === 'not_found' ? 404 : result.reason === 'locked' ? 409 : 422);
    }
    default:
      return json({ error: 'bad_request' }, 400);
  }
}
