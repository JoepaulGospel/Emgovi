const { getUserFromRequest } = require('../../lib/auth');

module.exports = async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      res.status(200).json({ user: null });
      return;
    }
    res.status(200).json({ user });
  } catch (err) {
    console.error('Session check error:', err);
    res.status(500).json({ error: 'Something went wrong checking your session.' });
  }
};
