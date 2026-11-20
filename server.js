const express = require('express');
const sql = require('mssql');
const crypto = require('crypto');
const path = require('path');
const multer = require('multer'), fs = require('fs');
fs.mkdirSync(path.join(__dirname, 'public', 'uploads'), { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: path.join(__dirname, 'public', 'uploads'),
    filename: (req, f, cb) => cb(null, crypto.randomBytes(8).toString('hex') + path.extname(f.originalname).toLowerCase())
  }),
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (req, f, cb) => cb(null, /\.(jpe?g|png|webp|gif)$/i.test(f.originalname))
});
const imgPath = req => (req.file ? '/uploads/' + req.file.filename : null);


const config = {
  user: 'admin',
  password: 'yourpassword123', //change this
  server: 'localhost\\SQLEXPRESS',          // or 'localhost\\SQLEXPRESS'
  database: 'TechNestDB',
  options: { encrypt: false, trustServerCertificate: true }
};

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const hashPw = (pw, salt = crypto.randomBytes(16).toString('hex')) =>
  salt + ':' + crypto.scryptSync(pw, salt, 64).toString('hex');
const checkPw = (pw, stored) => {
  const [salt, hash] = stored.split(':');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), crypto.scryptSync(pw, salt, 64));
};

const poolPromise = new sql.ConnectionPool(config).connect()
  .then(async p => {
    console.log('Connected to SQL Server');
    // First run: create default admin account
    const c = await p.request().query('SELECT COUNT(*) AS n FROM Users');
    if (c.recordset[0].n === 0) {
      await p.request().input('u', sql.NVarChar(50), 'admin')
        .input('h', sql.NVarChar(200), hashPw('admin123'))
        .query("INSERT INTO Users (Username, PasswordHash, FullName) VALUES (@u, @h, 'Administrator')");
      console.log('Default login created: admin / admin123');
    }
    return p;
  })
  .catch(e => { console.error('DB connection failed:', e.message); process.exit(1); });

// ---- Auth ----
const sessions = new Map(); // token -> { userId, username }

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Enter username and password' });
  try {
    const pool = await poolPromise;
    const r = await pool.request().input('u', sql.NVarChar(50), username)
      .query('SELECT UserID, Username, PasswordHash FROM Users WHERE Username = @u');
    const user = r.recordset[0];
    if (!user || !checkPw(password, user.PasswordHash))
      return res.status(401).json({ error: 'Wrong username or password' });
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, { userId: user.UserID, username: user.Username });
    res.json({ token, username: user.Username });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.use('/api', (req, res, next) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const s = sessions.get(token);
  if (!s) return res.status(401).json({ error: 'Please log in' });
  req.user = s; req.token = token; next();
});

app.post('/api/logout', (req, res) => { sessions.delete(req.token); res.json({ message: 'Logged out' }); });

