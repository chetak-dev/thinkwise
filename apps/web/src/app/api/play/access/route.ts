import { getDb, liveAttemptForUser, ParticipantProfile, participantSessionByPin, startLiveAttempt } from '@thinkwise/db';
import { getParticipant } from '@/lib/session';
import { liveParticipantInfo, signParticipantTicket } from '@/lib/realtime';

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });

async function lookup(pin: string, userId: string) {
  const session = await participantSessionByPin(getDb(), pin, 'live');
  if (!session) return null;
  const info = await liveParticipantInfo(pin);
  if (!info || info.gameId !== session.id) return null;
  const attempt = await liveAttemptForUser(getDb(), session.id, userId);
  return { session, info, attempt };
}

/** Signed-in participants only: the game's languages and, if they already started it, their attempt. */
export async function GET(request: Request) {
  const who = await getParticipant();
  if (!who.ok) return json({ error: who.error }, who.status);
  const user = who.user;
  const pin = new URL(request.url).searchParams.get('pin') ?? '';
  try {
    const found = await lookup(pin, user.id);
    if (!found) return json({ error: 'This game is no longer available. View My quiz history for your results.' }, 404);
    return json({ languages: found.info.languages, phase: found.info.phase, locked: found.info.locked, attempt: found.attempt ? {
      language: found.attempt.language, nickname: found.attempt.nickname, avatar: found.attempt.avatar,
    } : null });
  } catch (error) {
    console.error('Could not look up participant access', error);
    return json({ error: 'The game server could not be reached. Please try again.' }, 503);
  }
}

/** Starts (or resumes) the account's single attempt and returns a short-lived ticket for the game server. */
export async function POST(request: Request) {
  const who = await getParticipant();
  if (!who.ok) return json({ error: who.error }, who.status);
  const user = who.user;
  if (Number(request.headers.get('content-length') ?? 0) > 4096) return json({ error: 'Request is too large.' }, 413);
  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: 'Invalid request.' }, 400); }
  if (!body || typeof body !== 'object' || !('pin' in body) || typeof body.pin !== 'string') return json({ error: 'Invalid PIN.' }, 400);
  const profile = ParticipantProfile.safeParse(body);
  try {
    const found = await lookup(body.pin, user.id);
    if (!found) return json({ error: 'This game has ended. View My quiz history.' }, 404);
    let attempt = found.attempt;
    if (!attempt) {
      if (!profile.success) return json({ error: 'Enter a nickname and choose a language.' }, 422);
      if (found.info.phase === 'finished' || found.info.locked) return json({ error: 'This game is closed to new participants.' }, 409);
      const languages = found.info.languages;
      if (languages.length ? !languages.includes(profile.data.language) : profile.data.language !== '') return json({ error: 'Choose an available language.' }, 422);
      attempt = await startLiveAttempt(getDb(), found.session.id, user.id, profile.data);
      if (!attempt) return json({ error: 'That nickname is taken. Please choose another.' }, 409);
    }
    return json({
      ticket: signParticipantTicket({ gameId: found.session.id, attemptId: attempt.id, userId: user.id,
        language: attempt.language, nickname: attempt.nickname, avatar: attempt.avatar, expiresAt: Date.now() + 120_000 }),
      nickname: attempt.nickname, avatar: attempt.avatar, language: attempt.language,
    });
  } catch (error) {
    console.error('Could not start participant attempt', error);
    return json({ error: 'Could not start or resume your quiz. Please try again.' }, 503);
  }
}
