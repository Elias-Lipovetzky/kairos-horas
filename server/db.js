import pg from 'pg';
import { readFile } from 'node:fs/promises';
export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
export async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(419032)');
    await client.query(await readFile(new URL('./schema.sql', import.meta.url), 'utf8'));
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
}
export async function transaction(fn) {
  const client = await pool.connect();
  try { await client.query('BEGIN'); const result = await fn(client); await client.query('COMMIT'); return result; }
  catch(e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
}
