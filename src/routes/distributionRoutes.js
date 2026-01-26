const express = require('express');
const db = require('../database/database');
const { authMiddleware } = require('./authRoutes');

const router = express.Router();

// Função auxiliar para obter datas da semana
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

// Função para distribuir produtos
function distributeProducts(members, weekDates, distributionMode = 'different') {
  const distribution = {};
  
  weekDates.forEach(date => {
    distribution[date] = {};
    
    members.forEach(member => {
      distribution[date][member.id] = {
        memberName: member.name,
        products: {
          campeoes: [],
          roupas: [],
          novos: []
        }
      };
    });
  });

  // Buscar produtos por categoria com tratamento de erro
  let campeoes = [];
  let roupas = [];
  let novos = [];
  
  try {
    campeoes = db.prepare(`SELECT * FROM products WHERE category = ? AND status = ?`).all('campeoes', 'active');
    roupas = db.prepare(`SELECT * FROM products WHERE category = ? AND status = ?`).all('roupas', 'active');
    novos = db.prepare(`SELECT * FROM products WHERE category = ? AND status = ?`).all('novos', 'active');
  } catch (error) {
    console.error('Erro ao buscar produtos:', error);
    throw new Error('Erro ao buscar produtos do banco de dados');
  }

  console.log('Produtos encontrados:', {
    campeoes: campeoes.length,
    roupas: roupas.length,
    novos: novos.length
  });

  // Verificar se há produtos suficientes
  if (campeoes.length === 0 && roupas.length === 0 && novos.length === 0) {
    throw new Error('Nenhum produto encontrado. Adicione produtos antes de gerar a distribuição.');
  }

  // Função para selecionar produtos respeitando regra de 3 dias
  function selectProducts(products, count, usedInLast3Days) {
    if (products.length === 0) {
      return [];
    }
    
    const available = products.filter(p => !usedInLast3Days.includes(p.id));
    const selected = [];
    
    const toSelect = Math.min(available.length, count);
    
    for (let i = 0; i < toSelect; i++) {
      const randomIndex = Math.floor(Math.random() * available.length);
      selected.push(available.splice(randomIndex, 1)[0]);
    }
    
    // Se ainda precisar de mais produtos, usar os que foram usados
    if (selected.length < count && products.length > 0) {
      const remaining = count - selected.length;
      const usedProducts = products.filter(p => usedInLast3Days.includes(p.id));
      
      for (let i = 0; i < remaining && i < usedProducts.length; i++) {
        selected.push(usedProducts[i]);
      }
    }
    
    return selected;
  }

  // Rastrear produtos usados nos últimos 3 dias
  const usedProductsTracker = {};
  
  weekDates.forEach((date, dayIndex) => {
    const last3DaysProducts = {
      campeoes: [],
      roupas: [],
      novos: []
    };
    
    if (dayIndex > 0) {
      for (let i = Math.max(0, dayIndex - 3); i < dayIndex; i++) {
        const prevDate = weekDates[i];
        if (usedProductsTracker[prevDate]) {
          last3DaysProducts.campeoes.push(...usedProductsTracker[prevDate].campeoes);
          last3DaysProducts.roupas.push(...usedProductsTracker[prevDate].roupas);
          last3DaysProducts.novos.push(...usedProductsTracker[prevDate].novos);
        }
      }
    }
    
    usedProductsTracker[date] = {
      campeoes: [],
      roupas: [],
      novos: []
    };
    
    members.forEach((member, memberIndex) => {
      const productsPerCategory = Math.floor(member.products_per_day / 3);
      
      if (distributionMode === 'same') {
        // Modo IGUAL - todos recebem os mesmos produtos
        if (memberIndex === 0) {
          // Primeiro membro define os produtos
          const selectedCampeoes = selectProducts([...campeoes], productsPerCategory, last3DaysProducts.campeoes);
          const selectedRoupas = selectProducts([...roupas], productsPerCategory, last3DaysProducts.roupas);
          const selectedNovos = selectProducts([...novos], productsPerCategory, last3DaysProducts.novos);
          
          distribution[date][member.id].products.campeoes = selectedCampeoes;
          distribution[date][member.id].products.roupas = selectedRoupas;
          distribution[date][member.id].products.novos = selectedNovos;
          
          usedProductsTracker[date].campeoes.push(...selectedCampeoes.map(p => p.id));
          usedProductsTracker[date].roupas.push(...selectedRoupas.map(p => p.id));
          usedProductsTracker[date].novos.push(...selectedNovos.map(p => p.id));
        } else {
          // Outros membros recebem os mesmos produtos do primeiro
          const firstMemberId = members[0].id;
          distribution[date][member.id].products = {
            campeoes: [...distribution[date][firstMemberId].products.campeoes],
            roupas: [...distribution[date][firstMemberId].products.roupas],
            novos: [...distribution[date][firstMemberId].products.novos]
          };
        }
      } else {
        // Modo DIFERENTE - cada um recebe produtos diferentes
        const selectedCampeoes = selectProducts([...campeoes], productsPerCategory, last3DaysProducts.campeoes);
        const selectedRoupas = selectProducts([...roupas], productsPerCategory, last3DaysProducts.roupas);
        const selectedNovos = selectProducts([...novos], productsPerCategory, last3DaysProducts.novos);
        
        distribution[date][member.id].products.campeoes = selectedCampeoes;
        distribution[date][member.id].products.roupas = selectedRoupas;
        distribution[date][member.id].products.novos = selectedNovos;
        
        usedProductsTracker[date].campeoes.push(...selectedCampeoes.map(p => p.id));
        usedProductsTracker[date].roupas.push(...selectedRoupas.map(p => p.id));
        usedProductsTracker[date].novos.push(...selectedNovos.map(p => p.id));
      }
    });
  });
  
  return distribution;
}

