const express = require('express');
const path = require('path');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://user:NBWohmR0QCiyPLqFd2uGR2HWMNvm9GnA@dpg-d4g6db8dl3ps73da19pg-a/abcn',
  ssl: { rejectUnauthorized: false },
});

function generateId(length) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789abcdefghijkmnopqrstuvwxyz';
  let id = '';
  while (id.length < length) {
    const byte = crypto.randomBytes(1)[0];
    if (byte < alphabet.length * 4) {
      id += alphabet[byte % alphabet.length];
    }
  }
  return id;
}

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id CHAR(9) PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin','user')),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS items (
      id CHAR(8) PRIMARY KEY,
      seller_id CHAR(9) REFERENCES users(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      description TEXT,
      price NUMERIC(12,2) DEFAULT 0,
      image_url TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS cart_items (
      user_id CHAR(9) REFERENCES users(id) ON DELETE CASCADE,
      item_id CHAR(8) REFERENCES items(id) ON DELETE CASCADE,
      added_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (user_id, item_id)
    );
  `);
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const [, token] = authHeader.split(' ');
  if (!token) return res.status(401).json({ error: 'Требуется авторизация' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Неверный токен' });
  }
}

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname)));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/register', async (req, res) => {
  const { email, password, role = 'user' } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Почта и пароль обязательны' });
  }
  if (!['admin', 'user'].includes(role)) {
    return res.status(400).json({ error: 'Неверная роль' });
  }

  try {
    const existing = await pool.query('SELECT 1 FROM users WHERE email = $1', [email]);
    if (existing.rows.length) {
      return res.status(409).json({ error: 'Такая почта уже зарегистрирована' });
    }

    const userId = generateId(9);
    const passwordHash = await bcrypt.hash(password, 10);
    await pool.query(
      'INSERT INTO users (id, email, password_hash, role) VALUES ($1, $2, $3, $4)',
      [userId, email, passwordHash, role]
    );

    const token = jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: userId, email, role } });
  } catch (err) {
    console.error('register error', err);
    res.status(500).json({ error: 'Не удалось создать пользователя' });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Нужны почта и пароль' });
  }

  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (!result.rows.length) return res.status(401).json({ error: 'Неверные данные' });

    const user = result.rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Неверные данные' });

    const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, email: user.email, role: user.role } });
  } catch (err) {
    console.error('login error', err);
    res.status(500).json({ error: 'Не удалось войти' });
  }
});

app.get('/api/profile', authMiddleware, async (req, res) => {
  try {
    const userResult = await pool.query('SELECT id, email, role, created_at FROM users WHERE id = $1', [req.user.userId]);
    const user = userResult.rows[0];

    const myItems = await pool.query('SELECT * FROM items WHERE seller_id = $1 ORDER BY created_at DESC', [req.user.userId]);
    const cartItems = await pool.query(
      `SELECT items.* FROM cart_items
       JOIN items ON items.id = cart_items.item_id
       WHERE cart_items.user_id = $1`,
      [req.user.userId]
    );

    res.json({ user, items: myItems.rows, cart: cartItems.rows });
  } catch (err) {
    console.error('profile error', err);
    res.status(500).json({ error: 'Не удалось загрузить профиль' });
  }
});

app.get('/api/items', async (_req, res) => {
  try {
    const items = await pool.query('SELECT * FROM items ORDER BY created_at DESC');
    res.json(items.rows);
  } catch (err) {
    console.error('items error', err);
    res.status(500).json({ error: 'Не удалось загрузить каталог' });
  }
});

app.post('/api/items', authMiddleware, async (req, res) => {
  const { title, description, price = 0, imageUrl } = req.body;
  if (!title) return res.status(400).json({ error: 'Название обязательно' });

  try {
    const itemId = generateId(8);
    await pool.query(
      'INSERT INTO items (id, seller_id, title, description, price, image_url) VALUES ($1, $2, $3, $4, $5, $6)',
      [itemId, req.user.userId, title, description || '', Number(price) || 0, imageUrl || '']
    );
    res.status(201).json({ id: itemId });
  } catch (err) {
    console.error('create item error', err);
    res.status(500).json({ error: 'Не удалось создать товар' });
  }
});

app.put('/api/items/:id', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Только админ может править товары' });
  }
  const { title, description, price, imageUrl } = req.body;
  try {
    await pool.query(
      'UPDATE items SET title = COALESCE($1,title), description = COALESCE($2,description), price = COALESCE($3,price), image_url = COALESCE($4,image_url) WHERE id = $5',
      [title, description, price, imageUrl, req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('update item error', err);
    res.status(500).json({ error: 'Не удалось изменить товар' });
  }
});

app.delete('/api/items/:id', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Только админ может удалять товары' });
  }
  try {
    await pool.query('DELETE FROM items WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('delete item error', err);
    res.status(500).json({ error: 'Не удалось удалить товар' });
  }
});

app.post('/api/cart', authMiddleware, async (req, res) => {
  const { itemId } = req.body;
  if (!itemId) return res.status(400).json({ error: 'Нужно указать товар' });

  try {
    await pool.query('INSERT INTO cart_items (user_id, item_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.user.userId, itemId]);
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error('cart add error', err);
    res.status(500).json({ error: 'Не удалось добавить в корзину' });
  }
});

app.get('/api/cart', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT items.* FROM cart_items JOIN items ON items.id = cart_items.item_id WHERE cart_items.user_id = $1`,
      [req.user.userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('cart load error', err);
    res.status(500).json({ error: 'Не удалось загрузить корзину' });
  }
});

app.delete('/api/cart/:itemId', authMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM cart_items WHERE user_id = $1 AND item_id = $2', [req.user.userId, req.params.itemId]);
    res.json({ ok: true });
  } catch (err) {
    console.error('cart delete error', err);
    res.status(500).json({ error: 'Не удалось удалить из корзины' });
  }
});

async function start() {
  try {
    await ensureSchema();
    app.listen(PORT, () => {
      console.log(`Server listening on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Startup error', err);
    process.exit(1);
  }
}

start();
