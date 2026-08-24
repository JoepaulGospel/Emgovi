const { getDb } = require('../lib/db');
const { getUserFromRequest } = require('../lib/auth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      res.status(401).json({ error: 'Please log in to check out.' });
      return;
    }

    const { items, delivery_address, phone } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'Your cart is empty.' });
      return;
    }
    if (!delivery_address || !phone) {
      res.status(400).json({ error: 'Delivery address and phone are required.' });
      return;
    }

    const db = getDb();
    let total = 0;
    const verifiedItems = [];

    // Never trust prices or stock from the browser. Recompute everything
    // from the database so a tampered client request can't change the charge.
    for (const item of items) {
      const variantResult = await db.execute({
        sql: `SELECT variants.id, variants.price, variants.stock_qty, variants.color, variants.storage,
                     products.name as product_name
              FROM variants JOIN products ON products.id = variants.product_id
              WHERE variants.id = ?`,
        args: [item.variant_id],
      });

      if (variantResult.rows.length === 0) {
        res.status(400).json({ error: 'One of the items in your cart no longer exists.' });
        return;
      }

      const variant = variantResult.rows[0];
      const quantity = Math.max(1, parseInt(item.quantity, 10) || 1);

      if (variant.stock_qty < quantity) {
        res.status(400).json({ error: `${variant.product_name} does not have enough stock left.` });
        return;
      }

      const lineTotal = variant.price * quantity;
      total += lineTotal;
      verifiedItems.push({
        variant_id: variant.id,
        product_name: variant.product_name,
        variant_label: [variant.color, variant.storage].filter(Boolean).join(' / '),
        price: variant.price,
        quantity,
      });
    }

    // Stash the verified cart under a reference so paystack-verify.js can
    // rebuild the exact same order after payment succeeds.
    const reference = `EMGOVI-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const pendingOrder = JSON.stringify({
      user_id: user.id,
      total,
      delivery_address,
      phone,
      items: verifiedItems,
    });

    await db.execute({
      sql: `CREATE TABLE IF NOT EXISTS pending_orders (
              reference TEXT PRIMARY KEY,
              payload TEXT NOT NULL,
              created_at TEXT DEFAULT (datetime('now'))
            )`,
      args: [],
    });
    await db.execute({
      sql: 'INSERT INTO pending_orders (reference, payload) VALUES (?, ?)',
      args: [reference, pendingOrder],
    });

    const paystackResponse = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: user.email,
        amount: total * 100, // Paystack expects kobo
        reference,
        callback_url: `${req.headers.origin || ''}/checkout.html?reference=${reference}`,
      }),
    });

    const paystackData = await paystackResponse.json();
    if (!paystackData.status) {
      res.status(502).json({ error: 'Could not start payment with Paystack.' });
      return;
    }

    res.status(200).json({
      authorization_url: paystackData.data.authorization_url,
      reference,
      total,
    });
  } catch (err) {
    console.error('Paystack init error:', err);
    res.status(500).json({ error: 'Something went wrong starting your payment.' });
  }
};
