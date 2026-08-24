const { getDb } = require('../../lib/db');
const { hashPassword, createSession, setSessionCookie } = require('../../lib/auth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { name, email, phone, password } = req.body;

    if (!name || !email || !password) {
      res.status(400).json({ error: 'Name, email, and password are required.' });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters.' });
      return;
    }

    const db = getDb();
    const existing = await db.execute({
      sql: 'SELECT id FROM users WHERE email = ?',
      args: [email.toLowerCase().trim()],
    });

    if (existing.rows.length > 0) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    const passwordHash = await hashPassword(password);
    const result = await db.execute({
      sql: 'INSERT INTO users (name, email, phone, password_hash) VALUES (?, ?, ?, ?)',
      args: [name.trim(), email.toLowerCase().trim(), phone || null, passwordHash],
    });

    const userId = Number(result.lastInsertRowid);
    const token = await createSession(userId);
    setSessionCookie(res, token);

    res.status(201).json({ id: userId, name: name.trim(), email: email.toLowerCase().trim() });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Something went wrong creating your account.' });
  }
};
