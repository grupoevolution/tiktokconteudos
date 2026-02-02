const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const dbDir = path.join(__dirname, '../..');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'database.sqlite');
console.log('📂 Caminho do banco de dados:', dbPath);

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

console.log('✅ Banco de dados conectado');

// Criar tabelas
try {
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
      products_per_day INTEGER DEFAULT 6,
      active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS subcategories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id),
      UNIQUE(category_id, slug)
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL,
      subcategory_id INTEGER,
      product_image TEXT NOT NULL,
      reference_image TEXT NOT NULL,
      video_link TEXT NOT NULL,
      copy_text TEXT NOT NULL,
      observation TEXT,
      tags TEXT,
      status TEXT DEFAULT 'active',
      times_used INTEGER DEFAULT 0,
      last_used_date TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id),
      FOREIGN KEY (subcategory_id) REFERENCES subcategories(id)
    );

    CREATE TABLE IF NOT EXISTS distributions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      week_start TEXT NOT NULL,
      week_end TEXT NOT NULL,
      products_per_day INTEGER NOT NULL,
      distribution_mode TEXT DEFAULT 'same',
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
  
  console.log('✅ Tabelas criadas com sucesso');
} catch (error) {
  console.error('❌ Erro ao criar tabelas:', error);
}

// Criar categorias padrão
try {
  const categories = [
    { name: 'Produtos Validados', slug: 'validados' },
    { name: 'Roupas', slug: 'roupas' },
    { name: 'Roupas Música', slug: 'roupas-musica' },
    { name: 'Novos Produtos', slug: 'novos' }
  ];
  
  categories.forEach(cat => {
    const exists = db.prepare('SELECT * FROM categories WHERE slug = ?').get(cat.slug);
    if (!exists) {
      db.prepare('INSERT INTO categories (name, slug) VALUES (?, ?)').run(cat.name, cat.slug);
      console.log(`✅ Categoria criada: ${cat.name}`);
    }
  });
} catch (error) {
  console.error('❌ Erro ao criar categorias:', error);
}

// Criar subcategorias padrão
try {
  const subcategories = [
    // Produtos Validados
    { category: 'validados', items: ['Tec', 'Mochilas/Bolsas', 'Ferramentas', 'Beleza', 'Casa', 'Fitness', 'Calçados', 'Kids', 'Outros'] },
    // Roupas
    { category: 'roupas', items: ['Padrão', 'Praia', 'Fitness', 'Plus Size'] },
    // Novos Produtos
    { category: 'novos', items: ['Tec', 'Mochilas/Bolsas', 'Ferramentas', 'Beleza', 'Casa', 'Fitness', 'Calçados', 'Kids', 'Outros'] }
  ];
  
  subcategories.forEach(({ category, items }) => {
    const cat = db.prepare('SELECT id FROM categories WHERE slug = ?').get(category);
    if (cat) {
      items.forEach(item => {
        const slug = item.toLowerCase().replace(/\//g, '-').replace(/\s+/g, '-');
        const exists = db.prepare('SELECT * FROM subcategories WHERE category_id = ? AND slug = ?').get(cat.id, slug);
        if (!exists) {
          db.prepare('INSERT INTO subcategories (category_id, name, slug) VALUES (?, ?, ?)').run(cat.id, item, slug);
        }
      });
      console.log(`✅ Subcategorias criadas para: ${category}`);
    }
  });
} catch (error) {
  console.error('❌ Erro ao criar subcategorias:', error);
}

// Criar usuário admin
try {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD || '@Senha123';
  const adminExists = db.prepare('SELECT * FROM users WHERE email = ?').get(adminEmail);

  if (!adminExists) {
    const hashedPassword = bcrypt.hashSync(adminPassword, 10);
    db.prepare('INSERT INTO users (email, password) VALUES (?, ?)').run(adminEmail, hashedPassword);
    console.log('✅ Usuário admin criado:', adminEmail);
  }
} catch (error) {
  console.error('❌ Erro ao criar usuário admin:', error);
}

// Criar membros iniciais
try {
  const members = ['daniel', 'elias'];
  members.forEach(name => {
    const exists = db.prepare('SELECT * FROM team_members WHERE name = ?').get(name);
    if (!exists) {
      db.prepare('INSERT INTO team_members (name, products_per_day) VALUES (?, ?)').run(name, 6);
      console.log(`✅ Membro ${name} criado`);
    }
  });
  
  const allMembers = db.prepare('SELECT * FROM team_members').all();
  console.log('👥 Membros cadastrados:', allMembers.map(m => `${m.name} (${m.products_per_day} produtos/dia)`).join(', '));
} catch (error) {
  console.error('❌ Erro ao criar membros:', error);
}

module.exports = db;
