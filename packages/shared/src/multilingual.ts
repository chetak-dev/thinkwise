import { DraftQuestion, MAX_QUESTIONS, QuestionTranslation, newQuestion, questionIssues, type DraftQuestion as Question } from './quiz';
import { parseCsv } from './csv';

export const MULTILINGUAL_COLUMNS = ['question_id', 'language', 'question', 'option_a', 'option_b', 'option_c', 'option_d', 'correct', 'time', 'points', 'explanation'] as const;
export const MULTILINGUAL_EXAMPLE: string[][] = [
  [...MULTILINGUAL_COLUMNS],
  ['1', 'English', 'What is 2 + 2?', '3', '4', '5', '6', 'B', '20', '1000', 'Two plus two is four.'],
  ['1', 'Hindi', '2 + 2 कितना है?', '3', '4', '5', '6', 'B', '20', '1000', 'दो और दो चार होते हैं।'],
  ['2', 'English', 'How many days are in a week?', '5', '6', '7', '8', 'C', '20', '1000', ''],
  ['2', 'Hindi', 'एक सप्ताह में कितने दिन होते हैं?', '5', '6', '7', '8', 'C', '20', '1000', ''],
];

/** Every language is a translation of the same question, not another attempt or question. */
export function multilingualQuestions(rows: string[][], id: () => string) {
  const errors: { row: number; message: string }[] = [];
  const questions: Question[] = [];
  const header = rows[0]!.map((c) => c.trim().toLowerCase().replace(/ /g, '_'));
  const required = MULTILINGUAL_COLUMNS.filter((c) => !['time', 'points', 'explanation'].includes(c));
  const missing = required.filter((c) => !header.includes(c));
  if (missing.length || new Set(header).size !== header.length) {
    return { questions, errors: [{ row: 1, message: missing.length ? `Missing columns: ${missing.join(', ')}` : 'Duplicate column names' }] };
  }
  if (rows.length > MAX_QUESTIONS * 20 + 1) return { questions, errors: [{ row: 0, message: 'Use at most 100 questions in 20 languages.' }] };
  const groups = new Map<string, { question: Question; row: number }>();
  const languages = new Set<string>();
  rows.slice(1).forEach((row, i) => {
    const number = i + 2;
    const cell = (name: string) => (row[header.indexOf(name)] ?? '').trim();
    const key = cell('question_id');
    const language = cell('language').normalize('NFC');
    const options = ['a', 'b', 'c', 'd'].map((l) => cell(`option_${l}`));
    while (options.length && !options[options.length - 1]) options.pop();
    const correct = 'ABCD'.indexOf(cell('correct').toUpperCase());
    const candidate = DraftQuestion.safeParse({
      ...newQuestion('mc', id()), text: cell('question'), options, correct: [correct],
      timeLimitMs: Number(cell('time') || 20) * 1000, points: Number(cell('points') || 1000),
      explanation: cell('explanation'),
    });
    const translation = QuestionTranslation.safeParse({ text: cell('question'), options, explanation: cell('explanation') });
    if (!key || key.length > 40 || !language || language.length > 40 ||
        !/^[\p{L}\p{M}\p{N} ()-]+$/u.test(language) || !candidate.success || !translation.success) {
      errors.push({ row: number, message: 'Check question ID, language, question, options, correct letter, time and points.' });
      return;
    }
    const issues = questionIssues(candidate.data);
    if (issues.length) { errors.push({ row: number, message: issues.join('; ') }); return; }
    // Prevent two spellings of a language creating confusing duplicate choices.
    const canonical = [...languages].find((l) => l.toLowerCase() === language.toLowerCase()) ?? language;
    languages.add(canonical);
    const group = groups.get(key);
    if (!group) {
      const question = { ...candidate.data, translations: { [canonical]: translation.data } };
      groups.set(key, { question, row: number });
      questions.push(question);
    } else {
      const base = group.question;
      if (base.translations?.[canonical]) errors.push({ row: number, message: `Duplicate ${canonical} translation for question ${key}.` });
      else if (base.correct[0] !== correct || base.options.length !== options.length ||
               base.timeLimitMs !== candidate.data.timeLimitMs || base.points !== candidate.data.points) {
        errors.push({ row: number, message: `Question ${key}: translations must have matching correct letters, option counts, timers and points.` });
      } else base.translations = { ...base.translations, [canonical]: translation.data };
    }
  });
  for (const [key, { question, row }] of groups) {
    const missingLanguages = [...languages].filter((l) => !question.translations?.[l]);
    if (missingLanguages.length) errors.push({ row, message: `Question ${key} is missing: ${missingLanguages.join(', ')}.` });
  }
  if (languages.size > 20 || questions.length > MAX_QUESTIONS) errors.push({ row: 0, message: 'Use at most 100 questions in 20 languages.' });
  return { questions: errors.length ? [] : questions, errors };
}

export function isMultilingualCsv(text: string) {
  return parseCsv(text)[0]?.some((c) => c.trim().toLowerCase().replace(/ /g, '_') === 'question_id') ?? false;
}
