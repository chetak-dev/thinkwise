import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getDb, getQuiz } from '@thinkwise/db';
import { requireUser } from '@/lib/session';
import { QuizEditor } from './QuizEditor';

export const metadata: Metadata = { title: 'Edit quiz · ThinkWise' };

export default async function EditQuizPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/quiz/${id}/edit`);
  const quiz = await getQuiz(getDb(), user.id, id);
  if (!quiz) notFound();

  return (
    <QuizEditor
      key={quiz.id}
      quiz={{
        id: quiz.id,
        title: quiz.title,
        description: quiz.description,
        questions: quiz.questions,
        settings: quiz.settings,
        status: quiz.status,
      }}
    />
  );
}
