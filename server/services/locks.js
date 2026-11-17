// These stable IDs coordinate writes across all running application processes.
// Changing an ID while another version is running would create a different lock.
export const DATABASE_LOCKS = Object.freeze({
  schemaMigration: 419032,
  recordWrites: 419033,
  catalogWrites: 419034,
  userAdministration: 419035,
});

// PostgreSQL releases a transaction lock automatically on COMMIT or ROLLBACK.
// Call only after BEGIN, using the transaction's own client.
export async function lockForTransaction(client, lockId) {
  await client.query('SELECT pg_advisory_xact_lock($1)', [lockId]);
}
