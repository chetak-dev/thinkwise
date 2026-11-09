import {
  DraftQuestion, EXPLANATION_MAX, MAX_QUESTIONS, OPTION_TEXT_MAX, POINT_VALUES, QUESTION_TEXT_MAX, QuestionTranslation, TIME_LIMITS_S,
  newQuestion, questionIssues, type DraftQuestion as Question,
} from './quiz';
import { parseCsv } from './csv';

export const MULTILINGUAL_COLUMNS = ['question_id', 'language', 'question', 'option_a', 'option_b', 'option_c', 'option_d', 'correct', 'time', 'points', 'explanation'] as const;
export const MULTILINGUAL_EXAMPLE: string[][] = [
  [...MULTILINGUAL_COLUMNS],
  ['1', 'English', 'What is 2 + 2?', '3', '4', '5', '6', 'B', '20', '1000', 'Two plus two is four.'],
  ['1', 'Hindi', '2 + 2 कितना है?', '3', '4', '5', '6', 'B', '20', '1000', 'दो और दो चार होते हैं।'],
  ['2', 'English', 'How many days are in a week?', '5', '6', '7', '8', 'C', '20', '1000', ''],
  ['2', 'Hindi', 'एक सप्ताह में कितने दिन होते हैं?', '5', '6', '7', '8', 'C', '20', '1000', ''],
];

/** Plain-words reasons a row can't be read, so people know exactly which cell to change. */
function rowProblems(
  key: string, language: string, text: string, options: string[], correct: string, time: string, points: string, explanation: string,
) {
  const out: string[] = [];
  if (!key) out.push('“question_id” is empty.');
  else if (key.length > 40) out.push('“question_id” must be 40 characters or fewer.');
  if (!language) out.push('“language” is empty.');
  else if (language.length > 40 || !/^[\p{L}\p{M}\p{N} ()-]+$/u.test(language)) {
    out.push('“language” may only use letters, numbers, spaces, brackets and hyphens (e.g. English, Hindi).');
  }
  if (!text) out.push('“question” is empty.');
  else if (text.length > QUESTION_TEXT_MAX) out.push(`“question” is ${text.length} characters; the most is ${QUESTION_TEXT_MAX}.`);
  if (options.length < 2) out.push('Fill in at least option_a and option_b.');
  options.forEach((o, i) => {
    const col = `option_${'abcd'[i]}`;
    if (!o) out.push(`“${col}” is empty but a later option is filled in.`);
    else if (o.length > OPTION_TEXT_MAX) out.push(`“${col}” is ${o.length} characters; the most is ${OPTION_TEXT_MAX}.`);
  });
  const letter = correct.toUpperCase();
  if (!/^[ABCD]$/.test(letter)) out.push('“correct” must be one letter: A, B, C or D.');
  else if ('ABCD'.indexOf(letter) >= options.length) out.push(`“correct” is ${letter}, but option_${letter.toLowerCase()} is empty.`);
  if (time && !(TIME_LIMITS_S as readonly number[]).includes(Number(time))) {
    out.push(`“time” is ${time}; use one of ${TIME_LIMITS_S.join(', ')} seconds.`);
  }
  if (points && !(POINT_VALUES as readonly number[]).includes(Number(points))) {
    out.push(`“points” is ${points}; use one of ${POINT_VALUES.join(', ')}.`);
  }
  if (explanation.length > EXPLANATION_MAX) out.push(`“explanation” is longer than ${EXPLANATION_MAX} characters.`);
  return out;
}

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
    const problems = rowProblems(key, language, cell('question'), options, cell('correct'), cell('time'), cell('points'), cell('explanation'));
    if (problems.length || !candidate.success || !translation.success) {
      errors.push({
        row: number,
        message: problems.length ? problems.join(' ') : 'Check question ID, language, question, options, correct letter, time and points.',
      });
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
