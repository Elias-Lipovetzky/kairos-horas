import { AppError, uuid, validDate } from '../domain.js';

export function filters(query, alias = 'r') {
  const clauses = [`${alias}.deleted_at IS NULL`],
    params = [];
  for (const [key, column, operator] of [
    ['employee_id', 'employee_id', '='],
    ['place_id', 'place_id', '='],
    ['from', 'date', '>='],
    ['to', 'date', '<='],
  ]) {
    if (!query[key]) continue;
    if (key.endsWith('_id')) uuid(query[key]);
    else if (!validDate(query[key])) throw new AppError(400, 'Período inválido.');
    params.push(query[key]);
    clauses.push(`${alias}.${column}${operator}$${params.length}`);
  }
  if (query.from && query.to && query.from > query.to)
    throw new AppError(400, 'El inicio del período no puede ser posterior al fin.');
  return { where: clauses.join(' AND '), params };
}

export const recordSelect = `
  SELECT r.*,
    r.date::text,
    to_char(r.start_time,
    'HH24:MI') start_time,
    to_char(r.end_time,
    'HH24:MI') end_time,
    e.name employee_name,
    e.dni,
    p.name place_name
  FROM records r
  JOIN employees e ON e.id=r.employee_id
  JOIN places p ON p.id=r.place_id
`;

export async function assertEntities(client, record, before = null) {
  const employee = (
    await client.query(
      `
        SELECT active
        FROM employees
        WHERE id=$1
      `,
      [record.employee_id],
    )
  ).rows[0];
  const place = (
    await client.query(
      `
        SELECT active
        FROM places
        WHERE id=$1
      `,
      [record.place_id],
    )
  ).rows[0];
  if (
    !employee ||
    !place ||
    (!employee.active && before?.employee_id !== record.employee_id) ||
    (!place.active && before?.place_id !== record.place_id)
  )
    throw new AppError(400, 'Elegí un empleado y un lugar activos.');
}

export async function related(client, records) {
  const ids = [...new Set(records.map((r) => r.employee_id))];
  return (
    await client.query(
      `
        SELECT id,
          employee_id,
          place_id,
          date::text,
          to_char(start_time,
          'HH24:MI') start_time,
          to_char(end_time,
          'HH24:MI') end_time,
          minutes
        FROM records
        WHERE employee_id=ANY($1::uuid[])
        AND date BETWEEN $2
        AND $3
        AND deleted_at IS NULL
        ORDER BY id
      `,
      [
        ids,
        records.map((r) => r.date).sort()[0],
        records
          .map((r) => r.date)
          .sort()
          .at(-1),
      ],
    )
  ).rows;
}
