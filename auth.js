const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { getDb } = require('./db');

const SESSION_DAYS = 30;
const COOKIE_NAME = 'emgovi_session';

async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

async function createSession(userId) {
  const db = getDb();
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await db.execute({
    sql: 'INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)',
    args: [token, userId, expiresAt],
  });
  return token;
}

async function getUserFromRequest(req) {
  const cookies = parseCookies(req.headers.cookie || '');
  const token = cookies[COOKIE_NAME];
  if (!token) return null;

  const db = getDb();
  const result = await db.execute({
    sql: `SELECT users.id, users.name, users.email, users.phone, sessions.expires_at
          FROM sessions JOIN users ON users.id = sessions.user_id
          WHERE sessions.token = ?`,
    args: [token],
  });

  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  if (new Date(row.expires_at) < new Date()) return null;

  return { id: row.id, name: row.name, email: row.email, phone: row.phone };
}

async function destroySession(req) {
  const cookies = parseCookies(req.headers.cookie || '');
  const token = cookies[COOKIE_NAME];
  if (!token) return;
  const db = getDb();
  await db.execute({ sql: 'DELETE FROM sessions WHERE token = ?', args: [token] });
}

function setSessionCookie(res, token) {
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`
  );
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`);
}

function parseCookies(cookieHeader) {
  const out = {};
  cookieHeader.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(val);
  });
  return out;
}

function checkAdminPin(req) {
  const pin = req.headers['x-admin-pin'];
  return pin && pin === process.env.ADMIN_PIN;
}

module.exports = {
  hashPassword,
  verifyPassword,
  createSession,
  getUserFromRequest,
  destroySession,
  setSessionCookie,
  clearSessionCookie,
  checkAdminPin,
};