// ---- Products ----
app.get('/api/products', async (req, res) => {
  try {
    const pool = await poolPromise;
    const r = await pool.request().query('SELECT * FROM Products WHERE Active = 1 ORDER BY Category, Name');
    res.json(r.recordset);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/products', upload.single('image'), async (req, res) => {
  const { name, category } = req.body;
  const price = Number(req.body.price), stock = Number(req.body.stock), img = imgPath(req);
  if (!name || !category || !(price >= 0) || !(stock >= 0))
    return res.status(400).json({ error: 'Invalid product data' });
  try {
    const pool = await poolPromise;
    await pool.request()
      .input('n', sql.NVarChar(150), name).input('c', sql.NVarChar(50), category)
      .input('p', sql.Decimal(10, 2), price).input('s', sql.Int, stock)
      .input('i', sql.NVarChar(300), img)
      .query('INSERT INTO Products (Name, Category, Price, Stock, ImageURL) VALUES (@n, @c, @p, @s, @i)');
    res.status(201).json({ message: 'Product added' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/products/:id', upload.single('image'), async (req, res) => {
  const { name, category } = req.body;
  const price = Number(req.body.price), stock = Number(req.body.stock), img = imgPath(req);
  if (!name || !category || !(price >= 0) || !(stock >= 0))
    return res.status(400).json({ error: 'Invalid product data' });
  try {
    const pool = await poolPromise;
    const r = await pool.request().input('id', sql.Int, req.params.id)
      .input('n', sql.NVarChar(150), name).input('c', sql.NVarChar(50), category)
      .input('p', sql.Decimal(10, 2), price).input('s', sql.Int, stock)
      .input('i', sql.NVarChar(300), img)
      .query('UPDATE Products SET Name=@n, Category=@c, Price=@p, Stock=@s, ImageURL=COALESCE(@i, ImageURL) WHERE ProductID=@id AND Active=1');
    if (!r.rowsAffected[0]) return res.status(404).json({ error: 'Product not found' });
    res.json({ message: 'Product updated' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// "Remove" hides the product so old sales keep their history
app.delete('/api/products/:id', async (req, res) => {
  try {
    const pool = await poolPromise;
    await pool.request().input('id', sql.Int, req.params.id)
      .query('UPDATE Products SET Active = 0 WHERE ProductID = @id');
    res.json({ message: 'Product removed' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---- Sales ----
app.get('/api/sales', async (req, res) => {
  try {
    const pool = await poolPromise;
    const r = await pool.request().query(`
      SELECT s.SaleID, s.SaleDate, s.Total, s.PaymentMethod, s.DiscountPercent, u.Username AS Cashier,
             (SELECT SUM(Quantity) FROM SaleItems WHERE SaleID = s.SaleID) AS Items
      FROM Sales s LEFT JOIN Users u ON u.UserID = s.UserID
      ORDER BY s.SaleDate DESC`);
    res.json(r.recordset);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/sales', async (req, res) => {
  const items = req.body.items;
  const pay = ['Cash', 'QR', 'Wallet'].includes(req.body.paymentMethod) ? req.body.paymentMethod : 'Cash';
  const disc = Math.min(100, Math.max(0, Number(req.body.discountPercent) || 0));
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'Cart is empty' });
  const pool = await poolPromise;
  const tx = new sql.Transaction(pool);
  try {
    await tx.begin();
    let total = 0;
    const lines = [];
    for (const it of items) {
      const qty = parseInt(it.quantity, 10);
      if (!(qty > 0)) throw new Error('Invalid quantity');
      const r = await new sql.Request(tx)
        .input('id', sql.Int, it.productId).input('q', sql.Int, qty)
        .query(`UPDATE Products SET Stock = Stock - @q
                OUTPUT inserted.Price
                WHERE ProductID = @id AND Stock >= @q`);
      if (!r.recordset.length) throw new Error('Insufficient stock or product not found (ID ' + it.productId + ')');
      const price = Number(r.recordset[0].Price);
      total += price * qty;
      lines.push({ id: it.productId, qty, price });
    }
    total = Math.round(total * (1 - disc / 100) * 100) / 100; // apply discount
    const s = await new sql.Request(tx)
      .input('tot', sql.Decimal(10, 2), total).input('uid', sql.Int, req.user.userId).input('pm', sql.NVarChar(20), pay).input('disc', sql.Decimal(5, 2), disc)
      .query('INSERT INTO Sales (Total, UserID, PaymentMethod, DiscountPercent) OUTPUT inserted.SaleID VALUES (@tot, @uid, @pm, @disc)');
    const saleId = s.recordset[0].SaleID;
    for (const l of lines) {
      await new sql.Request(tx)
        .input('sid', sql.Int, saleId).input('pid', sql.Int, l.id)
        .input('q', sql.Int, l.qty).input('p', sql.Decimal(10, 2), l.price)
        .query('INSERT INTO SaleItems (SaleID, ProductID, Quantity, UnitPrice) VALUES (@sid, @pid, @q, @p)');
    }
    await tx.commit();
    res.status(201).json({ saleId, total });
  } catch (e) {
    try { await tx.rollback(); } catch (_) {}
    res.status(400).json({ error: e.message });
  }
});

app.listen(3000, () => console.log('TechNest running at http://localhost:3000/login.html'));
