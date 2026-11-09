import {
  DraftQuestion, EXPLANATION_MAX, MAX_QUESTIONS, OPTION_TEXT_MAX, POINT_VALUES, QUESTION_TEXT_MAX, QuestionTranslation, TIME_LIMITS_S,
  newQuestion, questionIssues, type DraftQuestion as Question,
} from './quiz';
import { parseCsv } from './csv';

export const MULTILINGUAL_COLUMNS = ['question_id', 'language', 'question', 'option_a', 'option_b', 'option_c', 'option_d', 'correct', 'time', 'points', 'explanation'] as const;

/** One tab per language in the Excel file; the tab name is the language. */
export const SHEET_COLUMNS = ['question_no', 'question', 'option_a', 'option_b', 'option_c', 'option_d', 'correct', 'time', 'points', 'explanation'] as const;
export const LANGUAGE_SHEETS_EXAMPLE: { name: string; rows: string[][] }[] = [
  {
    name: 'English',
    rows: [
      [...SHEET_COLUMNS],
      ['1', 'What is 2 + 2?', '3', '4', '5', '6', 'B', '20', '1000', 'Two plus two is four.'],
      ['2', 'How many days are in a week?', '5', '6', '7', '8', 'C', '20', '1000', ''],
      ['3', 'Which is the largest planet?', 'Earth', 'Mars', 'Jupiter', 'Venus', 'C', '30', '1000', ''],
    ],
  },
  {
    name: 'Hindi',
    rows: [
      [...SHEET_COLUMNS],
      ['1', '2 + 2 कितना है?', '3', '4', '5', '6', 'B', '20', '1000', 'दो और दो चार होते हैं।'],
      ['2', 'एक सप्ताह में कितने दिन होते हैं?', '5', '6', '7', '8', 'C', '20', '1000', ''],
      ['3', 'सबसे बड़ा ग्रह कौन सा है?', 'पृथ्वी', 'मंगल', 'बृहस्पति', 'शुक्र', 'C', '30', '1000', ''],
    ],
  },
  {
    name: 'Odia',
    rows: [
      [...SHEET_COLUMNS],
      ['1', '2 + 2 କେତେ?', '3', '4', '5', '6', 'B', '20', '1000', 'ଦୁଇ ଓ ଦୁଇ ଚାରି ହୁଏ।'],
      ['2', 'ଗୋଟିଏ ସପ୍ତାହରେ କେତେ ଦିନ?', '5', '6', '7', '8', 'C', '20', '1000', ''],
      ['3', 'ସବୁଠାରୁ ବଡ଼ ଗ୍ରହ କେଉଁଟି?', 'ପୃଥିବୀ', 'ମଙ୍ଗଳ', 'ବୃହସ୍ପତି', 'ଶୁକ୍ର', 'C', '30', '1000', ''],
    ],
  },
];

const headerKey = (c: string) => c.trim().toLowerCase().replace(/ /g, '_');

/** True when a sheet uses the one-tab-per-language layout (no "language" column). */
export function isLanguageSheet(rows: string[][]) {
  const header = (rows[0] ?? []).map(headerKey);
  return header.includes('question') && header.includes('option_a') && !header.includes('language');
}

/**
 * Turns one tab per language into translation rows. Rows match by question_no (or by position when
 * there is no such column); blank correct, time and points in later tabs copy the first tab's values.
 */
export function languageSheetsToRows(sheets: { name: string; rows: string[][] }[]): { rows: string[][] } | { error: string } {
  const used = sheets.filter((s) => s.rows.slice(1).some((r) => r.some((c) => c.trim())));
  if (!used.length) return { error: 'The workbook has no questions. Fill in the template and try again.' };
  const seen = new Set<string>();
  for (const s of used) {
    const lower = s.name.trim().toLowerCase();
    if (seen.has(lower)) return { error: `Two tabs are both called “${s.name.trim()}”. Give each language its own tab.` };
    seen.add(lower);
  }
  const out: string[][] = [[...MULTILINGUAL_COLUMNS, 'source']];
  const first = new Map<string, Record<string, string>>();
  used.forEach((sheet, sheetIndex) => {
    const header = sheet.rows[0]!.map(headerKey);
    const language = sheet.name.trim();
    let position = 0;
    sheet.rows.slice(1).forEach((row, i) => {
      if (!row.some((c) => c.trim())) return;
      position += 1;
      const cell = (name: string) => (header.includes(name) ? (row[header.indexOf(name)] ?? '').trim() : '');
      const key = cell('question_no') || (header.includes('question_no') ? '' : String(position));
      const values: Record<string, string> = Object.fromEntries(
        ['question', 'option_a', 'option_b', 'option_c', 'option_d', 'correct', 'time', 'points', 'explanation'].map((c) => [c, cell(c)]),
      );
      if (sheetIndex === 0) first.set(key, values);
      else {
        const base = first.get(key);
        for (const c of ['correct', 'time', 'points']) if (!values[c] && base?.[c]) values[c] = base[c]!;
      }
      out.push([
        key, language, values.question!, values.option_a!, values.option_b!, values.option_c!, values.option_d!,
        values.correct!, values.time!, values.points!, values.explanation!, `${language} sheet, row ${i + 2}`,
      ]);
    });
  });
  return { rows: out };
}

