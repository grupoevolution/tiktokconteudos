const express = require('express');
const db = require('../database/database');
const { authMiddleware } = require('./authRoutes');

const router = express.Router();

function getWeekDates(startDate) {
  const dates = [];
  const start = new Date(startDate + 'T00:00:00');
  
  for (let i = 0; i < 5; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    dates.push(date.toISOString().split('T')[0]);
  }
  
  return dates;
}

// Nova lógica de distribuição
function calculateDistribution(productsPerDay) {
  // Lógica: 6 = 1V, 1R, 1M, 3N | 9 = 2V, 1R, 1M, 5N | 12 = 2V, 2R, 1M, 7N
  let validados = 1;
  let roupas = 1;
  let roupasMusica = 1;
  let novos = productsPerDay - 3; // Resto vai para novos
  
  if (productsPerDay >= 9) {
    validados = 2;
    novos = productsPerDay - 4;
  }
  
  if (productsPerDay >= 12) {
    roupas = 2;
    novos = productsPerDay - 5;
  }
  
  if (productsPerDay >= 15) {
    validados = 3;
    novos = productsPerDay - 6;
  }
  
  if (productsPerDay >= 18) {
    roupas = 3;
    novos = productsPerDay - 7;
  }
  
  return { validados, roupas, roupasMusica, novos };
}

function distributeProducts(members, weekDates, distributionMode = 'same') {
  const distribution = {};
  
  weekDates.forEach(date => {
    distribution[date] = {};
    members.forEach(member => {
      distribution[date][member.id] = {
        memberName: member.name,
        productsPerDay: member.products_per_day,
        products: {
          validados: [],
          roupas: [],
          roupas_musica: [],
          novos: []
        }
      };
    });
  });

  // Buscar produtos por categoria
  const validados = db.prepare(`
    SELECT p.* FROM products p
    JOIN categories c ON p.category_id = c.id
    WHERE c.slug = 'validados' AND p.status = 'active'
  `).all();
  
  const roupas = db.prepare(`
    SELECT p.* FROM products p
    JOIN categories c ON p.category_id = c.id
    WHERE c.slug = 'roupas' AND p.status = 'active'
  `).all();
  
  const roupasMusica = db.prepare(`
    SELECT p.* FROM products p
    JOIN categories c ON p.category_id = c.id
    WHERE c.slug = 'roupas-musica' AND p.status = 'active'
  `).all();
  
  const novos = db.prepare(`
    SELECT p.* FROM products p
    JOIN categories c ON p.category_id = c.id
    WHERE c.slug = 'novos' AND p.status = 'active'
  `).all();

  console.log('Produtos disponíveis:', {
    validados: validados.length,
    roupas: roupas.length,
    roupasMusica: roupasMusica.length,
    novos: novos.length
  });

  if (validados.length === 0 || roupas.length === 0 || roupasMusica.length === 0 || novos.length === 0) {
    throw new Error('Adicione produtos em todas as categorias antes de gerar distribuição');
  }

  function selectProducts(products, count, usedInLast3Days) {
    if (products.length === 0) return [];
    
    const available = products.filter(p => !usedInLast3Days.includes(p.id));
    const selected = [];
    const productsPool = available.length >= count ? available : products;
    
    for (let i = 0; i < Math.min(count, productsPool.length); i++) {
      const randomIndex = Math.floor(Math.random() * productsPool.length);
      selected.push(productsPool.splice(randomIndex, 1)[0]);
    }
    
    return selected;
  }

  const usedProductsTracker = {};
  
  weekDates.forEach((date, dayIndex) => {
    const last3DaysProducts = {
      validados: [],
      roupas: [],
      roupas_musica: [],
      novos: []
    };
    
    if (dayIndex > 0) {
      for (let i = Math.max(0, dayIndex - 3); i < dayIndex; i++) {
        const prevDate = weekDates[i];
        if (usedProductsTracker[prevDate]) {
          last3DaysProducts.validados.push(...usedProductsTracker[prevDate].validados);
          last3DaysProducts.roupas.push(...usedProductsTracker[prevDate].roupas);
          last3DaysProducts.roupas_musica.push(...usedProductsTracker[prevDate].roupas_musica);
          last3DaysProducts.novos.push(...usedProductsTracker[prevDate].novos);
        }
      }
    }
    
    usedProductsTracker[date] = {
      validados: [],
      roupas: [],
      roupas_musica: [],
      novos: []
    };
    
    // Modo SAME - todos recebem os mesmos produtos
    if (distributionMode === 'same') {
      const firstMember = members[0];
      const quantities = calculateDistribution(firstMember.products_per_day);
      
      const selectedValidados = selectProducts([...validados], quantities.validados, last3DaysProducts.validados);
      const selectedRoupas = selectProducts([...roupas], quantities.roupas, last3DaysProducts.roupas);
      const selectedRoupasMusica = selectProducts([...roupasMusica], quantities.roupasMusica, last3DaysProducts.roupas_musica);
      const selectedNovos = selectProducts([...novos], quantities.novos, last3DaysProducts.novos);
      
      members.forEach(member => {
        distribution[date][member.id].products.validados = [...selectedValidados];
        distribution[date][member.id].products.roupas = [...selectedRoupas];
        distribution[date][member.id].products.roupas_musica = [...selectedRoupasMusica];
        distribution[date][member.id].products.novos = [...selectedNovos];
      });
      
      usedProductsTracker[date].validados.push(...selectedValidados.map(p => p.id));
      usedProductsTracker[date].roupas.push(...selectedRoupas.map(p => p.id));
      usedProductsTracker[date].roupas_musica.push(...selectedRoupasMusica.map(p => p.id));
      usedProductsTracker[date].novos.push(...selectedNovos.map(p => p.id));
    } else {
      // Modo DIFFERENT
      members.forEach(member => {
        const quantities = calculateDistribution(member.products_per_day);
        
        const selectedValidados = selectProducts([...validados], quantities.validados, last3DaysProducts.validados);
        const selectedRoupas = selectProducts([...roupas], quantities.roupas, last3DaysProducts.roupas);
        const selectedRoupasMusica = selectProducts([...roupasMusica], quantities.roupasMusica, last3DaysProducts.roupas_musica);
        const selectedNovos = selectProducts([...novos], quantities.novos, last3DaysProducts.novos);
        
        distribution[date][member.id].products.validados = selectedValidados;
        distribution[date][member.id].products.roupas = selectedRoupas;
        distribution[date][member.id].products.roupas_musica = selectedRoupasMusica;
        distribution[date][member.id].products.novos = selectedNovos;
        
        usedProductsTracker[date].validados.push(...selectedValidados.map(p => p.id));
        usedProductsTracker[date].roupas.push(...selectedRoupas.map(p => p.id));
        usedProductsTracker[date].roupas_musica.push(...selectedRoupasMusica.map(p => p.id));
        usedProductsTracker[date].novos.push(...selectedNovos.map(p => p.id));
      });
    }
  });
  
  return distribution;
}

