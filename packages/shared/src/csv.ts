import {
  ANSWER_TEXT_MAX,
  EXPLANATION_MAX,
  MAX_ACCEPTED,
  MAX_OPTIONS,
  MAX_QUESTIONS,
  MIN_OPTIONS,
  OPTION_TEXT_MAX,
  POINT_VALUES,
  QUESTION_TEXT_MAX,
  TAGS_MAX,
  TIME_LIMITS_S,
  TRUE_FALSE_OPTIONS,
  MAX_BLANKS,
  RATING_MAX_VALUES,
  MAX_WORDS_VALUES,
  countBlanks,
  newQuestion,
  parseNumberAnswer,
  type DraftQuestion,
} from './quiz';

/** Same column names other quiz tools use, so spreadsheets move between them. */
export const CSV_COLUMNS = [
  'type',
  'question',
  'option1',
  'option2',
  'option3',
  'option4',
  'option5',
  'option6',
  'correct',
  'time',
  'points',
  'explanation',
  'tags',
] as const;

export const CSV_MAX_BYTES = 256 * 1024;

const TYPE_ALIASES: Record<string, DraftQuestion['type']> = {
  single: 'mc',
  mc: 'mc',
  multiple_choice: 'mc',
  'multiple choice': 'mc',
  true_false: 'tf',
  tf: 'tf',
  'true/false': 'tf',
  'true or false': 'tf',
  multiple: 'multi',
  multi: 'multi',
  multi_select: 'multi',
  'multi-select': 'multi',
  short_text: 'text',
  type_answer: 'text',
  text: 'text',
  numeric: 'numeric',
  number: 'numeric',
  fill_blank: 'blanks',
  fill_blanks: 'blanks',
  blanks: 'blanks',
  ordering: 'order',
  order: 'order',
  put_in_order: 'order',
  poll: 'poll',
  word_cloud: 'cloud',
  wordcloud: 'cloud',
  rating: 'rating',
  rating_scale: 'rating',
};

/** Type names written on export, matching the template. */
const EXPORT_TYPES: Record<DraftQuestion['type'], string> = {
  mc: 'single',
  multi: 'multiple',
  tf: 'true_false',
  text: 'short_text',
  numeric: 'numeric',
  blanks: 'fill_blank',
  order: 'ordering',
  poll: 'poll',
  cloud: 'word_cloud',
  rating: 'rating',
};

const splitList = (cell: string) =>
  cell
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);

export const CSV_TEMPLATE = [
  CSV_COLUMNS.join(','),
  'single,Which planet is known as the Red Planet?,Venus,Mars,Jupiter,Saturn,,,2,20,1000,Iron oxide dust gives Mars its colour,space',
  'multiple,Which of these are mammals?,Dolphin,Shark,Bat,Penguin,,,1;3,30,1000,,biology',
  'single,How many sides does a hexagon have?,5,6,8,,,,2,15,500,,maths',
  'true_false,Water boils at 100 °C at sea level,,,,,,,true,10,1000,,science',
  'short_text,What is the chemical symbol for sodium?,,,,,,,Na,20,1000,From its Latin name natrium,chemistry',
  'numeric,How many seconds are there in 2.5 minutes?,,,,,,,150,30,1000,,maths',
  'fill_blank,The ___ is the largest ocean and the ___ is the longest river.,,,,,,,Pacific|Nile;River Nile,45,1000,,geography',
  'ordering,Put these planets in order from the Sun,Mercury,Venus,Earth,Mars,,,,30,1000,,space',
  'poll,Which topic should we revise next?,Planets,Oceans,Volcanoes,,,,,20,0,,',
  'word_cloud,Describe today’s lesson in one word,,,,,,,,30,0,,',
  'rating,How confident do you feel about this topic?,,,,,,,1-5,20,0,,',
].join('\r\n');

