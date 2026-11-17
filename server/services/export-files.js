import { formatDate } from '../../shared/dates.js';
import { duration } from '../domain.js';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

export async function writeWorkbook(res, rows, total) {
  res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  const book = new ExcelJS.Workbook(),
    sheet = book.addWorksheet('Horas');
  sheet.columns = [
    { header: 'Empleado', key: 'employee_name', width: 28 },
    { header: 'DNI', key: 'dni', width: 16 },
    { header: 'Fecha', key: 'date', width: 14 },
    { header: 'Día', key: 'weekday', width: 16 },
    { header: 'Lugar', key: 'place_name', width: 28 },
    { header: 'Entrada', key: 'start_time', width: 12 },
    { header: 'Salida', key: 'end_time', width: 12 },
    { header: 'Duración', key: 'hours', width: 16 },
  ];
  for (const r of rows)
    sheet.addRow({
      ...r,
      date: formatDate(r.date),
      weekday: weekday(r.date),
      hours: r.minutes / 1440,
    });
  sheet.getColumn('hours').numFmt = '[h]:mm';
  sheet.addRow({ employee_name: 'TOTAL', hours: total / 1440 });
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  await book.xlsx.write(res);
  res.end();
}

export function writePdf(res, rows, total, query) {
  res.type('application/pdf');
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 32 });
  doc.pipe(res);
  doc.fontSize(20).text('Kairos | Registro de horas');
  doc
    .fontSize(10)
    .text(
      `Período: ${formatDate(query.from) || 'sin inicio'} a ${formatDate(query.to) || 'sin fin'} · ${rows.length} registros`,
    );
  doc.moveDown();
  const xs = [32, 185, 250, 322, 400, 570, 635, 700],
    widths = [148, 60, 68, 74, 164, 60, 60, 100];
  function header() {
    const y = doc.y;
    ['Empleado', 'DNI', 'Fecha', 'Día', 'Lugar', 'Entrada', 'Salida', 'Duración'].forEach((s, i) =>
      doc.font('Helvetica-Bold').fontSize(9).text(s, xs[i], y, { width: widths[i] }),
    );
    doc.y = y + 22;
  }
  header();
  for (const r of rows) {
    const cells = [
      r.employee_name,
      r.dni,
      formatDate(r.date),
      weekday(r.date),
      r.place_name,
      r.start_time || '',
      r.end_time || '',
      duration(r.minutes),
    ];
    doc.font('Helvetica').fontSize(9);
    const height = Math.max(
      22,
      ...cells.map((s, i) => doc.heightOfString(String(s), { width: widths[i] }) + 8),
    );
    if (doc.y + height > doc.page.height - 55) {
      doc.addPage();
      header();
    }
    const y = doc.y;
    cells.forEach((s, i) => doc.text(String(s), xs[i], y, { width: widths[i] }));
    doc.y = y + height;
  }
  if (doc.y > doc.page.height - 70) doc.addPage();
  doc
    .font('Helvetica-Bold')
    .fontSize(12)
    .text(`Total: ${duration(total)} horas`, 32, doc.y + 10);
  doc.end();
}

function weekday(date) {
  return new Intl.DateTimeFormat('es-AR', { weekday: 'long', timeZone: 'UTC' }).format(
    new Date(`${date}T12:00:00Z`),
  );
}
