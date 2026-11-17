import { guardApiRequest } from './middleware/request-security.js';
import { handleApiError } from './middleware/errors.js';
import express from 'express';
import helmet from 'helmet';
import { fileURLToPath } from 'node:url';
import { authenticated } from './auth.js';
import { registerPublicAccessRoutes, registerSessionRoutes } from './routes/access.js';
import { registerCatalogRoutes } from './routes/catalog.js';
import { registerUserRoutes } from './routes/users.js';
import { registerRecordRoutes } from './routes/records.js';
import { registerAuditRoutes } from './routes/audit.js';
import { registerNotificationRoutes } from './routes/notifications.js';
import { registerExportRoutes } from './routes/exports.js';

export const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        'script-src': ["'self'"],
        'style-src': ["'self'"],
        'upgrade-insecure-requests': null,
      },
    },
  }),
);
app.use(express.json({ limit: '512kb' }));
app.use('/api', guardApiRequest);

// Public endpoints must be registered before the session middleware.
registerPublicAccessRoutes(app);
app.use('/api', authenticated);
registerSessionRoutes(app);
registerCatalogRoutes(app);
registerUserRoutes(app);
registerRecordRoutes(app);
registerAuditRoutes(app);
registerNotificationRoutes(app);
registerExportRoutes(app);

app.use(express.static(fileURLToPath(new URL('../public', import.meta.url))));
app.use('/shared', express.static(fileURLToPath(new URL('../shared', import.meta.url))));
app.use('/api', (req, res) => res.status(404).json({ message: 'Ruta no encontrada.' }));
app.use(handleApiError);
