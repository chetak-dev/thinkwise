'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import {
  createFeedbackEvent,
  createFeedbackForm,
  createGameSession,
  getDb,
  getFeedbackEvent,
  getQuiz,
  saveFeedbackForm,
} from '@thinkwise/db';
import { FeedbackFormSave, toPlayable, type FeedbackEventInput } from '@thinkwise/shared';
import { requireUser } from '@/lib/session';
import { createLiveGame } from '@/lib/realtime';

export async function createFeedbackFormAction() {
  const user = await requireUser();
  const id = await createFeedbackForm(getDb(), user);
  revalidatePath('/feedback');
  redirect(`/feedback/forms/${id}`);
}

export type FormSaveResult = { ok: true; version: number } | { ok: false; error: string };

export async function saveFeedbackFormAction(id: string, input: unknown): Promise<FormSaveResult> {
  const user = await requireUser();
  const parsed = FeedbackFormSave.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Some of this form couldn’t be saved.' };
  const saved = await saveFeedbackForm(getDb(), user.id, id, parsed.data);
  if (!saved) return { ok: false, error: 'This form no longer exists.' };
  revalidatePath('/feedback');
  return { ok: true, version: saved.version };
}

export async function createFeedbackEventAction(input: FeedbackEventInput): Promise<{ ok: false; error: string }> {
  const user = await requireUser();
  const result = await createFeedbackEvent(getDb(), user, input);
  if (!result.ok) return result;
  revalidatePath('/feedback');
  redirect(`/feedback/events/${result.id}`);
}

export type LaunchResult = { ok: true; gameId: string; hostToken: string; quizId: string } | { ok: false; error: string };

/** Opens a live lobby for the event's quiz; each launch is recorded as its own session. */
export async function launchFeedbackEventAction(id: string): Promise<LaunchResult> {
  const user = await requireUser();
  const db = getDb();
  const event = await getFeedbackEvent(db, user.id, id);
  if (!event) return { ok: false, error: 'This event no longer exists.' };
  if (!event.quiz) return { ok: false, error: 'This event’s quiz has been deleted. Create a new event with another quiz.' };
  const quiz = await getQuiz(db, user.id, event.quiz.id);
  if (!quiz) return { ok: false, error: 'This event’s quiz is no longer available.' };
  const check = toPlayable(quiz.title, quiz.questions, quiz.settings);
  if (!check.ok) {
    const why = check.empty ? 'it has no questions' : check.titleMissing ? 'it needs a title' : `${check.problems.length} question(s) need fixing`;
    return { ok: false, error: `The quiz isn’t ready to play: ${why}. Open it in the editor to fix it.` };
  }
  try {
    const game = await createLiveGame(check.quiz, { autoAdvance: true, mode: 'live' });
    await createGameSession(db, user, {
      gameId: game.gameId,
      pin: game.pin,
      quizId: quiz.id,
      title: check.quiz.title,
      questionCount: check.quiz.questions.length,
      eventId: event.id,
    });
    revalidatePath(`/feedback/events/${event.id}`);
    return { ok: true, gameId: game.gameId, hostToken: game.hostToken, quizId: quiz.id };
  } catch {
    return { ok: false, error: 'The game server isn’t responding. Please try again in a moment.' };
  }
}
