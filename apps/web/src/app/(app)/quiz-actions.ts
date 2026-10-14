'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import {
  QuizSave,
  copyQuiz,
  createGameSession,
  createQuiz,
  deleteQuiz,
  duplicateQuiz,
  getDb,
  getHostablePublished,
  getResumableSession,
  getQuiz,
  publishQuiz,
  saveQuiz,
  setArchived,
  setFavourite,
} from '@thinkwise/db';
import { CSV_MAX_BYTES, csvToQuestions, toPlayable, type GameMode } from '@thinkwise/shared';
import { randomUUID } from 'node:crypto';
import { requireUser } from '@/lib/session';
import { createLiveGame } from '@/lib/realtime';

export async function createQuizAction() {
  const user = await requireUser();
  const id = await createQuiz(getDb(), user);
  redirect(`/quiz/${id}/edit`);
}

export type ImportResult = { ok: false; error: string; errors?: { row: number; message: string }[] };

/** Creates a new quiz from an uploaded CSV. Rows with problems are reported, not silently dropped. */
export async function importQuizCsvAction(fileName: string, text: string): Promise<ImportResult> {
  const user = await requireUser();
  if (typeof text !== 'string' || text.length > CSV_MAX_BYTES) return { ok: false, error: 'The file is larger than 256 KB.' };
  const { questions, errors } = csvToQuestions(text, randomUUID);
  if (errors.length) {
    return {
      ok: false,
      error: `${errors.length} ${errors.length === 1 ? 'row needs' : 'rows need'} fixing. Nothing was imported.`,
      errors: errors.slice(0, 50),
    };
  }
  const title = String(fileName ?? '').replace(/\.[^.]*$/, '').replace(/[_-]+/g, ' ').trim() || 'Imported quiz';
  const id = await createQuiz(getDb(), user, title, questions);
  revalidatePath('/library');
  revalidatePath('/dashboard');
  redirect(`/quiz/${id}/edit`);
}

export async function duplicateQuizAction(id: string) {
  const user = await requireUser();
  const copy = await duplicateQuiz(getDb(), user, id);
  revalidatePath('/library');
  revalidatePath('/dashboard');
  return copy ? { ok: true as const, id: copy } : { ok: false as const };
}

export async function deleteQuizAction(id: string) {
  const user = await requireUser();
  const ok = await deleteQuiz(getDb(), user, id);
  revalidatePath('/library');
  revalidatePath('/dashboard');
  return { ok };
}

export async function setFavouriteAction(id: string, on: boolean) {
  const user = await requireUser();
  const ok = await setFavourite(getDb(), user.id, id, on === true);
  revalidatePath('/library');
  revalidatePath('/dashboard');
  return { ok };
}

export async function setArchivedAction(id: string, archived: boolean) {
  const user = await requireUser();
  const ok = await setArchived(getDb(), user, id, archived === true);
  revalidatePath('/library');
  revalidatePath('/dashboard');
  return { ok };
}

export type SaveResult = { ok: true; savedAt: string } | { ok: false; error: string };

export async function saveQuizAction(id: string, input: unknown): Promise<SaveResult> {
  const user = await requireUser();
  const parsed = QuizSave.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Some of this quiz couldn’t be saved. Check the highlighted questions.' };
  const savedAt = await saveQuiz(getDb(), user.id, id, parsed.data);
  if (!savedAt) return { ok: false, error: 'This quiz no longer exists.' };
  return { ok: true, savedAt: savedAt.toISOString() };
}

export type HostResult =
  | { ok: true; gameId: string; hostToken: string }
  | { ok: false; error: string; problems?: { index: number; issues: string[] }[] };

function notReadyMessage(check: { empty: boolean; titleMissing: boolean; problems: unknown[] }, action: string) {
  if (check.empty) return `Add at least one question before ${action}.`;
  if (check.titleMissing) return `Give your quiz a title before ${action}.`;
  return `Fix ${check.problems.length} ${check.problems.length === 1 ? 'question' : 'questions'} before ${action}.`;
}

