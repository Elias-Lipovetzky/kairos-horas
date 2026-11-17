import { lockForTransaction, DATABASE_LOCKS } from '../services/locks.js';
import { randomUUID } from 'node:crypto';
import { pool, transaction } from '../db.js';
import { AppError, uuid, text } from '../domain.js';
import { admin } from '../auth.js';
import { audit } from '../services/audit.js';

export function registerCatalogRoutes(app) {
  app.get('/api/catalog', async (req, res) => {
    const results = await Promise.all([
      pool.query(`
        SELECT *
        FROM employees
        ORDER BY name,
          dni
      `),
      pool.query(
        `
          SELECT p.*,
            COALESCE(jsonb_agg(jsonb_build_object('owner_id',
            po.owner_id,
            'is_primary',
            po.is_primary,
            'name',
            o.name)) FILTER (WHERE po.owner_id IS NOT NULL),
            '[]') owners
          FROM places p
          LEFT JOIN place_owners po ON po.place_id=p.id
          LEFT JOIN owners o ON o.id=po.owner_id
          GROUP BY p.id
          ORDER BY p.name
        `,
      ),
      pool.query(`
        SELECT *
        FROM owners
        ORDER BY name
      `),
    ]);
    res.json({ employees: results[0].rows, places: results[1].rows, owners: results[2].rows });
  });
  app.post('/api/catalog/:entity', admin, async (req, res) => saveCatalog(req, res));
  app.put('/api/catalog/:entity/:id', admin, async (req, res) => saveCatalog(req, res));
}

async function saveCatalog(req, res) {
  const entity = req.params.entity;
  if (!['employees', 'places', 'owners'].includes(entity))
    throw new AppError(404, 'Entidad no encontrada.');
  const id = req.params.id ? uuid(req.params.id) : randomUUID(),
    body = req.body;
  const name = text(body.name, 'Nombre');
  const result = await transaction(async (client) => {
    await lockForTransaction(client, DATABASE_LOCKS.catalogWrites);
    let before = null;
    if (req.params.id) {
      before = (
        await client.query(
          `
            SELECT *
            FROM ${entity}
            WHERE id=$1 FOR UPDATE
          `,
          [id],
        )
      ).rows[0];
      if (!before) throw new AppError(404, 'No encontrado.');
    }
    const active = typeof body.active === 'boolean' ? body.active : (before?.active ?? true);
    if (entity === 'employees') {
      const dni = text(body.dni, 'DNI').replace(/[.\s-]/g, '');
      if (!/^\d{6,12}$/.test(dni))
        throw new AppError(400, 'DNI inválido: ingresá de 6 a 12 dígitos.');
      await client.query(
        `
          INSERT INTO employees(id,
            name,
            dni,
            phone,
            active) VALUES($1,
            $2,
            $3,
            $4,
            $5) ON CONFLICT(id)
          DO UPDATE SET name=$2,
            dni=$3,
            phone=$4,
            active=$5
        `,
        [id, name, dni, text(body.phone ?? '', 'Teléfono', false), active],
      );
    } else if (entity === 'owners') {
      if (
        !active &&
        (
          await client.query(
            `
              SELECT 1
              FROM place_owners po
              JOIN places p ON p.id=po.place_id
              WHERE po.owner_id=$1
              AND p.active
              LIMIT 1
            `,
            [id],
          )
        ).rowCount
      )
        throw new AppError(400, 'Quitá al dueño de sus lugares activos antes de desactivarlo.');
      await client.query(
        `
          INSERT INTO owners(id,
            name,
            phone,
            active) VALUES($1,
            $2,
            $3,
            $4) ON CONFLICT(id)
          DO UPDATE SET name=$2,
            phone=$3,
            active=$4
        `,
        [id, name, text(body.phone ?? '', 'Teléfono', false), active],
      );
    } else {
      if (
        !Array.isArray(body.owners) ||
        !body.owners.length ||
        body.owners.length > 100 ||
        body.owners.filter((o) => o.is_primary === true).length !== 1
      )
        throw new AppError(400, 'Elegí al menos un dueño y exactamente uno principal.');
      const ids = body.owners.map((o) => uuid(o.owner_id));
      if (new Set(ids).size !== ids.length) throw new AppError(400, 'No repitas dueños.');
      const available = await client.query(
        `
          SELECT id
          FROM owners
          WHERE id=ANY($1::uuid[])
          AND active
        `,
        [ids],
      );
      if (available.rowCount !== ids.length && active)
        throw new AppError(400, 'Los dueños deben estar activos.');
      if (before)
        before.owners = (
          await client.query(
            `
              SELECT owner_id,
                is_primary
              FROM place_owners
              WHERE place_id=$1
            `,
            [id],
          )
        ).rows;
      await client.query(
        `
          INSERT INTO places(id,
            name,
            address,
            active) VALUES($1,
            $2,
            $3,
            $4) ON CONFLICT(id)
          DO UPDATE SET name=$2,
            address=$3,
            active=$4
        `,
        [id, name, text(body.address ?? '', 'Dirección', false), active],
      );
      await client.query(
        `
          DELETE
          FROM place_owners
          WHERE place_id=$1
        `,
        [id],
      );
      for (const o of body.owners)
        await client.query(
          `
            INSERT INTO place_owners(place_id,
              owner_id,
              is_primary) VALUES($1,
              $2,
              $3)
          `,
          [id, o.owner_id, o.is_primary === true],
        );
    }
    const after = (
      await client.query(
        `
          SELECT *
          FROM ${entity}
          WHERE id=$1
        `,
        [id],
      )
    ).rows[0];
    if (entity === 'places') after.owners = body.owners;
    await audit(client, req.user.id, entity, id, before ? 'update' : 'create', before, after);
    return after;
  });
  res.json(result);
}
