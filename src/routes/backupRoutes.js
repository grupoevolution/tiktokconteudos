const express = require('express');
const db = require('../database/database');
const { authMiddleware } = require('./authRoutes');

const router = express.Router();

// Exportar backup completo
router.get('/export', authMiddleware, (req, res) => {
  try {
    const backup = {
      version: '1.0',
      exported_at: new Date().toISOString(),
      data: {
        categories: db.prepare('SELECT * FROM categories').all(),
        subcategories: db.prepare('SELECT * FROM subcategories').all(),
        products: db.prepare('SELECT * FROM products').all(),
        team_members: db.prepare('SELECT * FROM team_members').all(),
        distributions: db.prepare('SELECT * FROM distributions').all(),
        employee_products: db.prepare('SELECT * FROM employee_products').all()
      }
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=backup-tiktok-shop-${Date.now()}.json`);
    res.json(backup);
  } catch (error) {
    console.error('Erro ao exportar backup:', error);
    res.status(500).json({ error: 'Erro ao exportar backup' });
  }
});

// Importar backup
router.post('/import', authMiddleware, (req, res) => {
  try {
    const { data } = req.body;

    if (!data || !data.categories || !data.products) {
      return res.status(400).json({ error: 'Arquivo de backup inválido' });
    }

    // Limpar tabelas (exceto users)
    db.prepare('DELETE FROM employee_products').run();
    db.prepare('DELETE FROM distributions').run();
    db.prepare('DELETE FROM products').run();
    db.prepare('DELETE FROM subcategories').run();
    db.prepare('DELETE FROM categories').run();
    db.prepare('DELETE FROM team_members').run();

    // Restaurar categorias
    const insertCategory = db.prepare('INSERT INTO categories (id, name, slug, created_at) VALUES (?, ?, ?, ?)');
    data.categories.forEach(cat => {
      insertCategory.run(cat.id, cat.name, cat.slug, cat.created_at);
    });

    // Restaurar subcategorias
    if (data.subcategories && data.subcategories.length > 0) {
      const insertSubcategory = db.prepare('INSERT INTO subcategories (id, category_id, name, slug, created_at) VALUES (?, ?, ?, ?, ?)');
      data.subcategories.forEach(sub => {
        insertSubcategory.run(sub.id, sub.category_id, sub.name, sub.slug, sub.created_at);
      });
    }

    // Restaurar produtos
    const insertProduct = db.prepare(`
      INSERT INTO products (id, category_id, subcategory_id, product_image, reference_image, video_link, copy_text, observation, tags, status, times_used, last_used_date, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    data.products.forEach(p => {
      insertProduct.run(
        p.id, p.category_id, p.subcategory_id, p.product_image, p.reference_image,
        p.video_link, p.copy_text, p.observation, p.tags, p.status,
        p.times_used, p.last_used_date, p.created_at
      );
    });

    // Restaurar membros
    if (data.team_members && data.team_members.length > 0) {
      const insertMember = db.prepare('INSERT INTO team_members (id, name, products_per_day, active, created_at) VALUES (?, ?, ?, ?, ?)');
      data.team_members.forEach(m => {
        insertMember.run(m.id, m.name, m.products_per_day, m.active, m.created_at);
      });
    }

    // Restaurar distribuições
    if (data.distributions && data.distributions.length > 0) {
      const insertDistribution = db.prepare(`
        INSERT INTO distributions (id, week_start, week_end, products_per_day, distribution_mode, distribution_data, created_at, published)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      data.distributions.forEach(d => {
        insertDistribution.run(
          d.id, d.week_start, d.week_end, d.products_per_day, d.distribution_mode,
          d.distribution_data, d.created_at, d.published
        );
      });
    }

    // Restaurar employee_products
    if (data.employee_products && data.employee_products.length > 0) {
      const insertEmpProduct = db.prepare(`
        INSERT INTO employee_products (id, member_id, product_id, date, downloaded, video_completed)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      data.employee_products.forEach(ep => {
        insertEmpProduct.run(ep.id, ep.member_id, ep.product_id, ep.date, ep.downloaded, ep.video_completed);
      });
    }

    res.json({ 
      success: true, 
      message: 'Backup importado com sucesso!',
      stats: {
        categories: data.categories.length,
        products: data.products.length,
        team_members: data.team_members?.length || 0
      }
    });
  } catch (error) {
    console.error('Erro ao importar backup:', error);
    res.status(500).json({ error: 'Erro ao importar backup', details: error.message });
  }
});

module.exports = router;
