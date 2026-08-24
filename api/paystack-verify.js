const { getDb } = require('../lib/db');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { reference } = req.body;
    if (!reference) {
      res.status(400).json({ error: 'Payment reference is required.' });
      return;
    }

    const db = getDb();

    // If this reference was already turned into an order, don't double-charge stock.
    const existingOrder = await db.execute({
      sql: 'SELECT id FROM orders WHERE paystack_reference = ?',
      args: [reference],
    });
    if (existingOrder.rows.length > 0) {
      res.status(200).json({ order_id: existingOrder.rows[0].id, already_processed: true });
      return;
    }

    // Confirm the payment actually succeeded with Paystack directly.
    // Never trust a "success" flag sent from the browser.
    const verifyResponse = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
    });
    const verifyData = await verifyResponse.json();

    if (!verifyData.status || verifyData.data.status !== 'success') {
      res.status(402).json({ error: 'Payment was not successful.' });
      return;
    }

    const pendingResult = await db.execute({
      sql: 'SELECT payload FROM pending_orders WHERE reference = ?',
      args: [reference],
    });
    if (pendingResult.rows.length === 0) {
      res.status(404).json({ error: 'No matching order found for this payment.' });
      return;
    }

    const pending = JSON.parse(pendingResult.rows[0].payload);

    // Double-check the amount actually paid matches what we expected to charge.
    if (verifyData.data.amount !== pending.total * 100) {
      res.status(402).json({ error: 'Payment amount does not match the order total.' });
      return;
    }

    const orderResult = await db.execute({
      sql: 'INSERT INTO orders (user_id, total, status, paystack_reference, delivery_address, phone) VALUES (?, ?, ?, ?, ?, ?)',
      args: [pending.user_id, pending.total, 'Paid', reference, pending.delivery_address, pending.phone],
    });
    const orderId = Number(orderResult.lastInsertRowid);

    for (const item of pending.items) {
      await db.execute({
        sql: 'INSERT INTO order_items (order_id, variant_id, product_name, variant_label, price, quantity) VALUES (?, ?, ?, ?, ?, ?)',
        args: [orderId, item.variant_id, item.product_name, item.variant_label, item.price, item.quantity],
      });
      await db.execute({
        sql: 'UPDATE variants SET stock_qty = stock_qty - ? WHERE id = ?',
        args: [item.quantity, item.variant_id],
      });
    }

    await db.execute({ sql: 'DELETE FROM pending_orders WHERE reference = ?', args: [reference] });

    res.status(200).json({ order_id: orderId, already_processed: false });
  } catch (err) {
    console.error('Paystack verify error:', err);
    res.status(500).json({ error: 'Something went wrong confirming your payment.' });
  }
};
