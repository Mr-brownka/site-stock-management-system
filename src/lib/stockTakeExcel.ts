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

/** The same template as a PDF: headings, the "STOCK TAKE AS OF" line, thick column rules, red rows for items Zoho doesn't have. */
export async function stockTakePdf(date: string, rows: TakeRow[], site: string): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  doc.setFont('times', 'bold'); doc.setFontSize(11);
  doc.text(`${site} store`, 40, 34);
  autoTable(doc, {
    startY: 44,
    margin: { left: 40, right: 40 },
    head: [['item_name', 'Unit', 'Physical Stock'], [{ content: `STOCK TAKE AS OF: ${asOfLong(date)}`, colSpan: 3, styles: { halign: 'center', font: 'helvetica', fontSize: 12, fillColor: [255, 255, 255] } }]],
    body: rows.map((r) => [r.name, r.unit, Number.isInteger(r.qty) ? String(r.qty) : String(Math.round(r.qty * 1000) / 1000)]),
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 10, textColor: [20, 20, 20], lineColor: [0, 0, 0], lineWidth: 0.6, cellPadding: { top: 4, bottom: 4, left: 6, right: 6 } },
    headStyles: { font: 'times', fontStyle: 'bold', fontSize: 11.5, fillColor: [245, 245, 245], textColor: [0, 0, 0], lineWidth: 1.6 },
    columnStyles: { 0: { cellWidth: (W - 80) * 0.54 }, 1: { cellWidth: (W - 80) * 0.21 }, 2: { cellWidth: (W - 80) * 0.25 } },
    didParseCell: (c) => {
      if (c.section === 'body' && !rows[c.row.index]?.inZoho) { c.cell.styles.fillColor = [255, 199, 206]; c.cell.styles.textColor = [156, 0, 6]; }
    },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let y = ((doc as any).lastAutoTable?.finalY ?? 60) + 16;
  if (rows.some((r) => !r.inZoho)) {
    doc.setFillColor(255, 199, 206); doc.rect(40, y - 11, 210, 16, 'F');
    doc.setFont('helvetica', 'italic'); doc.setFontSize(10); doc.setTextColor(156, 0, 6);
    doc.text('Items highlighted red are not in Zoho.', 46, y); y += 20;
  }
  return doc.output('blob');
}

/** Save a file to the computer. */
export function saveFile(name: string, data: Blob) {
  const url = URL.createObjectURL(data);
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export const b64ToBlob = (b64: string, type: string) => { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], { type }); };
