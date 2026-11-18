import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { csvToQuestions, LANGUAGE_SHEETS_EXAMPLE } from '@thinkwise/shared';
import { readQuestionWorkbook } from '../src/lib/questionWorkbook';

async function workbookFile(sheets: { name: string; rows: string[][] }[]) {
  const workbook = new ExcelJS.Workbook();
  for (const sheet of sheets) workbook.addWorksheet(sheet.name).addRows(sheet.rows);
  const buffer = await workbook.xlsx.writeBuffer();
  return new File([new Uint8Array(buffer)], 'questions.xlsx');
}

test('workbook imports every language tab as editable translations', async () => {
  const text = await readQuestionWorkbook(await workbookFile(LANGUAGE_SHEETS_EXAMPLE));
  const result = csvToQuestions(text, () => crypto.randomUUID());
  assert.deepEqual(result.errors, []);
  assert.deepEqual(Object.keys(result.questions[0]!.translations ?? {}), ['English', 'Hindi', 'Odia']);
  assert.equal(result.questions[0]!.translations?.Hindi?.text, '2 + 2 कितना है?');
  assert.equal(result.questions[0]!.translations?.Odia?.text, '2 + 2 କେତେ?');
});

test('a populated unrecognized language tab is not silently discarded', async () => {
  const bad = { name: 'Hindi', rows: [['question', 'answer_a'], ['प्रश्न', 'उत्तर']] };
  await assert.rejects(readQuestionWorkbook(await workbookFile([LANGUAGE_SHEETS_EXAMPLE[0]!, bad])), /Hindi tab.*Nothing was imported/);
});

test('multiple populated non-template tabs are not silently reduced to the first tab', async () => {
  const rows = [['type', 'question', 'option1', 'option2', 'correct'], ['single', 'Question', 'Yes', 'No', '1']];
  await assert.rejects(readQuestionWorkbook(await workbookFile([{ name: 'English', rows }, { name: 'Hindi', rows }])), /Multiple tabs.*Nothing was imported/);
});