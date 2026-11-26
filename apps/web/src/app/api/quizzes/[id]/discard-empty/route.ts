import { revalidatePath } from 'next/cache';
import { deleteQuiz, getDb, getQuiz } from '@thinkwise/db';
import { getHostUser } from '@/lib/session';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getHostUser();
  if (!user) return new Response('Unauthorized.', { status: 401 });
  const { id } = await params;
  const quiz = await getQuiz(getDb(), user.id, id);
  if (!quiz) return new Response(null, { status: 404 });
  const empty = quiz.questions.length > 0 && quiz.questions.every((question) => !question.text.trim());
  if (!empty) return new Response(null, { status: 409 });
  const ok = await deleteQuiz(getDb(), user, id);
  if (!ok) return new Response(null, { status: 404 });
  revalidatePath('/library');
  revalidatePath('/dashboard');
  return new Response(null, { status: 204 });
}
