import { AppError } from '../domain.js';

// Every API response is private; mutations require our same-origin browser client.
export function guardApiRequest(req, res, next) {
  res.setHeader('Cache-Control', 'no-store');
  const isRead = ['GET', 'HEAD', 'OPTIONS'].includes(req.method);

  if (!isRead) {
    if (req.headers['x-kairos-client'] !== 'web') {
      throw new AppError(403, 'Solicitud no autorizada.');
    }
    if (req.headers['sec-fetch-site'] === 'cross-site') {
      throw new AppError(403, 'Origen no autorizado.');
    }
  }

  next();
}
