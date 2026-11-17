import { pool, transaction } from '../db.js';
import { AppError } from '../domain.js';
import { passwordHash, passwordMatches, cookie, hashToken, token, rateLimit } from '../auth.js';
import { audit } from '../services/audit.js';
import { safeUser, email, mailConfigured } from '../services/accounts.js';
import nodemailer from 'nodemailer';
import { randomUUID } from 'node:crypto';
import { normalizeRegistration } from '../services/registration.js';

export function registerPublicAccessRoutes(app) {
  app.post('/api/signup', async (req, res) => {
    await rateLimit(`signup-ip:${req.ip}`, 8);
    const registration = normalizeRegistration(req.body);
    await rateLimit(`signup-email:${registration.email}`, 3);
    const hashedPassword = await passwordHash(registration.password);
    const id = randomUUID();
    await transaction(async (client) => {
      await client.query(
        `INSERT INTO users
          (id, name, email, password_hash, role, active, registration_pending)
         VALUES ($1, $2, $3, $4, 'rrhh', false, true)`,
        [id, registration.name, registration.email, hashedPassword],
      );
      await audit(client, id, 'users', id, 'signup_requested', null, {
        id,
        name: registration.name,
        email: registration.email,
        role: 'rrhh',
        active: false,
        registration_pending: true,
      });
    });
    res.json({
      message: 'Solicitud enviada. Un administrador debe activar tu cuenta antes de ingresar.',
    });
  });
  app.get('/api/health', async (req, res) => {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  });
  app.get('/api/config', (req, res) => res.json({ recoveryAvailable: mailConfigured() }));
  app.post('/api/login', async (req, res) => {
    const address = email(req.body.email);
    await rateLimit(`login-ip:${req.ip}`, 100);
    await rateLimit(`login:${address}`);
    const { rows } = await pool.query(
      `
        SELECT *
        FROM users
        WHERE email=$1
        AND active
      `,
      [address],
    );
    if (!rows[0] || !(await passwordMatches(req.body.password, rows[0].password_hash)))
      throw new AppError(401, 'Correo o contraseña incorrectos.');
    const raw = token(),
      hours = Number(process.env.SESSION_HOURS || 12);
    if (!Number.isFinite(hours) || hours <= 0) throw new Error('SESSION_HOURS inválido');
    await pool.query(
      `
        INSERT INTO sessions(token_hash,
          user_id,
          expires_at) VALUES($1,
          $2,
          now()+$3*interval '1 hour')
      `,
      [hashToken(raw), rows[0].id, hours],
    );
    cookie(res, raw, Math.floor(hours * 3600));
    res.json(safeUser(rows[0]));
  });
  app.post('/api/forgot-password', async (req, res) => {
    if (!mailConfigured())
      throw new AppError(
        503,
        'La recuperación por correo aún no está configurada. Contactá al administrador.',
      );
    await rateLimit(`recover-ip:${req.ip}`, 20);
    const address = email(req.body.email);
    await rateLimit(`recover:${address}`, 5);
    const { rows } = await pool.query(
      `
        SELECT id
        FROM users
        WHERE email=$1
        AND active
      `,
      [address],
    );
    if (rows[0]) {
      const raw = token();
      await pool.query(
        `
          INSERT INTO password_resets(token_hash,
            user_id,
            expires_at) VALUES($1,
            $2,
            now()+interval '30 minutes')
        `,
        [hashToken(raw), rows[0].id],
      );
      const transport = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === 'true',
        auth: process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
          : undefined,
      });
      try {
        await transport.sendMail({
          from: process.env.MAIL_FROM,
          to: address,
          subject: 'Kairos · Recuperar acceso',
          text: `Restablecé tu contraseña en los próximos 30 minutos: ${process.env.APP_URL.replace(/\/$/, '')}/#reset=${raw}`,
        });
      } catch (e) {
        await pool.query(
          `
            DELETE
            FROM password_resets
            WHERE token_hash=$1
          `,
          [hashToken(raw)],
        );
        console.error('No se pudo entregar un correo de recuperación.');
      }
    }
    res.json({
      message:
        'Si la cuenta está activa, recibirás un enlace de recuperación. Si no llega, contactá al administrador.',
    });
  });
  app.post('/api/reset-password', async (req, res) => {
    await rateLimit(`reset:${req.ip}`, 30);
    if (typeof req.body.token !== 'string' || !/^[a-f0-9]{64}$/.test(req.body.token))
      throw new AppError(400, 'Enlace inválido.');
    const hashed = await passwordHash(req.body.password);
    await transaction(async (client) => {
      const { rows } = await client.query(
        `
          DELETE
          FROM password_resets
          WHERE token_hash=$1
          AND expires_at>now()
          RETURNING user_id
        `,
        [hashToken(req.body.token)],
      );
      if (!rows[0]) throw new AppError(400, 'El enlace venció o ya fue utilizado.');
      const user = await client.query(
        `
          SELECT id
          FROM users
          WHERE id=$1
          AND active FOR UPDATE
        `,
        [rows[0].user_id],
      );
      if (!user.rows[0]) throw new AppError(400, 'Cuenta no disponible.');
      await client.query(
        `
          UPDATE users
          SET password_hash=$1
          WHERE id=$2
        `,
        [hashed, rows[0].user_id],
      );
      await client.query(
        `
          DELETE
          FROM sessions
          WHERE user_id=$1
        `,
        [rows[0].user_id],
      );
      await client.query(
        `
          DELETE
          FROM password_resets
          WHERE user_id=$1
        `,
        [rows[0].user_id],
      );
      await audit(client, rows[0].user_id, 'users', rows[0].user_id, 'password_reset', null, {
        password_changed: true,
      });
    });
    res.json({ message: 'Contraseña actualizada. Ya podés iniciar sesión.' });
  });
}

export function registerSessionRoutes(app) {
  app.get('/api/me', (req, res) => res.json(req.user));
  app.post('/api/logout', async (req, res) => {
    await pool.query(
      `
        DELETE
        FROM sessions
        WHERE token_hash=$1
      `,
      [req.sessionHash],
    );
    cookie(res, '');
    res.json({ ok: true });
  });
}
