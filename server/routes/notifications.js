import { pool } from '../db.js';
import { AppError, uuid, validDate } from '../domain.js';
import { admin } from '../auth.js';
import { sortOrder } from '../services/sorting.js';

export function registerNotificationRoutes(app) {
  app.get('/api/notifications', admin, async (req, res) => {
    const order = sortOrder(req.query.sort, true);
    const params = [],
      clauses = ['true'];
    for (const [key, col] of [
      ['reason', 'n.reason'],
      ['user_id', 'a.user_id'],
      ['employee_id', 'r.employee_id'],
      ['place_id', 'r.place_id'],
    ])
      if (req.query[key]) {
        if (key.endsWith('_id')) uuid(req.query[key]);
        params.push(req.query[key]);
        clauses.push(`${col}=$${params.length}`);
      }
    if (req.query.state === 'pending') clauses.push('n.reviewed_at IS NULL');
    if (req.query.state === 'reviewed') clauses.push('n.reviewed_at IS NOT NULL');
    for (const [key, op] of [
      ['from', '>='],
      ['to', '<='],
    ])
      if (req.query[key]) {
        if (!validDate(req.query[key])) throw new AppError(400, 'Fecha inválida.');
        params.push(req.query[key]);
        clauses.push(
          `(n.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date ${op} $${params.length}::date`,
        );
      }
    const page = Math.max(0, Number.parseInt(req.query.page || '0', 10) || 0);
    const base = `FROM notifications n JOIN audit a ON a.id=n.audit_id JOIN users u ON u.id=a.user_id JOIN records r ON r.id=n.record_id JOIN employees e ON e.id=r.employee_id JOIN places p ON p.id=r.place_id WHERE ${clauses.join(' AND ')}`;
    const count = (
      await pool.query(
        `
          SELECT count(*)::int count ${base}
        `,
        params,
      )
    ).rows[0].count;
    const { rows } = await pool.query(
      `
        SELECT n.*,
          u.name user_name,
          e.name employee_name,
          p.name place_name,
          r.date::text record_date,
          r.deleted_at,
          a.before_data,
          a.after_data ${base}
        ORDER BY ${order}
        LIMIT 50
        OFFSET $${params.length + 1}
      `,
      [...params, page * 50],
    );
    res.json({ notifications: rows, count, page });
  });
  app.post('/api/notifications/:id/review', admin, async (req, res) => {
    if (!/^\d+$/.test(req.params.id)) throw new AppError(400, 'Identificador inválido.');
    await pool.query(
      `
        UPDATE notifications
        SET reviewed_at=now(),
          reviewed_by=$2
        WHERE id=$1
        AND reviewed_at IS NULL
      `,
      [req.params.id, req.user.id],
    );
    res.json({ ok: true });
  });
}
