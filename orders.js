const { getDb } = require('../lib/db');
const { getUserFromRequest, checkAdminPin } = require('../lib/auth');

async function attachItems(db, orders) {
  if (orders.length === 0) return [];
  const result = await db.execute('SELECT * FROM order_items');
  const itemsByOrder = {};
  for (const item of result.rows) {
    if (!itemsByOrder[item.order_id]) itemsByOrder[item.order_id] = [];
    itemsByOrder[item.order_id].push(item);
  }
  return orders.map((o) => ({ ...o, items: itemsByOrder[o.id] || [] }));
}

module.exports = async (req, res) => {
  const db = getDb();

  try {
    if (req.method === 'GET') {
      const isAdmin = checkAdminPin(req);

      if (isAdmin) {
        const result = await db.execute('SELECT * FROM orders ORDER BY created_at DESC');
        const withItems = await attachItems(db, result.rows);
        res.status(200).json(withItems);
        return;
      }

      const user = await getUserFromRequest(req);
      if (!user) {
        res.status(401).json({ error: 'Please log in to view your orders.' });
        return;
      }

      const result = await db.execute({
        sql: 'SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC',
        args: [user.id],
      });
      const withItems = await attachItems(db, result.rows);
      res.status(200).json(withItems);
      return;
    }

    if (req.method === 'PUT') {
      if (!checkAdminPin(req)) {
        res.status(401).json({ error: 'Admin PIN required.' });
        return;
      }
      const { id, status } = req.body;
      const allowed = ['Paid', 'Processing', 'Out for Delivery', 'Delivered'];
      if (!id || !allowed.includes(status)) {
        res.status(400).json({ error: 'A valid order id and status are required.' });
        return;
      }
      await db.execute({ sql: 'UPDATE orders SET status = ? WHERE id = ?', args: [status, id] });
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Orders API error:', err);
    res.status(500).json({ error: 'Something went wrong handling that order request.' });
  }
};
