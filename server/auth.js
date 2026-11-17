import { randomBytes, scrypt as scryptCb, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { pool } from './db.js';
import { AppError } from './domain.js';
const scrypt = promisify(scryptCb);
export const hashToken = (token) => createHash('sha256').update(token).digest('hex');
export const token = () => randomBytes(32).toString('hex');
export async function passwordHash(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 200)
    throw new AppError(400, 'La contraseña debe tener entre 12 y 200 caracteres.');
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${(await scrypt(password, salt, 64)).toString('hex')}`;
}
export async function passwordMatches(password, stored) {
  if (typeof password !== 'string' || password.length > 200) return false;
  const [salt, hex] = stored.split(':');
  const candidate = await scrypt(password, salt, 64);
  const original = Buffer.from(hex, 'hex');
  return original.length === candidate.length && timingSafeEqual(original, candidate);
}
export function cookie(res, value, seconds = 0) {
  res.setHeader(
    'Set-Cookie',
    `kairos=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${seconds}${process.env.COOKIE_SECURE === 'true' ? '; Secure' : ''}`,
  );
}
export async function authenticated(req, res, next) {
  const raw = req.headers.cookie
    ?.split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith('kairos='))
    ?.slice(7);
  if (!raw) throw new AppError(401, 'Iniciá sesión para continuar.');
  const { rows } = await pool.query(
    `
      SELECT u.id,
        u.name,
        u.email,
        u.role
      FROM sessions s
      JOIN users u ON u.id=s.user_id
      WHERE s.token_hash=$1
      AND s.expires_at>now()
      AND u.active
    `,
    [hashToken(raw)],
  );
  if (!rows[0]) throw new AppError(401, 'La sesión venció. Volvé a ingresar.');
  req.user = rows[0];
  req.sessionHash = hashToken(raw);
  next();
}
export function admin(req, res, next) {
  if (req.user.role !== 'admin')
    throw new AppError(403, 'Esta operación requiere un administrador.');
  next();
}
export async function rateLimit(key, max = 15) {
  const { rows } = await pool.query(
    `
      INSERT INTO login_attempts(key,
        attempts,
        resets_at) VALUES($1,
        1,
        now()+interval '15 minutes') ON CONFLICT(key)
      DO UPDATE SET attempts=CASE WHEN login_attempts.resets_at < now() THEN 1 ELSE login_attempts.attempts+1 END,
        resets_at=CASE WHEN login_attempts.resets_at < now() THEN now()+interval '15 minutes' ELSE login_attempts.resets_at END
      RETURNING attempts
    `,
    [key],
  );
  if (rows[0].attempts > max)
    throw new AppError(429, 'Demasiados intentos. Intentá nuevamente en 15 minutos.');
}
