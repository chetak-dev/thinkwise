import { isLanguageSheet, LANGUAGE_SHEETS_EXAMPLE, languageSheetsToRows, toCsv } from '@thinkwise/shared';

/** exceljs is CommonJS; depending on the bundler its classes sit on the module or on `default`. */
async function loadWorkbook() {
  const mod = await import('exceljs');
  return (mod as unknown as { default?: typeof mod }).default?.Workbook ?? mod.Workbook;
}

type Sheet = { name: string; rows: string[][] };

/**
 * Reads the questions from an Excel file. The sample has one tab per language (English, Hindi, Odia…);
 * older files with a "language" column, or the CSV columns, are read from their first tab.
 */
export async function readQuestionWorkbook(file: File): Promise<string> {
  const Workbook = await loadWorkbook();
  const book = new Workbook();
  await book.xlsx.load(await file.arrayBuffer());
  const sheets: Sheet[] = [];
  for (const sheet of book.worksheets) {
    if (sheet.state !== 'visible' || sheet.rowCount === 0) continue;
    if (sheet.rowCount > 2001 || sheet.columnCount > 30) {
      throw new Error(`The ${sheet.name} tab is too big. Use at most 2,000 rows and 30 columns per tab.`);
    }
    const rows: string[][] = [];
    sheet.eachRow((row) => {
      const cells: string[] = [];
      for (let column = 1; column <= sheet.columnCount; column++) {
        const cell = row.getCell(column);
        // Formula cells read as their calculated value; error cells (#N/A, #REF!…) can't be imported.
        if (cell.type === 10) throw new Error(`Cell ${cell.address} on the ${sheet.name} tab contains an error. Fix it and try again.`);
        cells.push(cell.text);
      }
      rows.push(cells);
    });
    if (rows.length) sheets.push({ name: sheet.name, rows });
  }
  if (!sheets.length) throw new Error('This workbook has no questions.');
  const tabs = sheets.filter((s) => isLanguageSheet(s.rows));
  if (!tabs.length) return toCsv(sheets[0]!.rows);
  if (tabs.length > 20) throw new Error('Use at most 20 language tabs.');
  const result = languageSheetsToRows(tabs);
  if ('error' in result) throw new Error(result.error);
  return toCsv(result.rows);
}

export async function downloadQuestionTemplate() {
  const Workbook = await loadWorkbook();
  const book = new Workbook();
  for (const { name, rows } of LANGUAGE_SHEETS_EXAMPLE) {
    const sheet = book.addWorksheet(name);
    sheet.addRows(rows);
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.columns.forEach((column, i) => { column.width = i === 1 || i === 9 ? 48 : i === 0 ? 12 : 18; });
  }
  const buffer = await book.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([new Uint8Array(buffer)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'thinkwise-sample-questions.xlsx';
  link.click();
  URL.revokeObjectURL(url);
}
