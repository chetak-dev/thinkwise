import 'server-only';

import { timingSafeEqual } from 'node:crypto';
import type { GameMode, PlayableQuiz } from '@thinkwise/shared';

const IS_PROD = process.env.NODE_ENV === 'production';
const REALTIME_HTTP_URL = process.env.REALTIME_HTTP_URL ?? 'http://127.0.0.1:4000';
const REALTIME_SECRET = process.env.REALTIME_SECRET ?? (IS_PROD ? '' : 'dev-only-realtime-secret');

export interface LiveGame {
  gameId: string;
  pin: string;
  hostToken: string;
}

export interface StartOptions {
  autoAdvance: boolean;
  mode: GameMode;
  /** Close the lobby when the quiz starts (events without late entry). */
  lockOnStart?: boolean;
}

/** True only for requests from our game server (constant-time comparison). */
export function isGameServer(authorization: string | null) {
  if (!REALTIME_SECRET || !authorization?.startsWith('Bearer ')) return false;
  const a = Buffer.from(authorization.slice(7));
  const b = Buffer.from(REALTIME_SECRET);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Hands a validated quiz (with answers) to the game server; the browser only ever gets the host token. */
export async function createLiveGame(quiz: PlayableQuiz, settings?: StartOptions): Promise<LiveGame> {
  if (!REALTIME_SECRET) throw new Error('REALTIME_SECRET is not configured');
  const res = await fetch(`${REALTIME_HTTP_URL}/games`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${REALTIME_SECRET}` },
    body: JSON.stringify({ quiz, settings }),
    cache: 'no-store',
    // Long enough for a free-tier game server to wake from sleep.
    signal: AbortSignal.timeout(60_000),
  });
  if (res.status !== 201) throw new Error(`Game server returned ${res.status}`);
  return (await res.json()) as LiveGame;
}

export type LivePhase = 'lobby' | 'question' | 'reveal' | 'leaderboard' | 'finished';

/** Which of these games the game server still holds. Empty when it can't answer quickly: a sleeping server runs no games. */
export async function liveGameStatus(ids: string[]): Promise<Record<string, { phase: LivePhase; players: number }>> {
  if (!REALTIME_SECRET || ids.length === 0) return {};
  try {
    const res = await fetch(`${REALTIME_HTTP_URL}/games/status?ids=${ids.map(encodeURIComponent).join(',')}`, {
      headers: { authorization: `Bearer ${REALTIME_SECRET}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(3_000),
    });
    if (!res.ok) return {};
    return ((await res.json()) as { games: Record<string, { phase: LivePhase; players: number }> }).games;
  } catch {
    return {};
  }
}
