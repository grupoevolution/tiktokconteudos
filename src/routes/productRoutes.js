const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../database/database');
const { authMiddleware } = require('./authRoutes');

const router = express.Router();

// Configurar multer para upload de 2 imagens
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
  limits: { fileSize: 10 * 1024 * 1024 },
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
    const { category_id, subcategory_id, status, search } = req.query;
    let query = `
      SELECT p.*, c.name as category_name, c.slug as category_slug, 
             s.name as subcategory_name 
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN subcategories s ON p.subcategory_id = s.id
      WHERE 1=1
    `;
    const params = [];

    if (category_id) {
      query += ' AND p.category_id = ?';
      params.push(category_id);
    }

    if (subcategory_id) {
      query += ' AND p.subcategory_id = ?';
      params.push(subcategory_id);
    }

    if (status) {
      query += ' AND p.status = ?';
      params.push(status);
    }

    if (search) {
      query += ' AND (p.observation LIKE ? OR p.copy_text LIKE ? OR p.tags LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY p.created_at DESC';

    const products = db.prepare(query).all(...params);
    res.json({ success: true, products });
  } catch (error) {
    console.error('Erro ao listar produtos:', error);
    res.status(500).json({ error: 'Erro ao listar produtos' });
  }
});

// Adicionar produto (2 imagens + link + copy)
router.post('/', authMiddleware, upload.fields([
  { name: 'product_image', maxCount: 1 },
  { name: 'reference_image', maxCount: 1 }
]), (req, res) => {
  try {
    const { category_id, subcategory_id, video_link, copy_text, observation, tags } = req.body;
    
    if (!category_id || !req.files.product_image || !req.files.reference_image || !video_link || !copy_text) {
      return res.status(400).json({ error: 'Todos os campos são obrigatórios: categoria, 2 imagens, link e copy' });
    }

    const productImagePath = '/uploads/' + req.files.product_image[0].filename;
    const referenceImagePath = '/uploads/' + req.files.reference_image[0].filename;

    const result = db.prepare(`
      INSERT INTO products (category_id, subcategory_id, product_image, reference_image, video_link, copy_text, observation, tags, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')
    `).run(
      category_id, 
      subcategory_id || null, 
      productImagePath, 
      referenceImagePath, 
      video_link, 
      copy_text, 
      observation || '', 
      tags || ''
    );

    res.json({
      success: true,
      product: {
        id: result.lastInsertRowid,
        category_id,
        subcategory_id,
        product_image: productImagePath,
        reference_image: referenceImagePath,
        video_link,
        copy_text
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
    const { video_link, copy_text, observation, tags, status, category_id, subcategory_id } = req.body;

    db.prepare(`
      UPDATE products
      SET video_link = COALESCE(?, video_link),
          copy_text = COALESCE(?, copy_text),
          observation = COALESCE(?, observation),
          tags = COALESCE(?, tags),
          status = COALESCE(?, status),
          category_id = COALESCE(?, category_id),
          subcategory_id = COALESCE(?, subcategory_id)
      WHERE id = ?
    `).run(video_link, copy_text, observation, tags, status, category_id, subcategory_id, id);

    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao atualizar produto:', error);
    res.status(500).json({ error: 'Erro ao atualizar produto' });
  }
});

// Mover produto para Validados
router.post('/:id/validate', authMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    
    // Buscar categoria "Produtos Validados"
    const validadosCategory = db.prepare('SELECT id FROM categories WHERE slug = ?').get('validados');
    
    if (!validadosCategory) {
      return res.status(400).json({ error: 'Categoria "Produtos Validados" não encontrada' });
    }
    
    // Mover produto
    db.prepare('UPDATE products SET category_id = ? WHERE id = ?').run(validadosCategory.id, id);

    res.json({ success: true, message: 'Produto movido para Validados' });
  } catch (error) {
    console.error('Erro ao validar produto:', error);
    res.status(500).json({ error: 'Erro ao validar produto' });
  }
});

// Deletar produto
router.delete('/:id', authMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    
    const product = db.prepare('SELECT product_image, reference_image FROM products WHERE id = ?').get(id);
    
    if (product) {
      // Deletar imagens físicas
      [product.product_image, product.reference_image].forEach(imagePath => {
        const filePath = path.join(__dirname, '../../public', imagePath);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      });
      
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
    const total = db.prepare('SELECT COUNT(*) as count FROM products WHERE status = ?').get('active').count;
    
    const validados = db.prepare(`
      SELECT COUNT(*) as count FROM products p
      JOIN categories c ON p.category_id = c.id
      WHERE c.slug = 'validados' AND p.status = 'active'
    `).get().count;
    
    const roupas = db.prepare(`
      SELECT COUNT(*) as count FROM products p
      JOIN categories c ON p.category_id = c.id
      WHERE c.slug = 'roupas' AND p.status = 'active'
    `).get().count;
    
    const roupasMusica = db.prepare(`
      SELECT COUNT(*) as count FROM products p
      JOIN categories c ON p.category_id = c.id
      WHERE c.slug = 'roupas-musica' AND p.status = 'active'
    `).get().count;
    
    const novos = db.prepare(`
      SELECT COUNT(*) as count FROM products p
      JOIN categories c ON p.category_id = c.id
      WHERE c.slug = 'novos' AND p.status = 'active'
    `).get().count;

    res.json({
      success: true,
      stats: { 
        total: total || 0,
        validados: validados || 0,
        roupas: roupas || 0,
        roupas_musica: roupasMusica || 0,
        novos: novos || 0
      }
    });
  } catch (error) {
    console.error('Erro ao obter estatísticas:', error);
    res.status(500).json({ error: 'Erro ao obter estatísticas' });
  }
});

module.exports = router;
