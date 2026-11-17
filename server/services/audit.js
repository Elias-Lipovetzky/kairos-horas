export async function audit(client, userId, entity, id, action, before, after) {
  const { rows } = await client.query(
    `
      INSERT INTO audit(user_id,
        entity,
        entity_id,
        action,
        before_data,
        after_data) VALUES($1,
        $2,
        $3,
        $4,
        $5,
        $6)
      RETURNING id
    `,
    [userId, entity, id, action, before, after],
  );
  return rows[0].id;
}

export async function notify(client, userId, id, action, before, after, warnings = []) {
  const aid = await audit(client, userId, 'records', id, action, before, after);
  for (const reason of [action, ...warnings.map((w) => w.reason)])
    await client.query(
      `
        INSERT INTO notifications(record_id,
          audit_id,
          reason,
          details) VALUES($1,
          $2,
          $3,
          $4)
      `,
      [id, aid, reason, { warnings }],
    );
}
