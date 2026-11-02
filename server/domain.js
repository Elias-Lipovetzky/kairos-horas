export class AppError extends Error {
  constructor(status, message, details = {}) { super(message); this.status = status; this.details = details; }
}
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function uuid(value) { if (!uuidPattern.test(value || '')) throw new AppError(400,'Identificador inválido.'); return value; }
export function text(value, label, required = true) {
  if (typeof value !== 'string' || value.length > 200) throw new AppError(400, `${label}: texto inválido (máximo 200 caracteres).`);
  const clean = value.trim(); if (required && !clean) throw new AppError(400,`${label} es obligatorio.`); return clean;
}
export function today() { return new Intl.DateTimeFormat('en-CA', {timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()); }
export function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
}
export function timeMinutes(value) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value || '')) throw new AppError(400,'Horario inválido.');
  return Number(value.slice(0,2))*60 + Number(value.slice(3));
}
export function normalizeRecord(input, currentDay = today()) {
  const employee_id = uuid(input.employee_id), place_id = uuid(input.place_id);
  if (!validDate(input.date)) throw new AppError(400,'Fecha inválida.');
  if (input.date > currentDay) throw new AppError(400,'No se permiten fechas futuras.');
  const start_time = input.start_time || null, end_time = input.end_time || null;
  if (!!start_time !== !!end_time) throw new AppError(400,'Completá entrada y salida o dejá ambas vacías.');
  let minutes = Number(input.minutes);
  if (start_time) {
    minutes = timeMinutes(end_time)-timeMinutes(start_time);
    if(minutes <= 0) throw new AppError(400,'La salida debe ser posterior a la entrada del mismo día.');
  }
  if (!Number.isSafeInteger(minutes) || minutes <= 0 || minutes > 2147483647) throw new AppError(400,'La duración debe ser un número positivo de minutos dentro del rango admitido.');
  return { employee_id, place_id, date: input.date, start_time, end_time, minutes };
}
export function warningsFor(record, others) {
  const warnings = [];
  if (record.minutes > 540) warnings.push({reason:'long_duration', message:'Este registro supera las 9 horas.'});
  const comparable = others.filter(other => other.employee_id === record.employee_id && other.date === record.date && (!record.id || other.id !== record.id));
  if (comparable.some(other => other.place_id === record.place_id)) warnings.push({reason:'duplicate',message:'Hay otro registro de esta persona en el mismo lugar y fecha.'});
  if (record.start_time && comparable.some(other => other.start_time && record.start_time < other.end_time && record.end_time > other.start_time)) warnings.push({reason:'overlap',message:'El horario se superpone con otro registro de esta persona.'});
  return warnings;
}
export function duration(minutes) { return `${Math.floor(minutes/60)}:${String(minutes%60).padStart(2,'0')}`; }
