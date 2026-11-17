import { normalizeRecord, warningsFor, validDate, today } from '../../server/domain.js';

// CSV with quoted commas, escaped quotes and multiline cells. Keep physical line numbers.
export function parseCsv(source) {
  const rows = [];
  let cells = [],
    cell = '',
    quoted = false,
    line = 1,
    start = 1;
  const text = source.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (quoted || !cell) quoted = !quoted;
      else throw new Error(`Comillas inesperadas en línea ${line}.`);
    } else if (c === ',' && !quoted) {
      cells.push(cell);
      cell = '';
    } else if ((c === '\n' || c === '\r') && !quoted) {
      cells.push(cell);
      rows.push({ line: start, cells });
      cells = [];
      cell = '';
      if (c === '\r' && text[i + 1] === '\n') i++;
      line++;
      start = line;
    } else {
      cell += c;
      if (c === '\n') line++;
    }
  }
  if (quoted) throw new Error('El CSV termina dentro de un campo entre comillas.');
  if (cell || cells.length) rows.push({ line: start, cells: [...cells, cell] });
  return rows;
}

const clean = (value) => (value || '').normalize('NFC').trim().replace(/\s+/g, ' ');
const comparable = (value) => clean(value).toLocaleLowerCase('es-AR');
const headerKey = (value) => comparable(value).normalize('NFD').replace(/\p{M}/gu, '');

function clock(value) {
  if (!value) return null;
  const match = value.match(/^(\d{1,2}):([0-5]\d)$/);
  if (!match || Number(match[1]) > 23) throw new Error('Horario inválido: se esperaba HH:mm.');
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

function duration(value) {
  if (!value) return null;
  const match = value.match(/^(\d+):([0-5]\d)$/);
  if (!match) throw new Error('Duración inválida: se esperaba horas:minutos.');
  return Number(match[1]) * 60 + Number(match[2]);
}

export function transformCompanyCsv(source, year, currentDay = today(), options = {}) {
  if (!Number.isInteger(year) || year < 1900 || year > 9999)
    throw new Error('Indicar un año válido.');
  const parsed = parseCsv(source);
  const headerAt = parsed.findIndex((row) => row.cells.some((v) => headerKey(v) === 'empleado'));
  if (headerAt < 0) throw new Error('No se encontró la cabecera empleado/Fecha/Lugares.');
  const headers = parsed[headerAt].cells.map(headerKey);
  for (const required of ['empleado', 'fecha', 'lugares', 'entrada', 'salida', 'horas total']) {
    if (!headers.includes(required)) throw new Error(`Falta la columna ${required}.`);
  }
  const records = [],
    ignored = [],
    quarantined = [],
    errors = [],
    notes = [];
  for (const row of parsed.slice(headerAt + 1)) {
    const get = (key) => clean(row.cells[headers.indexOf(key)]);
    const employee = get('empleado'),
      place = get('lugares'),
      date = get('fecha');
    const start = get('entrada'),
      end = get('salida'),
      total = get('horas total');
    if (!place && !date && !start && !end && (!total || /^0+:00$/.test(total))) {
      ignored.push({
        line: row.line,
        reason: employee ? 'Fila de plantilla sin trabajo' : 'Fila vacía',
      });
      continue;
    }
    try {
      if (!employee || !place || !date) throw new Error('Falta empleado, lugar o fecha.');
      const match = date.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/);
      if (!match) throw new Error('Fecha inválida: se esperaba día/mes.');
      if (match[3] && Number(match[3]) !== year)
        throw new Error('El año de la fila difiere del indicado.');
      const iso = `${year}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
      if (!validDate(iso) || iso > currentDay) throw new Error('Fecha inválida o futura.');
      const sourceMinutes = duration(total);
      if (sourceMinutes === 0 && options.quarantineZero) {
        quarantined.push({
          line: row.line,
          employee,
          place,
          date: iso,
          reason: 'Duración cero en origen',
        });
        continue;
      }
      let startTime, endTime;
      try {
        startTime = clock(start);
        endTime = clock(end);
        if (!!startTime !== !!endTime) throw new Error('Horario incompleto.');
        if (startTime && endTime <= startTime) throw new Error('Salida no posterior a entrada.');
      } catch (error) {
        if (!options.preserveTotal || !(sourceMinutes > 0)) throw error;
        startTime = endTime = null;
        notes.push({
          line: row.line,
          reason: 'invalid_times',
          source: { start, end },
          resolution: 'Solo duración de origen',
        });
      }
      if (options.preserveTotal && sourceMinutes > 0 && startTime) {
        const toMinutes = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
        const calculated = toMinutes(endTime) - toMinutes(startTime);
        if (calculated !== sourceMinutes) {
          notes.push({
            line: row.line,
            reason: 'duration_mismatch',
            source: sourceMinutes,
            calculated,
            resolution: 'Solo duración de origen',
          });
          startTime = endTime = null;
        }
      }
      const normalized = normalizeRecord(
        {
          employee_id: '11111111-1111-4111-8111-111111111111',
          place_id: '22222222-2222-4222-8222-222222222222',
          date: iso,
          start_time: startTime,
          end_time: endTime,
          minutes: sourceMinutes,
        },
        currentDay,
      );
      const weekday = new Intl.DateTimeFormat('es-AR', { weekday: 'long', timeZone: 'UTC' }).format(
        new Date(iso + 'T12:00:00Z'),
      );
      if (get('dia') && headerKey(get('dia')) !== headerKey(weekday)) {
        notes.push({
          line: row.line,
          reason: 'weekday_mismatch',
          source: get('dia'),
          calculated: weekday,
        });
      }
      if (sourceMinutes !== null && sourceMinutes !== normalized.minutes) {
        notes.push({
          line: row.line,
          reason: 'duration_mismatch',
          source: sourceMinutes,
          calculated: normalized.minutes,
        });
      }
      const billable = get('se cobran?').toUpperCase();
      if (billable && !['TRUE', 'FALSE'].includes(billable))
        throw new Error('Valor desconocido en Se cobran?.');
      records.push({
        source_line: row.line,
        employee_name: employee,
        place_name: place,
        date: normalized.date,
        start_time: normalized.start_time,
        end_time: normalized.end_time,
        minutes: normalized.minutes,
        source_minutes: sourceMinutes,
        source_billable: billable ? billable === 'TRUE' : null,
        source_start: start,
        source_end: end,
      });
    } catch (error) {
      errors.push({ line: row.line, message: error.message });
    }
  }
  const comparableRecords = records.map((r) => ({
    ...r,
    id: String(r.source_line),
    employee_id: comparable(r.employee_name),
    place_id: comparable(r.place_name),
  }));
  const warnings = comparableRecords.flatMap((r) =>
    warningsFor(r, comparableRecords).map((warning) => ({ line: r.source_line, ...warning })),
  );
  return {
    year,
    records,
    ignored,
    quarantined,
    errors,
    notes,
    warnings,
    employees: [
      ...new Map(records.map((r) => [comparable(r.employee_name), r.employee_name])).values(),
    ].sort(),
    places: [
      ...new Map(records.map((r) => [comparable(r.place_name), r.place_name])).values(),
    ].sort(),
    total_minutes: records.reduce((sum, r) => sum + r.minutes, 0),
  };
}
