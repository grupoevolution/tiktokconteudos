const express = require('express');
const db = require('../database/database');
const { authMiddleware } = require('./authRoutes');

const router = express.Router();

// Listar todas as categorias com subcategorias
router.get('/', authMiddleware, (req, res) => {
  try {
    const categories = db.prepare('SELECT * FROM categories ORDER BY name').all();
    
    const categoriesWithSubs = categories.map(cat => {
      const subcategories = db.prepare('SELECT * FROM subcategories WHERE category_id = ? ORDER BY name').all(cat.id);
      return {
        ...cat,
        subcategories
      };
    });
    
    res.json({ success: true, categories: categoriesWithSubs });
  } catch (error) {
    console.error('Erro ao listar categorias:', error);
    res.status(500).json({ error: 'Erro ao listar categorias' });
  }
});

// Criar categoria
router.post('/', authMiddleware, (req, res) => {
  try {
    const { name } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Nome é obrigatório' });
    }
    
    const slug = name.toLowerCase().replace(/\s+/g, '-');
    
    const result = db.prepare('INSERT INTO categories (name, slug) VALUES (?, ?)').run(name, slug);
    
    res.json({
      success: true,
      category: {
        id: result.lastInsertRowid,
        name,
        slug
      }
    });
  } catch (error) {
    console.error('Erro ao criar categoria:', error);
    res.status(500).json({ error: 'Erro ao criar categoria' });
  }
});

// Criar subcategoria
router.post('/:categoryId/subcategories', authMiddleware, (req, res) => {
  try {
    const { categoryId } = req.params;
    const { name } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Nome é obrigatório' });
    }
    
    const slug = name.toLowerCase().replace(/\//g, '-').replace(/\s+/g, '-');
    
    const result = db.prepare('INSERT INTO subcategories (category_id, name, slug) VALUES (?, ?, ?)').run(categoryId, name, slug);
    
    res.json({
      success: true,
      subcategory: {
        id: result.lastInsertRowid,
        category_id: categoryId,
        name,
        slug
      }
    });
  } catch (error) {
    console.error('Erro ao criar subcategoria:', error);
    res.status(500).json({ error: 'Erro ao criar subcategoria' });
  }
});

// Deletar categoria
router.delete('/:id', authMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    
    // Verificar se tem produtos
    const hasProducts = db.prepare('SELECT COUNT(*) as count FROM products WHERE category_id = ?').get(id).count;
    
    if (hasProducts > 0) {
      return res.status(400).json({ error: 'Não é possível deletar categoria com produtos associados' });
    }
    
    // Deletar subcategorias primeiro
    db.prepare('DELETE FROM subcategories WHERE category_id = ?').run(id);
    
    // Deletar categoria
    db.prepare('DELETE FROM categories WHERE id = ?').run(id);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao deletar categoria:', error);
    res.status(500).json({ error: 'Erro ao deletar categoria' });
  }
});

// Deletar subcategoria
router.delete('/:categoryId/subcategories/:subId', authMiddleware, (req, res) => {
  try {
    const { subId } = req.params;
    
    // Verificar se tem produtos
    const hasProducts = db.prepare('SELECT COUNT(*) as count FROM products WHERE subcategory_id = ?').get(subId).count;
    
    if (hasProducts > 0) {
      return res.status(400).json({ error: 'Não é possível deletar subcategoria com produtos associados' });
    }
    
    db.prepare('DELETE FROM subcategories WHERE id = ?').run(subId);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao deletar subcategoria:', error);
    res.status(500).json({ error: 'Erro ao deletar subcategoria' });
  }
});

module.exports = router;
