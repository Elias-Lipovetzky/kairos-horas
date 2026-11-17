import { app } from './app.js';
import { pool, migrate } from './db.js';

// Only this entry point starts migrations, the HTTP server, and background cleanup.
await migrate();
const server = app.listen(Number(process.env.PORT || 3000), '0.0.0.0', () =>
  console.log('Kairos disponible en puerto ' + (process.env.PORT || 3000)),
);
const cleanup = setInterval(
  () =>
    pool
      .query(
        `
          DELETE
          FROM sessions
          WHERE expires_at<now(); DELETE
          FROM password_resets
          WHERE expires_at<now(); DELETE
          FROM login_attempts
          WHERE resets_at<now()
        `,
      )
      .catch(() => {}),
  3600000,
);
cleanup.unref();
process.on('SIGTERM', () => server.close(() => pool.end()));
