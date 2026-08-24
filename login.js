const { getDb } = require('../../lib/db');
const { verifyPassword, createSession, setSessionCookie } = require('../../lib/auth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    const db = getDb();
    const result = await db.execute({
      sql: 'SELECT id, name, email, phone, password_hash FROM users WHERE email = ?',
      args: [email.toLowerCase().trim()],
    });

    if (result.rows.length === 0) {
      res.status(401).json({ error: 'Incorrect email or password.' });
      return;
    }

    const user = result.rows[0];
    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      res.status(401).json({ error: 'Incorrect email or password.' });
      return;
    }

    const token = await createSession(user.id);
    setSessionCookie(res, token);

    res.status(200).json({ id: user.id, name: user.name, email: user.email });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Something went wrong logging you in.' });
  }
};
