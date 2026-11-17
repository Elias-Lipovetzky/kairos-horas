export function flattenGroups(groups) {
  return groups.flatMap((group, groupIndex) =>
    group.rows.map((row, rowIndex) => ({
      groupIndex,
      rowIndex,
      employee_id: group.employee_id,
      row,
    })),
  );
}
export function rowLocation(groups, index) {
  const row = flattenGroups(groups)[index];
  return row ? `Persona ${row.groupIndex + 1}, registro ${row.rowIndex + 1}` : `Fila ${index + 1}`;
}
export function recordFromRow(row, employee) {
  return {
    employee_id: employee,
    place_id: row.place_id,
    date: row.date,
    start_time: row.mode === 'times' ? row.start_time : null,
    end_time: row.mode === 'times' ? row.end_time : null,
    minutes: Number(row.hours || 0) * 60 + Number(row.remainder || 0),
  };
}
export const recordsFromGroups = (groups) =>
  flattenGroups(groups).map(({ employee_id, row }) => recordFromRow(row, employee_id));
export function hasDraft(groups) {
  return groups.some(
    (g) =>
      g.employee_id ||
      g.employee_id_query ||
      g.rows.some(
        (r) =>
          r.place_id ||
          r.place_id_query ||
          r.hours ||
          r.start_time ||
          r.end_time ||
          Number(r.remainder) > 0,
      ),
  );
}
