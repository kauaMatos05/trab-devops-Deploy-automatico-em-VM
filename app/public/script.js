const API = '/api/produtos';

const form = document.getElementById('form');
const lista = document.getElementById('lista');
const botao = document.getElementById('botao');

// READ - busca os produtos na API e monta a tabela
async function carregar() {
  const resposta = await fetch(API);
  const produtos = await resposta.json();

  lista.innerHTML = '';
  produtos.forEach((p) => {
    const linha = document.createElement('tr');
    linha.innerHTML = `
      <td>${p.id}</td>
      <td></td>
      <td>R$ ${Number(p.preco).toFixed(2)}</td>
      <td>${p.quantidade}</td>
      <td>
        <button class="editar">Editar</button>
        <button class="excluir">Excluir</button>
      </td>
    `;
    linha.children[1].textContent = p.nome; // textContent evita injeção de HTML
    linha.querySelector('.editar').onclick = () => editar(p);
    linha.querySelector('.excluir').onclick = () => excluir(p.id);
    lista.appendChild(linha);
  });
}

// CREATE e UPDATE - envia o formulário
form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const id = document.getElementById('id').value;
  const produto = {
    nome: document.getElementById('nome').value,
    preco: document.getElementById('preco').value,
    quantidade: document.getElementById('quantidade').value,
  };

  await fetch(id ? `${API}/${id}` : API, {
    method: id ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(produto),
  });

  form.reset();
  document.getElementById('id').value = '';
  botao.textContent = 'Adicionar';
  carregar();
});

// Preenche o formulário com os dados do produto para editar
function editar(p) {
  document.getElementById('id').value = p.id;
  document.getElementById('nome').value = p.nome;
  document.getElementById('preco').value = p.preco;
  document.getElementById('quantidade').value = p.quantidade;
  botao.textContent = 'Salvar';
}

// DELETE
async function excluir(id) {
  if (!confirm('Deseja excluir este produto?')) return;
  await fetch(`${API}/${id}`, { method: 'DELETE' });
  carregar();
}

carregar();
