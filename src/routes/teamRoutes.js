const express = require('express');
const db = require('../database/database');
const { authMiddleware } = require('./authRoutes');

const router = express.Router();

// Listar membros da equipe
router.get('/', authMiddleware, (req, res) => {
  try {
    const members = db.prepare('SELECT * FROM team_members ORDER BY created_at ASC').all();
    res.json({ success: true, members });
  } catch (error) {
    console.error('Erro ao listar membros:', error);
    res.status(500).json({ error: 'Erro ao listar membros' });
  }
});

// Adicionar membro
router.post('/', authMiddleware, (req, res) => {
  try {
    const { name, products_per_day } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Nome é obrigatório' });
    }

    const exists = db.prepare('SELECT * FROM team_members WHERE LOWER(name) = ?').get(name.toLowerCase());
    if (exists) {
      return res.status(400).json({ error: 'Membro já existe' });
    }

    const result = db.prepare(`
      INSERT INTO team_members (name, products_per_day, active)
      VALUES (?, ?, 1)
    `).run(name.toLowerCase(), products_per_day || 6);

    res.json({
      success: true,
      member: {
        id: result.lastInsertRowid,
        name: name.toLowerCase(),
        products_per_day: products_per_day || 6,
        active: 1
      }
    });
  } catch (error) {
    console.error('Erro ao adicionar membro:', error);
    res.status(500).json({ error: 'Erro ao adicionar membro' });
  }
});

// Atualizar membro (incluindo products_per_day)
router.put('/:id', authMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    const { name, products_per_day, active } = req.body;

    db.prepare(`
      UPDATE team_members
      SET name = COALESCE(?, name),
          products_per_day = COALESCE(?, products_per_day),
          active = COALESCE(?, active)
      WHERE id = ?
    `).run(name?.toLowerCase(), products_per_day, active, id);

    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao atualizar membro:', error);
    res.status(500).json({ error: 'Erro ao atualizar membro' });
  }
});

// Atualizar produtos por dia de TODOS os membros de uma vez
router.put('/all/products-per-day', authMiddleware, (req, res) => {
  try {
    const { products_per_day } = req.body;
    
    if (!products_per_day || products_per_day < 6) {
      return res.status(400).json({ error: 'Mínimo de 6 produtos por dia' });
    }

    db.prepare('UPDATE team_members SET products_per_day = ?').run(products_per_day);

    res.json({ success: true, message: `Todos os membros agora recebem ${products_per_day} produtos/dia` });
  } catch (error) {
    console.error('Erro ao atualizar produtos por dia:', error);
    res.status(500).json({ error: 'Erro ao atualizar produtos por dia' });
  }
});

// Deletar membro
router.delete('/:id', authMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    
    const hasDistributions = db.prepare('SELECT COUNT(*) as count FROM employee_products WHERE member_id = ?').get(id).count;
    
    if (hasDistributions > 0) {
      return res.status(400).json({ error: 'Não é possível deletar membro com distribuições associadas. Desative-o ao invés disso.' });
    }

    db.prepare('DELETE FROM team_members WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao deletar membro:', error);
    res.status(500).json({ error: 'Erro ao deletar membro' });
  }
});

// Obter estatísticas do membro
router.get('/:id/stats', authMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    
    const totalVideos = db.prepare('SELECT COUNT(*) as count FROM employee_products WHERE member_id = ?').get(id).count;
    const completed = db.prepare('SELECT COUNT(*) as count FROM employee_products WHERE member_id = ? AND video_completed = 1').get(id).count;
    const downloaded = db.prepare('SELECT COUNT(*) as count FROM employee_products WHERE member_id = ? AND downloaded = 1').get(id).count;

    res.json({
      success: true,
      stats: {
        totalVideos,
        completed,
        downloaded,
        pending: totalVideos - completed
      }
    });
  } catch (error) {
    console.error('Erro ao obter estatísticas:', error);
    res.status(500).json({ error: 'Erro ao obter estatísticas' });
  }
});

module.exports = router;
