import { lockForTransaction, DATABASE_LOCKS } from '../services/locks.js';
import { randomUUID } from 'node:crypto';
import { pool, transaction } from '../db.js';
import { AppError, uuid, normalizeRecord, warningsFor } from '../domain.js';
import { hashToken } from '../auth.js';
import { notify } from '../services/audit.js';
import { filters, recordSelect, assertEntities, related } from '../services/records.js';
import { sortOrder } from '../services/sorting.js';

export function registerRecordRoutes(app) {
  app.get('/api/records', async (req, res) => {
    const { where, params } = filters(req.query);
    const order = sortOrder(req.query.sort);
    const page = Math.max(0, Number.parseInt(req.query.page || '0', 10) || 0);
    const count = await pool.query(
      `
        SELECT count(*)::int count,
          COALESCE(sum(r.minutes),
          0)::bigint minutes
        FROM records r
        WHERE ${where}
      `,
      params,
    );
    const { rows } = await pool.query(
      `${recordSelect} WHERE ${where} ORDER BY ${order} LIMIT 50 OFFSET $${params.length + 1}`,
      [...params, page * 50],
    );
    res.json({
      records: rows,
      count: count.rows[0].count,
      minutes: Number(count.rows[0].minutes),
      page,
    });
  });
  app.post('/api/records/batch', async (req, res) => {
    const body = req.body,
      submissionId = uuid(body.submission_id);
    if (!Array.isArray(body.records) || !body.records.length || body.records.length > 100)
      throw new AppError(400, 'El lote debe contener de 1 a 100 filas.');
    const errors = [];
    const rows = body.records.map((r, i) => {
      try {
        return normalizeRecord(r);
      } catch (e) {
        errors.push({ row: i, message: e.message });
        return null;
      }
    });
    if (errors.length) throw new AppError(400, 'Corregí las filas señaladas.', { errors });
    const payloadHash = hashToken(JSON.stringify(rows));
    const result = await transaction(async (client) => {
      // Serialize writes and catalog deactivation so warnings and retries see a consistent state.
      await lockForTransaction(client, DATABASE_LOCKS.recordWrites);
      await lockForTransaction(client, DATABASE_LOCKS.catalogWrites);
      const existing = (
        await client.query(
          `
            SELECT *
            FROM submissions
            WHERE id=$1
          `,
          [submissionId],
        )
      ).rows[0];
      if (existing) {
        if (existing.user_id !== req.user.id || existing.payload_hash !== payloadHash)
          throw new AppError(
            409,
            'La solicitud anterior ya se guardó con otros datos. Revisá los registros antes de volver a guardar este lote.',
            { reset_submission: true },
          );
        return existing.result;
      }
      for (let i = 0; i < rows.length; i++) {
        try {
          await assertEntities(client, rows[i]);
        } catch (e) {
          errors.push({ row: i, message: e.message });
        }
      }
      if (errors.length) throw new AppError(400, 'Corregí las filas señaladas.', { errors });
      const stored = await related(client, rows);
      const warnings = rows.flatMap((r, i) =>
        warningsFor({ ...r, id: `new-${i}` }, [
          ...stored,
          ...rows.map((v, j) => ({ ...v, id: `new-${j}` })),
        ]).map((w) => ({ ...w, row: i })),
      );
      if (
        warnings.length &&
        body.warning_token !== hashToken(JSON.stringify({ rows, warnings, stored }))
      )
        throw new AppError(409, 'Revisá las advertencias y confirmá para guardar.', {
          warnings,
          warning_token: hashToken(JSON.stringify({ rows, warnings, stored })),
        });
      const ids = [];
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i],
          id = randomUUID();
        const after = (
          await client.query(
            `
              INSERT INTO records(id,
                employee_id,
                place_id,
                date,
                start_time,
                end_time,
                minutes,
                created_by) VALUES($1,
                $2,
                $3,
                $4,
                $5,
                $6,
                $7,
                $8)
              RETURNING *
            `,
            [
              id,
              r.employee_id,
              r.place_id,
              r.date,
              r.start_time,
              r.end_time,
              r.minutes,
              req.user.id,
            ],
          )
        ).rows[0];
        await notify(
          client,
          req.user.id,
          id,
          'create',
          null,
          after,
          warnings.filter((w) => w.row === i),
        );
        ids.push(id);
      }
      const result = { ids, message: `Se guardaron ${ids.length} registros.` };
      await client.query(
        `
          INSERT INTO submissions(id,
            user_id,
            payload_hash,
            result) VALUES($1,
            $2,
            $3,
            $4)
        `,
        [submissionId, req.user.id, payloadHash, result],
      );
      return result;
    });
    res.json(result);
  });
  app.put('/api/records/:id', async (req, res) => {
    const id = uuid(req.params.id),
      record = normalizeRecord(req.body);
    await transaction(async (client) => {
      await lockForTransaction(client, DATABASE_LOCKS.recordWrites);
      await lockForTransaction(client, DATABASE_LOCKS.catalogWrites);
      const before = (
        await client.query(
          `
            SELECT *
            FROM records
            WHERE id=$1
            AND deleted_at IS NULL FOR UPDATE
          `,
          [id],
        )
      ).rows[0];
      if (!before) throw new AppError(404, 'Registro no encontrado.');
      if (before.version !== req.body.version)
        throw new AppError(409, 'Otra persona modificó este registro. Volvé a consultarlo.');
      await assertEntities(client, record, before);
      const stored = await related(client, [record]);
      const warnings = warningsFor({ ...record, id }, stored);
      const expected = hashToken(
        JSON.stringify({ record, warnings, stored, version: before.version }),
      );
      if (warnings.length && req.body.warning_token !== expected)
        throw new AppError(409, 'Revisá las advertencias y confirmá.', {
          warnings,
          warning_token: expected,
        });
      const after = (
        await client.query(
          `
            UPDATE records
            SET employee_id=$2,
              place_id=$3,
              date=$4,
              start_time=$5,
              end_time=$6,
              minutes=$7,
              version=version+1,
              updated_at=now()
            WHERE id=$1
            RETURNING *
          `,
          [
            id,
            record.employee_id,
            record.place_id,
            record.date,
            record.start_time,
            record.end_time,
            record.minutes,
          ],
        )
      ).rows[0];
      await notify(client, req.user.id, id, 'update', before, after, warnings);
    });
    res.json({ message: 'Registro actualizado.' });
  });
  app.delete('/api/records/:id', async (req, res) => {
    const id = uuid(req.params.id);
    await transaction(async (client) => {
      await lockForTransaction(client, DATABASE_LOCKS.recordWrites);
      const before = (
        await client.query(
          `
            SELECT *
            FROM records
            WHERE id=$1
            AND deleted_at IS NULL FOR UPDATE
          `,
          [id],
        )
      ).rows[0];
      if (!before) throw new AppError(404, 'Registro no encontrado.');
      if (before.version !== req.body.version)
        throw new AppError(409, 'El registro cambió. Volvé a consultarlo antes de eliminarlo.');
      const after = (
        await client.query(
          `
            UPDATE records
            SET deleted_at=now(),
              deleted_by=$2,
              updated_at=now(),
              version=version+1
            WHERE id=$1
            RETURNING *
          `,
          [id, req.user.id],
        )
      ).rows[0];
      await notify(client, req.user.id, id, 'delete', before, after);
    });
    res.json({ message: 'Registro eliminado. Su historial se conserva.' });
  });
}
