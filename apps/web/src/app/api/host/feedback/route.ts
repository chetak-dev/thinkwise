import { countGameFeedback, getDb } from '@thinkwise/db';
import { getCurrentUser } from '@/lib/session';

/** Host-only: how many participants have sent feedback in this event game so far. */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ count: null }, { status: 401 });
  const game = new URL(request.url).searchParams.get('game') ?? '';
  const count = await countGameFeedback(getDb(), user.id, game);
  return Response.json({ count }, { headers: { 'Cache-Control': 'private, no-store' } });
}