/** RFC 4180 parsing; also accepts the semicolon-separated files some Excel locales produce. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = !firstLine.includes(',') && firstLine.includes(';') ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

// Undo the apostrophe our exporter adds in front of formula-like cells.
const unguard = (cell: string) => (/^'[=+\-@]/.test(cell) ? cell.slice(1) : cell);

export interface CsvImport {
  questions: DraftQuestion[];
  errors: { row: number; message: string }[];
}

export function csvToQuestions(text: string, makeId: () => string): CsvImport {
  const errors: CsvImport['errors'] = [];
  if (text.length > CSV_MAX_BYTES) return { questions: [], errors: [{ row: 0, message: 'The file is larger than 256 KB.' }] };
  const rows = parseCsv(text);
  if (rows.length === 0) return { questions: [], errors: [{ row: 0, message: 'The file is empty.' }] };

  const header = rows[0]!.map((h) => h.trim().toLowerCase());
  const col = Object.fromEntries(CSV_COLUMNS.map((c) => [c, header.indexOf(c)])) as Record<(typeof CSV_COLUMNS)[number], number>;
  if (col.question < 0) {
    return { questions: [], errors: [{ row: 1, message: 'The first row must be the column names, including “question”. Download the template to see the layout.' }] };
  }

  const questions: DraftQuestion[] = [];
  rows.slice(1).forEach((cells, i) => {
    const rowNo = i + 2;
    const get = (c: (typeof CSV_COLUMNS)[number]) => (col[c] >= 0 ? unguard((cells[col[c]] ?? '').trim()) : '');
    const fail = (message: string) => errors.push({ row: rowNo, message });

    if (questions.length >= MAX_QUESTIONS) return fail(`Only ${MAX_QUESTIONS} questions fit in one quiz.`);
    const rawType = get('type').toLowerCase() || 'single';
    const type = TYPE_ALIASES[rawType];
    if (!type) {
      return fail(`Unknown type “${rawType}”.`);
    }

    const text = get('question');
    if (!text) return fail('The question is empty.');
    if (text.length > QUESTION_TEXT_MAX) return fail(`The question is longer than ${QUESTION_TEXT_MAX} characters.`);

    const q = newQuestion(type, makeId());
    q.text = text;

    if (type === 'mc' || type === 'multi' || type === 'order' || type === 'poll') {
      const options = (['option1', 'option2', 'option3', 'option4', 'option5', 'option6'] as const).map(get).filter(Boolean);
      if (options.length < MIN_OPTIONS) return fail(type === 'order' ? 'Add at least two items, in the right order.' : 'Add at least two options.');
      if (options.length > MAX_OPTIONS) return fail(`Use at most ${MAX_OPTIONS} options.`);
      if (options.some((o) => o.length > OPTION_TEXT_MAX)) return fail(`An option is longer than ${OPTION_TEXT_MAX} characters.`);
      q.options = options;
      if (type === 'poll') {
        const mode = get('correct').toLowerCase();
        if (mode !== '' && mode !== 'multiple') return fail('“correct” is empty for a poll, or “multiple” to let players pick several.');
        q.allowMultiple = mode === 'multiple';
        q.points = 0;
      } else if (type === 'order') {
        if (new Set(options.map((o) => o.toLowerCase())).size < options.length) return fail('Every item must be different.');
        q.correct = [];
      } else {
        const picks = type === 'multi' ? splitList(get('correct')) : [get('correct')];
        const correct = picks.map(Number);
        if (correct.length === 0 || correct.some((c) => !Number.isInteger(c) || c < 1 || c > options.length)) {
          return fail(
            type === 'multi'
              ? `“correct” must list the right option numbers separated by ; (for example 1;3).`
              : `“correct” must be the number of the right option (1–${options.length}).`,
          );
        }
        q.correct = [...new Set(correct.map((c) => c - 1))].sort((a, b) => a - b);
      }
    } else if (type === 'cloud') {
      const limit = get('correct');
      const max = limit === '' ? 1 : Number(limit);
      if (!(MAX_WORDS_VALUES as readonly number[]).includes(max)) return fail('“correct” is the most words per response (1–5), or empty for 1.');
      q.maxWords = max;
      q.points = 0;
    } else if (type === 'rating') {
      const scale = get('correct');
      const match = /^([01])\s*[-–]\s*(\d{1,2})$/.exec(scale);
      const max = match ? Number(match[2]) : 5;
      if ((scale && !match) || !(RATING_MAX_VALUES as readonly number[]).includes(max)) {
        return fail('“correct” is the scale, from 0 or 1 up to 3–10 (for example 1-5), or empty for 1-5.');
      }
      q.ratingMin = match ? Number(match[1]) : 1;
      q.ratingMax = max;
      q.points = 0;
    } else if (type === 'text') {
      const accepted = splitList(get('correct'));
      if (accepted.length === 0) return fail('“correct” must list the accepted answers, separated by ;.');
      if (accepted.length > MAX_ACCEPTED) return fail(`Use at most ${MAX_ACCEPTED} accepted answers.`);
      if (accepted.some((a) => a.length > ANSWER_TEXT_MAX)) return fail(`An accepted answer is longer than ${ANSWER_TEXT_MAX} characters.`);
      q.accepted = accepted;
    } else if (type === 'numeric') {
      const [value = '', margin, extra] = get('correct').split(/±|\+\/-|\+-/);
      const answer = parseNumberAnswer(value);
      const tolerance = margin === undefined ? 0 : parseNumberAnswer(margin);
      if (answer === null || tolerance === null || tolerance < 0 || extra !== undefined) {
        return fail('“correct” must be a number, optionally with a margin like 10±0.5.');
      }
      q.numericAnswer = answer;
      q.tolerance = tolerance;
    } else if (type === 'blanks') {
      const count = countBlanks(text);
      if (count === 0) return fail('Mark each blank in the question with ___ (three underscores).');
      if (count > MAX_BLANKS) return fail(`Use at most ${MAX_BLANKS} blanks.`);
      const blanks = get('correct').split('|').map(splitList);
      if (blanks.length !== count || blanks.some((b) => b.length === 0)) {
        return fail(`“correct” needs answers for all ${count} blanks, separated by | (alternatives by ;).`);
      }
      if (blanks.some((b) => b.length > MAX_ACCEPTED || b.some((a) => a.length > ANSWER_TEXT_MAX))) {
        return fail('A blank has too many or too long answers.');
      }
      q.blanks = blanks;
    } else {
      const answer = get('correct').toLowerCase();
      const index = ['true', 't', 'yes', '1'].includes(answer) ? 0 : ['false', 'f', 'no', '0'].includes(answer) ? 1 : -1;
      if (index < 0) return fail('“correct” must be true or false.');
      q.options = [...TRUE_FALSE_OPTIONS];
      q.correct = [index];
    }

    const time = get('time');
    if (time) {
      const s = Number(time);
      if (!(TIME_LIMITS_S as readonly number[]).includes(s)) return fail(`“time” must be one of ${TIME_LIMITS_S.join(', ')} seconds.`);
      q.timeLimitMs = s * 1000;
    }
    const points = get('points');
    if (points) {
      const p = Number(points);
      if (!(POINT_VALUES as readonly number[]).includes(p)) return fail(`“points” must be one of ${POINT_VALUES.join(', ')}.`);
      q.points = p;
    }
    q.explanation = get('explanation').slice(0, EXPLANATION_MAX);
    q.tags = get('tags').slice(0, TAGS_MAX);
    questions.push(q);
  });

  if (questions.length === 0 && errors.length === 0) errors.push({ row: 0, message: 'There are no questions below the column names.' });
  return { questions, errors };
}

/** Quotes when needed, and stops spreadsheet apps treating a cell as a formula. */
function csvCell(value: string) {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Any table to CSV, with the same quoting and formula protection as quiz exports. */
export function toCsv(rows: (string | number)[][]): string {
  return rows.map((r) => r.map((c) => csvCell(String(c))).join(',')).join('\r\n');
}

export function questionsToCsv(questions: DraftQuestion[]): string {
  const lines = questions.map((q) => {
    const options = q.type === 'mc' || q.type === 'multi' || q.type === 'order' || q.type === 'poll' ? q.options : [];
    const correct =
      q.type === 'order'
        ? ''
        : q.type === 'poll'
          ? (q.allowMultiple ? 'multiple' : '')
          : q.type === 'cloud'
            ? (q.maxWords > 1 ? String(q.maxWords) : '')
          : q.type === 'rating'
          ? `${q.ratingMin}-${q.ratingMax}`
          : q.type === 'tf'
            ? q.correct[0] === 1
              ? 'false'
              : 'true'
            : q.type === 'text'
              ? q.accepted.map((a) => a.trim()).filter(Boolean).join(';')
              : q.type === 'numeric'
                ? q.numericAnswer === null
                  ? ''
                  : `${q.numericAnswer}${q.tolerance ? `±${q.tolerance}` : ''}`
                : q.type === 'blanks'
                  ? q.blanks.map((b) => b.map((a) => a.trim()).filter(Boolean).join(';')).join('|')
                  : q.correct.map((c) => c + 1).join(';');
    return [
      EXPORT_TYPES[q.type],
      q.text,
      ...Array.from({ length: 6 }, (_, i) => options[i] ?? ''),
      correct,
      String(q.timeLimitMs / 1000),
      String(q.points),
      q.explanation,
      q.tags,
    ]
      .map(csvCell)
      .join(',');
  });
  return [CSV_COLUMNS.join(','), ...lines].join('\r\n');
}
