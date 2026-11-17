import { AppError } from '../domain.js';

export const sortValues = [
  'date_desc',
  'date_asc',
  'employee_asc',
  'employee_desc',
  'place_asc',
  'place_desc',
];

export function chronologicalDirection(value = 'date_desc') {
  if (!['date_desc', 'date_asc'].includes(value)) throw new AppError(400, 'Orden no válido.');
  return value === 'date_asc' ? 'ASC' : 'DESC';
}

export function sortOrder(value, notifications = false) {
  const key = value || 'date_desc';
  if (!sortValues.includes(key)) throw new AppError(400, 'Orden no válido.');
  const prefix = notifications ? 'n' : 'r';
  const date = notifications ? 'n.created_at' : 'r.date';
  const tie = `${prefix}.id`;
  if (key === 'date_desc')
    return `${date} DESC, ${notifications ? '' : 'r.created_at DESC, '}${tie} DESC`;
  if (key === 'date_asc')
    return `${date} ASC, ${notifications ? '' : 'r.created_at ASC, '}${tie} ASC`;
  const field = key.startsWith('employee') ? 'e.name' : 'p.name';
  const direction = key.endsWith('_asc') ? 'ASC' : 'DESC';
  // Case/accent independent Spanish ordering; ñ follows n and precedes o.
  const name = `replace(translate(lower(${field}), 'áéíóúü', 'aeiouu'), 'ñ', 'n~') COLLATE "C"`;
  return `${name} ${direction}, ${date} DESC, ${tie} DESC`;
}
