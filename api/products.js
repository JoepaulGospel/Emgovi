const { getDb } = require('../lib/db');
const { checkAdminPin } = require('../lib/auth');

module.exports = async (req, res) => {
  const db = getDb();

  try {
    if (req.method === 'GET') {
      const { id } = req.query;

      if (id) {
        const productResult = await db.execute({
          sql: 'SELECT * FROM products WHERE id = ?',
          args: [id],
        });
        if (productResult.rows.length === 0) {
          res.status(404).json({ error: 'Product not found.' });
          return;
        }
        const variantsResult = await db.execute({
          sql: 'SELECT * FROM variants WHERE product_id = ? ORDER BY id',
          args: [id],
        });
        res.status(200).json({ ...productResult.rows[0], variants: variantsResult.rows });
        return;
      }

      const { category } = req.query;
      const productsResult = category
        ? await db.execute({ sql: 'SELECT * FROM products WHERE category = ? ORDER BY created_at DESC', args: [category] })
        : await db.execute('SELECT * FROM products ORDER BY created_at DESC');

      const products = productsResult.rows;
      const variantsResult = await db.execute('SELECT * FROM variants ORDER BY id');
      const variantsByProduct = {};
      for (const v of variantsResult.rows) {
        if (!variantsByProduct[v.product_id]) variantsByProduct[v.product_id] = [];
        variantsByProduct[v.product_id].push(v);
      }
      const withVariants = products.map((p) => ({ ...p, variants: variantsByProduct[p.id] || [] }));
      res.status(200).json(withVariants);
      return;
    }

    // Everything below writes data, so it requires the admin PIN.
    if (!checkAdminPin(req)) {
      res.status(401).json({ error: 'Admin PIN required.' });
      return;
    }

    if (req.method === 'POST') {
      const { name, description, category, base_price, image_url, is_digital, delivers_code, is_addon, addon_for_category, variants } = req.body;
      if (!name || !base_price) {
        res.status(400).json({ error: 'Name and base price are required.' });
        return;
      }

      const result = await db.execute({
        sql: 'INSERT INTO products (name, description, category, base_price, image_url, is_digital, delivers_code, is_addon, addon_for_category) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        args: [name, description || '', category || 'Phones', base_price, image_url || '', is_digital ? 1 : 0, delivers_code ? 1 : 0, is_addon ? 1 : 0, addon_for_category || null],
      });
      const productId = Number(result.lastInsertRowid);

      if (Array.isArray(variants) && variants.length > 0) {
        for (const v of variants) {
          await db.execute({
            sql: 'INSERT INTO variants (product_id, color, storage, price, stock_qty, sku) VALUES (?, ?, ?, ?, ?, ?)',
            args: [productId, v.color || '', v.storage || '', v.price || base_price, v.stock_qty || 0, v.sku || ''],
          });
        }
      }

      res.status(201).json({ id: productId });
      return;
    }

    if (req.method === 'PUT') {
      const { id, name, description, category, base_price, image_url, is_digital, delivers_code, is_addon, addon_for_category, variants } = req.body;
      if (!id) {
        res.status(400).json({ error: 'Product id is required.' });
        return;
      }

      await db.execute({
        sql: 'UPDATE products SET name = ?, description = ?, category = ?, base_price = ?, image_url = ?, is_digital = ?, delivers_code = ?, is_addon = ?, addon_for_category = ? WHERE id = ?',
        args: [name, description || '', category, base_price, image_url || '', is_digital ? 1 : 0, delivers_code ? 1 : 0, is_addon ? 1 : 0, addon_for_category || null, id],
      });

      if (Array.isArray(variants)) {
        await db.execute({ sql: 'DELETE FROM variants WHERE product_id = ?', args: [id] });
        for (const v of variants) {
          await db.execute({
            sql: 'INSERT INTO variants (product_id, color, storage, price, stock_qty, sku) VALUES (?, ?, ?, ?, ?, ?)',
            args: [id, v.color || '', v.storage || '', v.price || base_price, v.stock_qty || 0, v.sku || ''],
          });
        }
      }

      res.status(200).json({ ok: true });
      return;
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) {
        res.status(400).json({ error: 'Product id is required.' });
        return;
      }
      await db.execute({ sql: 'DELETE FROM products WHERE id = ?', args: [id] });
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Products API error:', err);
    res.status(500).json({ error: 'Something went wrong handling that product request.' });
  }
};
