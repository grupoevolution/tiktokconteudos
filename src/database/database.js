const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const db = new Database(path.join(__dirname, '../../database.sqlite'));
db.pragma('journal_mode = WAL');

// Criar tabelas
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS team_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    products_per_day INTEGER DEFAULT 9,
    active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    image_path TEXT NOT NULL,
    observation TEXT,
    tags TEXT,
    status TEXT DEFAULT 'active',
    times_used INTEGER DEFAULT 0,
    last_used_date TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS distributions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    week_start TEXT NOT NULL,
    week_end TEXT NOT NULL,
    distribution_data TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    published BOOLEAN DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS employee_products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    downloaded BOOLEAN DEFAULT 0,
    video_completed BOOLEAN DEFAULT 0,
    FOREIGN KEY (member_id) REFERENCES team_members(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// Criar usuário admin se não existir
const adminEmail = process.env.ADMIN_EMAIL || 'admin';
const adminPassword = process.env.ADMIN_PASSWORD || '@Senha123';
const adminExists = db.prepare('SELECT * FROM users WHERE email = ?').get(adminEmail);

if (!adminExists) {
  const hashedPassword = bcrypt.hashSync(adminPassword, 10);
  db.prepare('INSERT INTO users (email, password) VALUES (?, ?)').run(adminEmail, hashedPassword);
  console.log('✅ Usuário admin criado com sucesso!');
}

// Criar membros iniciais se não existirem
const danielExists = db.prepare('SELECT * FROM team_members WHERE name = ?').get('daniel');
const eliasExists = db.prepare('SELECT * FROM team_members WHERE name = ?').get('elias');

if (!danielExists) {
  db.prepare('INSERT INTO team_members (name, products_per_day) VALUES (?, ?)').run('daniel', 9);
  console.log('✅ Membro Daniel criado!');
}

if (!eliasExists) {
  db.prepare('INSERT INTO team_members (name, products_per_day) VALUES (?, ?)').run('elias', 9);
  console.log('✅ Membro Elias criado!');
}

module.exports = db;
