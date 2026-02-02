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
const categoryRoutes = require('./src/routes/categoryRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());

app.use(express.static('public'));

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/team', teamRoutes);
app.use('/api/distribution', distributionRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/categories', categoryRoutes);

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/:username', (req, res) => {
  try {
    const username = req.params.username.toLowerCase();
    
    if (username === 'api' || username === 'admin') {
      return res.status(404).send('Página não encontrada');
    }
    
    const member = db.prepare('SELECT * FROM team_members WHERE LOWER(name) = ?').get(username);
    
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
            a { color: #00F2EA; text-decoration: none; }
          </style>
        </head>
        <body>
          <div>
            <h1>Funcionário não encontrado</h1>
            <p>O usuário "${username}" não existe no sistema.</p>
            <a href="/">← Voltar</a>
          </div>
        </body>
        </html>
      `);
    }
  } catch (error) {
    console.error('Erro ao buscar funcionário:', error);
    res.status(500).send('Erro no servidor');
  }
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`📱 Acesse: http://localhost:${PORT}`);
});