/** Plain-words reasons a row can't be read, so people know exactly which cell to change. */
function rowProblems(
  sheets: boolean, key: string, language: string, text: string, options: string[], correct: string, time: string, points: string, explanation: string,
) {
  const out: string[] = [];
  const id = sheets ? '“question_no”' : '“question_id”';
  if (!key) out.push(`${id} is empty.`);
  else if (key.length > 40) out.push(`${id} must be 40 characters or fewer.`);
  if (!language) out.push(sheets ? 'The tab has no name; name it after its language (e.g. English).' : '“language” is empty.');
  else if (language.length > 40 || !/^[\p{L}\p{M}\p{N} ()-]+$/u.test(language)) {
    out.push(sheets
      ? 'Name each tab after its language using letters, numbers, spaces, brackets and hyphens (e.g. English, Hindi).'
      : '“language” may only use letters, numbers, spaces, brackets and hyphens (e.g. English, Hindi).');
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
  const header = rows[0]!.map(headerKey);
  const sheets = header.includes('source');
  const required = MULTILINGUAL_COLUMNS.filter((c) => !['time', 'points', 'explanation'].includes(c));
  const missing = required.filter((c) => !header.includes(c));
  if (missing.length || new Set(header).size !== header.length) {
    return { questions, errors: [{ row: 1, message: missing.length ? `Missing columns: ${missing.join(', ')}` : 'Duplicate column names' }] };
  }
  if (rows.length > MAX_QUESTIONS * 20 + 1) return { questions, errors: [{ row: 0, message: 'Use at most 100 questions in 20 languages.' }] };
  const groups = new Map<string, { question: Question; row: number }>();
  const languages = new Set<string>();
  // Tab imports point at the language tab and its row instead of a row in the combined list.
  const fail = (number: number, source: string, message: string) =>
    errors.push(source ? { row: 0, message: `${source}: ${message}` } : { row: number, message });
  rows.slice(1).forEach((row, i) => {
    const number = i + 2;
    const cell = (name: string) => (row[header.indexOf(name)] ?? '').trim();
    const source = sheets ? cell('source') : '';
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
    const problems = rowProblems(sheets, key, language, cell('question'), options, cell('correct'), cell('time'), cell('points'), cell('explanation'));
    if (problems.length || !candidate.success || !translation.success) {
      fail(number, source, problems.length ? problems.join(' ') : 'Check question ID, language, question, options, correct letter, time and points.');
      return;
    }
    const issues = questionIssues(candidate.data);
    if (issues.length) { fail(number, source, issues.join('; ')); return; }
    // Prevent two spellings of a language creating confusing duplicate choices.
    const canonical = [...languages].find((l) => l.toLowerCase() === language.toLowerCase()) ?? language;
    languages.add(canonical);
    const group = groups.get(key);
    if (!group) {
      const question = { ...candidate.data, translations: { [canonical]: translation.data } };
      groups.set(key, { question, row: sheets ? 0 : number });
      questions.push(question);
    } else {
      const base = group.question;
      if (base.translations?.[canonical]) fail(number, source, `Duplicate ${canonical} translation for question ${key}.`);
      else if (base.correct[0] !== correct || base.options.length !== options.length ||
               base.timeLimitMs !== candidate.data.timeLimitMs || base.points !== candidate.data.points) {
        fail(number, source, `Question ${key}: translations must have matching correct letters, option counts, timers and points.`);
      } else base.translations = { ...base.translations, [canonical]: translation.data };
    }
  });
  for (const [key, { question, row }] of groups) {
    const missingLanguages = [...languages].filter((l) => !question.translations?.[l]);
    if (missingLanguages.length) {
      errors.push({
        row,
        message: sheets
          ? `Question ${key} is missing from the ${missingLanguages.join(', ')} tab${missingLanguages.length > 1 ? 's' : ''}.`
          : `Question ${key} is missing: ${missingLanguages.join(', ')}.`,
      });
    }
  }
  if (languages.size > 20 || questions.length > MAX_QUESTIONS) errors.push({ row: 0, message: 'Use at most 100 questions in 20 languages.' });
  return { questions: errors.length ? [] : questions, errors };
}

export function isMultilingualCsv(text: string) {
  return parseCsv(text)[0]?.some((c) => c.trim().toLowerCase().replace(/ /g, '_') === 'question_id') ?? false;
}
