# Use Node.js 18 LTS
FROM node:18-alpine

# Criar diretório da aplicação
WORKDIR /app

# Copiar package.json e package-lock.json
COPY package*.json ./

# Instalar dependências
RUN npm install --production

# Copiar todo o código
COPY . .

# Criar pasta de uploads
RUN mkdir -p public/uploads

# Expor porta 3000
EXPOSE 3000

# Comando para iniciar
CMD ["npm", "start"]
