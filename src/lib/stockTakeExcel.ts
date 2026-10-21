// The stock take as the Excel file the site manager already knows (Reveal Stock Take template):
// item_name · Unit · Physical Stock, the "STOCK TAKE AS OF" line under the headings, thick column rules.
// Items Zoho doesn't have are filled red, with a key under the table.

export interface TakeRow { name: string; unit: string; qty: number; inZoho: boolean }

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
/** "15th September 2026" */
export const asOfLong = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return `${ordinal(d)} ${MONTHS[m - 1]} ${y}`; };

const THICK = { style: 'thick' as const };
const THIN = { style: 'thin' as const };
const RED_FILL = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFFC7CE' } };
const RED_TEXT = 'FF9C0006';

/** Returns the .xlsx file as base64 (for the email attachment). */
export async function stockTakeExcel(date: string, rows: TakeRow[]): Promise<string> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const [, m, d] = date.split('-').map(Number);
  const ws = wb.addWorksheet(`${MONTHS[m - 1].slice(0, 3).toUpperCase()}-${d}`, { views: [{ state: 'frozen', ySplit: 2 }] });
  ws.columns = [{ width: 47.66 }, { width: 18.66 }, { width: 21.33 }];

  // Row 1: the headings.
  const head = ws.getRow(1);
  head.values = ['item_name', 'Unit', 'Physical Stock'];
  head.height = 16.8;
  head.eachCell((c, i) => {
    c.font = { name: 'Times New Roman', size: 12, bold: true };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
    c.border = { left: i === 1 ? THIN : THICK, right: THICK, top: THICK, bottom: THICK };
  });

  // Row 2: "STOCK TAKE AS OF: 19th October 2026", across all three columns.
  ws.mergeCells('A2:C2');
  const t = ws.getCell('A2');
  t.value = `STOCK TAKE AS OF: ${asOfLong(date)}`;
  t.font = { name: 'Calibri', size: 14, bold: true };
  t.alignment = { horizontal: 'center', vertical: 'middle' };
  t.border = { right: THICK, bottom: THICK };
  ws.getRow(2).height = 19.2;

  // The items.
  rows.forEach((r, i) => {
    const row = ws.getRow(3 + i);
    row.values = [r.name, r.unit, r.qty];
    const last = i === rows.length - 1;
    row.eachCell({ includeEmpty: true }, (c, col) => {
      if (col > 3) return;
      c.font = { name: 'Calibri', size: 11, ...(r.inZoho ? {} : { color: { argb: RED_TEXT } }) };
      c.border = { left: col === 1 ? undefined : THICK, right: THICK, ...(last ? { bottom: THICK } : {}) };
      if (!r.inZoho) c.fill = RED_FILL;
    });
    row.getCell(3).numFmt = Number.isInteger(r.qty) ? '0' : '0.0##';
  });

  // The key, only when something is red.
  if (rows.some((r) => !r.inZoho)) {
    const k = 3 + rows.length + 1;
    const sw = ws.getCell(`A${k}`);
    sw.value = 'Items highlighted red are not in Zoho.';
    sw.fill = RED_FILL;
    sw.font = { name: 'Calibri', size: 11, italic: true, color: { argb: RED_TEXT } };
    sw.border = { left: THIN, right: THIN, top: THIN, bottom: THIN };
  }

  const buf = await wb.xlsx.writeBuffer();
  let bin = '';
  const bytes = new Uint8Array(buf as ArrayBuffer);
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