export type PublishActionResult = { ok: true; publishedAt: string } | Extract<HostResult, { ok: false }>;

export async function publishQuizAction(id: string): Promise<PublishActionResult> {
  const user = await requireUser();
  const result = await publishQuiz(getDb(), user, id);
  if (!result.ok) {
    if (result.reason === 'not_found') return { ok: false, error: 'This quiz no longer exists.' };
    return { ok: false, error: notReadyMessage(result.check, 'publishing'), problems: result.check.problems };
  }
  revalidatePath('/library');
  revalidatePath('/dashboard');
  return { ok: true, publishedAt: result.publishedAt.toISOString() };
}

/** Untrusted options from the start dialog, reduced to what the game server accepts. */
function startOptions(options?: { autoAdvance?: unknown; mode?: unknown }) {
  const mode: GameMode = options?.mode === 'self' ? 'self' : 'live';
  return { autoAdvance: mode === 'live' && options?.autoAdvance !== false, mode };
}

export async function hostQuizAction(id: string, options?: { autoAdvance?: unknown; mode?: unknown }): Promise<HostResult> {
  const user = await requireUser();
  const quiz = await getQuiz(getDb(), user.id, id);
  if (!quiz) return { ok: false, error: 'This quiz no longer exists.' };
  const check = toPlayable(quiz.title, quiz.questions, quiz.settings);
  if (!check.ok) return { ok: false, error: notReadyMessage(check, 'hosting'), problems: check.problems };
  try {
    const start = startOptions(options);
    const game = await createLiveGame(check.quiz, start);
    await createGameSession(getDb(), user, {
      gameId: game.gameId,
      pin: game.pin,
      quizId: id,
      title: check.quiz.title,
      questionCount: check.quiz.questions.length,
      mode: start.mode,
      hostToken: game.hostToken,
    });
    return { ok: true, gameId: game.gameId, hostToken: game.hostToken };
  } catch {
    return { ok: false, error: 'The game server isn’t responding. Please try again in a moment.' };
  }
}

/** Hosts the published copy of a quiz shared with (or owned by) the signed-in host. */
export async function hostPublishedQuizAction(id: string, options?: { autoAdvance?: unknown; mode?: unknown }): Promise<HostResult> {
  const user = await requireUser();
  const quiz = await getHostablePublished(getDb(), user.id, id);
  if (!quiz) return { ok: false, error: 'This quiz isn’t available to host.' };
  try {
    const start = startOptions(options);
    const game = await createLiveGame(quiz, start);
    await createGameSession(getDb(), user, {
      gameId: game.gameId,
      pin: game.pin,
      quizId: id,
      title: quiz.title,
      questionCount: quiz.questions.length,
      mode: start.mode,
      hostToken: game.hostToken,
    });
    return { ok: true, gameId: game.gameId, hostToken: game.hostToken };
  } catch {
    return { ok: false, error: 'The game server isn’t responding. Please try again in a moment.' };
  }
}

export type ResumeResult =
  | { ok: true; gameId: string; hostToken: string; quizId: string | null; source: 'draft' | 'published' }
  | { ok: false; error: string };

/** Hands the owner the controls of one of their running games again (e.g. from a new tab). */
export async function resumeSessionAction(id: string): Promise<ResumeResult> {
  const user = await requireUser();
  const session = await getResumableSession(getDb(), user.id, id);
  return session ? { ok: true, ...session } : { ok: false, error: 'This game has already ended.' };
}

export async function copyQuizAction(id: string) {
  const user = await requireUser();
  const copy = await copyQuiz(getDb(), user, id);
  if (!copy) return { ok: false as const, error: 'This quiz can’t be copied.' };
  revalidatePath('/library');
  revalidatePath('/dashboard');
  redirect(`/quiz/${copy}/edit`);
}