// Gerar nova distribuição
router.post('/generate', authMiddleware, (req, res) => {
  try {
    const { week_start, distribution_mode } = req.body;
    
    if (!week_start) {
      return res.status(400).json({ error: 'Data de início da semana é obrigatória' });
    }

    // Buscar membros ativos
    const members = db.prepare('SELECT * FROM team_members WHERE active = 1').all();
    
    if (members.length === 0) {
      return res.status(400).json({ error: 'Nenhum membro ativo encontrado' });
    }

    const weekDates = getWeekDates(week_start);
    const weekEnd = weekDates[weekDates.length - 1];
    
    const distribution = distributeProducts(members, weekDates, distribution_mode || 'different');

    // Salvar distribuição
    const result = db.prepare(`
      INSERT INTO distributions (week_start, week_end, distribution_data, published)
      VALUES (?, ?, ?, 0)
    `).run(week_start, weekEnd, JSON.stringify(distribution));

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
    
    // Limpar distribuições antigas dos mesmos membros/datas
    Object.keys(distributionData).forEach(date => {
      Object.keys(distributionData[date]).forEach(memberId => {
        db.prepare('DELETE FROM employee_products WHERE member_id = ? AND date = ?').run(memberId, date);
      });
    });
    
    // Inserir novos produtos
    const insertStmt = db.prepare(`
      INSERT INTO employee_products (member_id, product_id, date)
      VALUES (?, ?, ?)
    `);
    
    Object.keys(distributionData).forEach(date => {
      Object.keys(distributionData[date]).forEach(memberId => {
        const memberData = distributionData[date][memberId];
        const allProducts = [
          ...memberData.products.campeoes,
          ...memberData.products.roupas,
          ...memberData.products.novos
        ];
        
        allProducts.forEach(product => {
          insertStmt.run(memberId, product.id, date);
          
          // Atualizar contadores do produto
          db.prepare(`
            UPDATE products
            SET times_used = times_used + 1,
                last_used_date = ?
            WHERE id = ?
          `).run(date, product.id);
        });
      });
    });
    
    // Marcar como publicada
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

// Obter distribuição ativa
router.get('/active', authMiddleware, (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    const distribution = db.prepare(`
      SELECT * FROM distributions
      WHERE published = 1
        AND week_start <= ?
        AND week_end >= ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(today, today);

    if (!distribution) {
      return res.json({ success: true, distribution: null });
    }

    res.json({
      success: true,
      distribution: {
        ...distribution,
        distribution_data: JSON.parse(distribution.distribution_data)
      }
    });
  } catch (error) {
    console.error('Erro ao obter distribuição ativa:', error);
    res.status(500).json({ error: 'Erro ao obter distribuição ativa' });
  }
});

module.exports = router;
