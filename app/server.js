const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.json());           // entende JSON no corpo das requisições
app.use(express.static('public')); // serve os arquivos da pasta public (a tela)

// Conexão com o banco (os valores vêm do docker-compose.yml)
const db = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

// Cria a tabela se ainda não existir
async function criarTabela() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS produtos (
      id SERIAL PRIMARY KEY,
      nome VARCHAR(100) NOT NULL,
      preco NUMERIC(10,2) NOT NULL,
      quantidade INTEGER NOT NULL
    )
  `);
}

// CREATE - cadastrar produto
app.post('/api/produtos', async (req, res) => {
  const { nome, preco, quantidade } = req.body;
  const resultado = await db.query(
    'INSERT INTO produtos (nome, preco, quantidade) VALUES ($1, $2, $3) RETURNING *',
    [nome, preco, quantidade]
  );
  res.status(201).json(resultado.rows[0]);
});

// READ - listar produtos
app.get('/api/produtos', async (req, res) => {
  const resultado = await db.query('SELECT * FROM produtos ORDER BY id');
  res.json(resultado.rows);
});

// UPDATE - editar produto
app.put('/api/produtos/:id', async (req, res) => {
  const { nome, preco, quantidade } = req.body;
  const resultado = await db.query(
    'UPDATE produtos SET nome = $1, preco = $2, quantidade = $3 WHERE id = $4 RETURNING *',
    [nome, preco, quantidade, req.params.id]
  );
  res.json(resultado.rows[0]);
});

// DELETE - excluir produto
app.delete('/api/produtos/:id', async (req, res) => {
  await db.query('DELETE FROM produtos WHERE id = $1', [req.params.id]);
  res.status(204).end();
});

criarTabela().then(() => {
  app.listen(3000, () => console.log('Servidor rodando na porta 3000'));
});
