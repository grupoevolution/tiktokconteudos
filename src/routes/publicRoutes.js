const express = require('express');
const db = require('../database/database');

const router = express.Router();

// Obter produtos do dia para um funcionário
router.get('/employee/:name/today', (req, res) => {
  try {
    const { name } = req.params;
    const today = new Date().toISOString().split('T')[0];
    
    // Buscar membro
    const member = db.prepare('SELECT * FROM team_members WHERE LOWER(name) = ?').get(name.toLowerCase());
    
    if (!member) {
      return res.status(404).json({ error: 'Funcionário não encontrado' });
    }

    // Buscar produtos do dia com informações de categoria
    const employeeProducts = db.prepare(`
      SELECT ep.*, p.*, c.slug as category_slug
      FROM employee_products ep
      JOIN products p ON ep.product_id = p.id
      JOIN categories c ON p.category_id = c.id
      WHERE ep.member_id = ? AND ep.date = ?
      ORDER BY c.slug, p.id
    `).all(member.id, today);

    // ✅ CORRIGIDO - Agrupar por categorias corretas
    const products = {
      validados: employeeProducts.filter(p => p.category_slug === 'validados'),
      roupas: employeeProducts.filter(p => p.category_slug === 'roupas'),
      roupas_musica: employeeProducts.filter(p => p.category_slug === 'roupas-musica'),
      novos: employeeProducts.filter(p => p.category_slug === 'novos')
    };

    const stats = {
      total: employeeProducts.length,
      downloaded: employeeProducts.filter(p => p.downloaded).length,
      completed: employeeProducts.filter(p => p.video_completed).length
    };

    res.json({
      success: true,
      member: {
        id: member.id,
        name: member.name
      },
      date: today,
      products,
      stats
    });
  } catch (error) {
    console.error('Erro ao obter produtos do funcionário:', error);
    res.status(500).json({ error: 'Erro ao obter produtos' });
  }
});

// Marcar produto como baixado
router.post('/employee/:name/download/:productId', (req, res) => {
  try {
    const { name, productId } = req.params;
    const today = new Date().toISOString().split('T')[0];
    
    const member = db.prepare('SELECT * FROM team_members WHERE LOWER(name) = ?').get(name.toLowerCase());
    
    if (!member) {
      return res.status(404).json({ error: 'Funcionário não encontrado' });
    }

    db.prepare(`
      UPDATE employee_products
      SET downloaded = 1
      WHERE member_id = ? AND product_id = ? AND date = ?
    `).run(member.id, productId, today);

    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao marcar como baixado:', error);
    res.status(500).json({ error: 'Erro ao marcar como baixado' });
  }
});

// Marcar vídeo como completo
router.post('/employee/:name/complete/:productId', (req, res) => {
  try {
    const { name, productId } = req.params;
    const today = new Date().toISOString().split('T')[0];
    
    const member = db.prepare('SELECT * FROM team_members WHERE LOWER(name) = ?').get(name.toLowerCase());
    
    if (!member) {
      return res.status(404).json({ error: 'Funcionário não encontrado' });
    }

    db.prepare(`
      UPDATE employee_products
      SET video_completed = 1
      WHERE member_id = ? AND product_id = ? AND date = ?
    `).run(member.id, productId, today);

    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao marcar como completo:', error);
    res.status(500).json({ error: 'Erro ao marcar como completo' });
  }
});

// Obter histórico do funcionário
router.get('/employee/:name/history', (req, res) => {
  try {
    const { name } = req.params;
    const { days } = req.query;
    
    const member = db.prepare('SELECT * FROM team_members WHERE LOWER(name) = ?').get(name.toLowerCase());
    
    if (!member) {
      return res.status(404).json({ error: 'Funcionário não encontrado' });
    }

    const daysLimit = parseInt(days) || 30;
    
    const history = db.prepare(`
      SELECT ep.*, p.*, c.slug as category_slug
      FROM employee_products ep
      JOIN products p ON ep.product_id = p.id
      JOIN categories c ON p.category_id = c.id
      WHERE ep.member_id = ?
      ORDER BY ep.date DESC
      LIMIT ?
    `).all(member.id, daysLimit * member.products_per_day);

    res.json({ success: true, history });
  } catch (error) {
    console.error('Erro ao obter histórico:', error);
    res.status(500).json({ error: 'Erro ao obter histórico' });
  }
});

module.exports = router;
