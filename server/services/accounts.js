import { AppError, text } from '../domain.js';

export const safeUser = (row) => ({
  id: row.id,
  name: row.name,
  email: row.email,
  role: row.role,
  active: row.active,
});

export const email = (value) => {
  const clean = text(value, 'Correo').toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) throw new AppError(400, 'Correo inválido.');
  return clean;
};

export const mailConfigured = () =>
  Boolean(process.env.SMTP_HOST && process.env.MAIL_FROM && process.env.APP_URL);
