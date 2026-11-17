import { lockForTransaction, DATABASE_LOCKS } from '../services/locks.js';
import { randomUUID } from 'node:crypto';
import { pool, transaction } from '../db.js';
import { AppError, uuid, text } from '../domain.js';
import { admin, passwordHash } from '../auth.js';
import { audit } from '../services/audit.js';
import { email } from '../services/accounts.js';

export function registerUserRoutes(app) {
  app.get('/api/users', admin, async (req, res) =>
    res.json(
      (
        await pool.query(`
          SELECT id,
            name,
            email,
            role,
            active,
            registration_pending
          FROM users
          ORDER BY name
        `)
      ).rows,
    ),
  );
  app.post('/api/users', admin, async (req, res) => saveUser(req, res));
  app.put('/api/users/:id', admin, async (req, res) => saveUser(req, res));
}

async function saveUser(req, res) {
  const id = req.params.id ? uuid(req.params.id) : randomUUID(),
    input = req.body;
  const name = text(input.name, 'Nombre'),
    address = email(input.email);
  if (!['admin', 'rrhh'].includes(input.role) || typeof input.active !== 'boolean')
    throw new AppError(400, 'Rol o estado inválido.');
  const hashed = input.password ? await passwordHash(input.password) : null;
  if (!req.params.id && !hashed) throw new AppError(400, 'La contraseña inicial es obligatoria.');
  await transaction(async (client) => {
    await lockForTransaction(client, DATABASE_LOCKS.userAdministration);
    const before = (
      await client.query(
        `
          SELECT id,
            name,
            email,
            role,
            active,
            registration_pending
          FROM users
          WHERE id=$1 FOR UPDATE
        `,
        [id],
      )
    ).rows[0];
    if (req.params.id && !before) throw new AppError(404, 'Cuenta no encontrada.');
    if (before?.role === 'admin' && before.active && (!input.active || input.role !== 'admin')) {
      const others = await client.query(
        `
          SELECT id
          FROM users
          WHERE active
          AND role='admin'
          AND id<>$1
        `,
        [id],
      );
      if (!others.rowCount)
        throw new AppError(400, 'Debe quedar al menos un administrador activo.');
    }
    await client.query(
      `
        INSERT INTO users(id,
          name,
          email,
          password_hash,
          role,
          active) VALUES($1,
          $2,
          $3,
          $4,
          $5,
          $6) ON CONFLICT(id)
        DO UPDATE SET name=$2,
          email=$3,
          password_hash=COALESCE($4,
          users.password_hash),
          role=$5,
          active=$6,
          registration_pending=CASE WHEN $6 THEN false ELSE users.registration_pending END
      `,
      [id, name, address, hashed, input.role, input.active],
    );
    if (before && (hashed || !input.active || before.role !== input.role)) {
      await client.query(
        `
          DELETE
          FROM sessions
          WHERE user_id=$1
        `,
        [id],
      );
      await client.query(
        `
          DELETE
          FROM password_resets
          WHERE user_id=$1
        `,
        [id],
      );
    }
    await audit(client, req.user.id, 'users', id, before ? 'update' : 'create', before, {
      id,
      name,
      email: address,
      role: input.role,
      active: input.active,
      registration_pending: input.active ? false : (before?.registration_pending ?? false),
      password_changed: Boolean(hashed),
    });
  });
  res.json({ ok: true });
}
