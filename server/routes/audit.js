import { pool } from '../db.js';
import { uuid } from '../domain.js';
import { admin } from '../auth.js';
import { chronologicalDirection } from '../services/sorting.js';

export function registerAuditRoutes(app) {
  app.get('/api/records/:id/history', async (req, res) => {
    const id = uuid(req.params.id);
    const result = await pool.query(
      `
        SELECT a.*,
          u.name user_name,
          u.email user_email
        FROM audit a
        JOIN users u ON u.id=a.user_id
        WHERE a.entity='records'
        AND a.entity_id=$1
        ORDER BY a.id DESC
      `,
      [id],
    );
    res.json(result.rows);
  });
  app.get('/api/audit', admin, async (req, res) => {
    const direction = chronologicalDirection(req.query.sort);
    const page = Math.max(0, Number.parseInt(req.query.page || '0', 10) || 0);
    res.json(
      (
        await pool.query(
          `
            SELECT a.*,
              u.name user_name
            FROM audit a
            JOIN users u ON u.id=a.user_id
            ORDER BY a.created_at ${direction}, a.id ${direction}
            LIMIT 50
            OFFSET $1
          `,
          [page * 50],
        )
      ).rows,
    );
  });
}
