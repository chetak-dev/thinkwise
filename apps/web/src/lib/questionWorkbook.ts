import { MULTILINGUAL_EXAMPLE, toCsv } from '@thinkwise/shared';

/** exceljs is CommonJS; depending on the bundler its classes sit on the module or on `default`. */
async function loadWorkbook() {
  const mod = await import('exceljs');
  return (mod as unknown as { default?: typeof mod }).default?.Workbook ?? mod.Workbook;
}

export async function readQuestionWorkbook(file: File): Promise<string> {
  const Workbook = await loadWorkbook();
  const book = new Workbook();
  await book.xlsx.load(await file.arrayBuffer());
  const sheet = book.worksheets.find((s) => s.state === 'visible' && s.rowCount > 0) ?? book.worksheets[0];
  if (!sheet) throw new Error('This workbook has no worksheets.');
  if (sheet.rowCount > 2001 || sheet.columnCount > 30) throw new Error('Use at most 2,000 translation rows and 30 columns.');
  const rows: string[][] = [];
  sheet.eachRow((row) => {
    const cells: string[] = [];
    for (let column = 1; column <= sheet.columnCount; column++) {
      const cell = row.getCell(column);
      // Formula cells read as their calculated value; error cells (#N/A, #REF!…) can't be imported.
      if (cell.type === 10) throw new Error(`Cell ${cell.address} contains an error. Fix it and try again.`);
      cells.push(cell.text);
    }
    rows.push(cells);
  });
  return toCsv(rows);
}

export async function downloadQuestionTemplate() {
  const Workbook = await loadWorkbook();
  const book = new Workbook();
  const sheet = book.addWorksheet('Questions');
  sheet.addRows(MULTILINGUAL_EXAMPLE);
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.columns.forEach((column, i) => { column.width = i === 2 || i === 10 ? 48 : 18; });
  const buffer = await book.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([new Uint8Array(buffer)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'thinkwise-multilingual-template.xlsx';
  link.click();
  URL.revokeObjectURL(url);
}
