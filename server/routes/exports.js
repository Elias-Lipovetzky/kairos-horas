import { pool } from '../db.js';
import { AppError } from '../domain.js';
import { filters, recordSelect } from '../services/records.js';
import { writeWorkbook, writePdf } from '../services/export-files.js';
import { sortOrder } from '../services/sorting.js';
import { exportFilename, exportDisposition } from '../../shared/export-names.js';

export function registerExportRoutes(app) {
  app.get('/api/export/:format', async (req, res) => {
    if (!['xlsx', 'pdf'].includes(req.params.format)) throw new AppError(400, 'Formato inválido.');
    const { where, params } = filters(req.query);
    const order = req.query.sort ? sortOrder(req.query.sort) : 'e.name,r.date,p.name';
    const { rows } = await pool.query(
      `${recordSelect} WHERE ${where} ORDER BY ${order} LIMIT 10001`,
      params,
    );
    if (rows.length > 10000)
      throw new AppError(400, 'La exportación supera 10.000 registros. Acotá el período.');
    const total = rows.reduce((n, r) => n + r.minutes, 0);
    let names = {};
    if (req.query.employee_id || req.query.place_id) {
      // Resolve the applied filters even when the export has no matching records.
      const result = await pool.query(
        `SELECT (SELECT name FROM employees WHERE id=$1) employee,
          (SELECT name FROM places WHERE id=$2) place`,
        [req.query.employee_id || null, req.query.place_id || null],
      );
      names = result.rows[0];
    }
    const filename = exportFilename(
      {
        employee: req.query.employee_id ? names.employee || 'empleado' : '',
        place: req.query.place_id ? names.place || 'lugar' : '',
        from: req.query.from,
        to: req.query.to,
      },
      req.params.format,
    );
    res.setHeader('Content-Disposition', exportDisposition(filename));
    if (req.params.format === 'xlsx') await writeWorkbook(res, rows, total);
    else writePdf(res, rows, total, req.query);
  });
}