// Gerar nova distribuição
router.post('/generate', authMiddleware, (req, res) => {
  try {
    const { week_start, distribution_mode } = req.body;
    
    if (!week_start) {
      return res.status(400).json({ error: 'Data de início é obrigatória' });
    }

    const members = db.prepare('SELECT * FROM team_members WHERE active = 1').all();
    
    if (members.length === 0) {
      return res.status(400).json({ error: 'Nenhum membro ativo' });
    }

    const weekDates = getWeekDates(week_start);
    const weekEnd = weekDates[weekDates.length - 1];
    const productsPerDay = members[0].products_per_day;
    
    const distribution = distributeProducts(members, weekDates, distribution_mode || 'same');

    const result = db.prepare(`
      INSERT INTO distributions (week_start, week_end, products_per_day, distribution_mode, distribution_data, published)
      VALUES (?, ?, ?, ?, ?, 0)
    `).run(week_start, weekEnd, productsPerDay, distribution_mode || 'same', JSON.stringify(distribution));

    res.json({
      success: true,
      distribution_id: result.lastInsertRowid,
      distribution
    });
  } catch (error) {
    console.error('Erro ao gerar distribuição:', error);
    res.status(500).json({ 
      error: 'Erro ao gerar distribuição',
      message: error.message 
    });
  }
});

// Publicar distribuição
router.post('/publish/:id', authMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    
    const distribution = db.prepare('SELECT * FROM distributions WHERE id = ?').get(id);
    
    if (!distribution) {
      return res.status(404).json({ error: 'Distribuição não encontrada' });
    }

    const distributionData = JSON.parse(distribution.distribution_data);
    
    Object.keys(distributionData).forEach(date => {
      Object.keys(distributionData[date]).forEach(memberId => {
        db.prepare('DELETE FROM employee_products WHERE member_id = ? AND date = ?').run(memberId, date);
      });
    });
    
    const insertStmt = db.prepare(`
      INSERT INTO employee_products (member_id, product_id, date)
      VALUES (?, ?, ?)
    `);
    
    Object.keys(distributionData).forEach(date => {
      Object.keys(distributionData[date]).forEach(memberId => {
        const memberData = distributionData[date][memberId];
        const allProducts = [
          ...memberData.products.validados,
          ...memberData.products.roupas,
          ...memberData.products.roupas_musica,
          ...memberData.products.novos
        ];
        
        allProducts.forEach(product => {
          insertStmt.run(memberId, product.id, date);
          
          db.prepare(`
            UPDATE products
            SET times_used = times_used + 1,
                last_used_date = ?
            WHERE id = ?
          `).run(date, product.id);
        });
      });
    });
    
    db.prepare('UPDATE distributions SET published = 1 WHERE id = ?').run(id);

    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao publicar distribuição:', error);
    res.status(500).json({ error: 'Erro ao publicar distribuição' });
  }
});

// Listar distribuições
router.get('/', authMiddleware, (req, res) => {
  try {
    const distributions = db.prepare('SELECT * FROM distributions ORDER BY created_at DESC LIMIT 10').all();
    
    const formattedDistributions = distributions.map(d => ({
      ...d,
      distribution_data: JSON.parse(d.distribution_data)
    }));

    res.json({ success: true, distributions: formattedDistributions });
  } catch (error) {
    console.error('Erro ao listar distribuições:', error);
    res.status(500).json({ error: 'Erro ao listar distribuições' });
  }
});

module.exports = router;
