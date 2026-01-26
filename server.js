require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');

const db = require('./src/database/database');
const authRoutes = require('./src/routes/authRoutes');
const productRoutes = require('./src/routes/productRoutes');
const teamRoutes = require('./src/routes/teamRoutes');
const distributionRoutes = require('./src/routes/distributionRoutes');
const publicRoutes = require('./src/routes/publicRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// Criar pasta de uploads se não existir
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Middlewares
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());

// Servir arquivos estáticos
app.use(express.static('public'));

// Rotas da API
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/team', teamRoutes);
app.use('/api/distribution', distributionRoutes);
app.use('/api/public', publicRoutes);

// Rota principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Rota admin
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Rotas de funcionários (dinâmicas)
app.get('/:username', (req, res) => {
  try {
    const username = req.params.username.toLowerCase();
    
    // Evitar conflito com rotas da API
    if (username === 'api' || username === 'admin') {
      return res.status(404).send('Página não encontrada');
    }
    
    console.log('Buscando usuário:', username);
    
    // Verificar se o username existe no banco
    const member = db.prepare('SELECT * FROM team_members WHERE LOWER(name) = ?').get(username);
    
    console.log('Membro encontrado:', member);
    
    if (member) {
      res.sendFile(path.join(__dirname, 'public', 'employee.html'));
    } else {
      res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Funcionário não encontrado</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              background: #000;
              color: #fff;
              display: flex;
              align-items: center;
              justify-content: center;
              height: 100vh;
              margin: 0;
              text-align: center;
            }
            h1 { color: #FF0050; }
            p { color: #888; }
            a { 
              color: #00F2EA; 
              text-decoration: none;
              margin-top: 20px;
              display: inline-block;
            }
          </style>
        </head>
        <body>
          <div>
            <h1>Funcionário não encontrado</h1>
            <p>O usuário "${username}" não existe no sistema.</p>
            <a href="/">← Voltar para login</a>
          </div>
        </body>
        </html>
      `);
    }
  } catch (error) {
    console.error('Erro ao buscar funcionário:', error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Erro</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            background: #000;
            color: #fff;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            text-align: center;
          }
          h1 { color: #FF0050; }
          p { color: #888; }
          pre { 
            background: #1a1a1a; 
            padding: 20px; 
            border-radius: 10px;
            text-align: left;
            color: #00F2EA;
            overflow-x: auto;
          }
        </style>
      </head>
      <body>
        <div>
          <h1>Erro no servidor</h1>
          <p>Detalhes do erro:</p>
          <pre>${error.message}</pre>
          <a href="/" style="color: #00F2EA; text-decoration: none;">← Voltar</a>
        </div>
      </body>
      </html>
    `);
  }
});

// Tratamento de erros
app.use((err, req, res, next) => {
  console.error('Erro capturado:', err.stack);
  res.status(500).json({ 
    error: 'Erro interno do servidor',
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`📱 Acesse: http://localhost:${PORT}`);
  console.log(`📊 Ambiente: ${process.env.NODE_ENV}`);
});
