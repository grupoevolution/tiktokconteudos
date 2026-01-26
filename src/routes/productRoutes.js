const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../database/database');
const { authMiddleware } = require('./authRoutes');

const router = express.Router();

// Configurar multer para upload de imagens
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadsDir = path.join(__dirname, '../../public/uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Apenas imagens são permitidas!'));
  }
});

// Listar todos os produtos
router.get('/', authMiddleware, (req, res) => {
  try {
    const { category, status, search } = req.query;
    let query = 'SELECT * FROM products WHERE 1=1';
    const params = [];

    if (category) {
      query += ' AND category = ?';
      params.push(category);
    }

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    if (search) {
      query += ' AND (observation LIKE ? OR tags LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY created_at DESC';

    const products = db.prepare(query).all(...params);
    res.json({ success: true, products });
  } catch (error) {
    console.error('Erro ao listar produtos:', error);
    res.status(500).json({ error: 'Erro ao listar produtos' });
  }
});

// Adicionar produto
router.post('/', authMiddleware, upload.single('image'), (req, res) => {
  try {
    const { category, observation, tags } = req.body;
    
    if (!category || !req.file) {
      return res.status(400).json({ error: 'Categoria e imagem são obrigatórios' });
    }

    const imagePath = '/uploads/' + req.file.filename;

    const result = db.prepare(`
      INSERT INTO products (category, image_path, observation, tags, status)
      VALUES (?, ?, ?, ?, 'active')
    `).run(category, imagePath, observation || '', tags || '');

    res.json({
      success: true,
      product: {
        id: result.lastInsertRowid,
        category,
        image_path: imagePath,
        observation,
        tags
      }
    });
  } catch (error) {
    console.error('Erro ao adicionar produto:', error);
    res.status(500).json({ error: 'Erro ao adicionar produto' });
  }
});

// Atualizar produto
router.put('/:id', authMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    const { observation, tags, status } = req.body;

    db.prepare(`
      UPDATE products
      SET observation = ?, tags = ?, status = ?
      WHERE id = ?
    `).run(observation || '', tags || '', status || 'active', id);

    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao atualizar produto:', error);
    res.status(500).json({ error: 'Erro ao atualizar produto' });
  }
});

// Deletar produto
router.delete('/:id', authMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    
    // Buscar caminho da imagem
    const product = db.prepare('SELECT image_path FROM products WHERE id = ?').get(id);
    
    if (product) {
      // Deletar arquivo físico
      const filePath = path.join(__dirname, '../../public', product.image_path);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      
      // Deletar do banco
      db.prepare('DELETE FROM products WHERE id = ?').run(id);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao deletar produto:', error);
    res.status(500).json({ error: 'Erro ao deletar produto' });
  }
});

// Obter estatísticas
router.get('/stats', authMiddleware, (req, res) => {
  try {
    const total = db.prepare('SELECT COUNT(*) as count FROM products WHERE status = "active"').get().count;
    const campeoes = db.prepare('SELECT COUNT(*) as count FROM products WHERE category = "campeoes" AND status = "active"').get().count;
    const roupas = db.prepare('SELECT COUNT(*) as count FROM products WHERE category = "roupas" AND status = "active"').get().count;
    const novos = db.prepare('SELECT COUNT(*) as count FROM products WHERE category = "novos" AND status = "active"').get().count;

    res.json({
      success: true,
      stats: { total, campeoes, roupas, novos }
    });
  } catch (error) {
    console.error('Erro ao obter estatísticas:', error);
    res.status(500).json({ error: 'Erro ao obter estatísticas' });
  }
});

module.exports = router;
