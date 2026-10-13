import { GameResults } from '@thinkwise/shared';
import { getDb, recordResults } from '@thinkwise/db';
import { isGameServer } from '@/lib/realtime';

const MAX_BODY_BYTES = 4 * 1024 * 1024;

/** Receives final results from the game server. Not for browsers: requires the shared secret. */
export async function POST(request: Request) {
  if (!isGameServer(request.headers.get('authorization'))) return new Response(null, { status: 401 });
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) return new Response(null, { status: 413 });
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return new Response(null, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response(null, { status: 400 });
  }
  const parsed = GameResults.safeParse(body);
  if (!parsed.success) return new Response(null, { status: 422 });
  const stored = await recordResults(getDb(), parsed.data);
  // 404 (unknown or already recorded) tells the game server not to retry.
  return new Response(null, { status: stored ? 204 : 404 });
}
