# DevOps Avançado — Trabalho 2: Deploy automático em VM

## Integrantes

| Nome completo | R.A. |
|---|---|
| Kauã Aparecido de Matos | 250310 |
| Bruno Peclat Barbosa | 250291 |

## Sobre a aplicação

**Cadastro de Produtos** é um CRUD web simples. Cada produto tem nome, preço e quantidade, e a tela permite:

- **Create:** cadastrar um produto pelo formulário;
- **Read:** listar todos os produtos numa tabela;
- **Update:** editar um produto pelo botão *Editar*;
- **Delete:** excluir um produto pelo botão *Excluir*.

### Tecnologias

| Camada | Tecnologia |
|---|---|
| Backend (API REST) | Node.js 22 + Express |
| Banco de dados | PostgreSQL 16 |
| Frontend | HTML, CSS e JavaScript (`fetch`) |
| Containers | Docker + Docker Compose (sem Dockerfile, usando as imagens oficiais `node` e `postgres`) |
| Servidor | VM Ubuntu Server 26.04 no VirtualBox (rede em modo Bridge) |
| CI/CD | GitHub Actions com Runner local (self-hosted) |

### Estrutura

```
.
├── app/
│   ├── server.js              # API do CRUD (rotas /api/produtos)
│   ├── package.json           # dependências: express e pg
│   └── public/                # frontend (index.html, style.css, script.js)
├── docker-compose.yml         # sobe a aplicação (app) e o banco (db)
└── .github/workflows/
    └── deploy.yml             # Action de deploy automático
```

### Como o Docker Compose roda a aplicação

O `docker-compose.yml` define dois serviços:

- **`db`:** PostgreSQL. Os dados ficam no volume `dados-banco`, então os produtos não se perdem quando os containers são recriados. Um *healthcheck* (`pg_isready`) avisa quando o banco está pronto.
- **`app`:** usa a imagem oficial `node:22-alpine`, sem Dockerfile. A pasta `app/` do repositório é montada dentro do container (`./app:/app`), e o container roda `npm install && npm start`. Ele só inicia depois que o banco está saudável (`depends_on: condition: service_healthy`) e expõe a porta **8080** da VM, ligada à porta 3000 do Node.

## Runner local e deploy automático

### Como o Runner local funciona

O **GitHub Actions Runner** é um programa instalado na própria VM e registrado neste repositório (*Settings → Actions → Runners*). Ele roda como serviço do Linux (`svc.sh`), então inicia junto com a VM.

O Runner mantém uma conexão de saída com o GitHub e fica esperando jobs (*Listening for Jobs*). Como é a VM que se conecta ao GitHub, não é preciso IP público nem abrir portas no roteador. Quando um workflow pede `runs-on: self-hosted`, o GitHub entrega o job a esse Runner, e **os comandos executam dentro da VM**, onde a aplicação está rodando.

O Runner usa o usuário `kaua`, que pertence ao grupo `docker` e por isso pode executar `docker compose` sem `sudo`.

### Como a Action faz o deploy (`.github/workflows/deploy.yml`)

A Action roda a cada **push na branch `main`** (ou manualmente pela aba *Actions*):

1. **`actions/checkout`:** baixa a versão nova do código na pasta de trabalho do Runner, na VM.
2. **`docker compose -p crud-produtos up -d`:** sobe os containers caso ainda não existam. No primeiro deploy, cria o banco e a aplicação.
3. **`docker compose -p crud-produtos restart app`:** reinicia só o container da aplicação. Como a pasta do código está montada no container, o Node volta já com a versão nova. O banco não é reiniciado e mantém os dados.
4. **Verificação:** chama `http://localhost:8080/api/produtos` até a API responder. Se ela não responder, mostra os logs e marca o deploy como falho.

```
git push → GitHub → Runner na VM → checkout → restart do container → nova versão no navegador
```

Assim, qualquer alteração enviada ao GitHub aparece na VM sem deploy manual. Na demonstração, o texto da página mudou de "Versão 1.0" para "Versão 2.0" só com um `git push`, e os produtos já cadastrados continuaram no banco.

## Como acessar a aplicação na VM

1. Ligue a VM `vm-deploy` no VirtualBox. O Docker e o Runner iniciam sozinhos.
2. Descubra o IP da VM. No console da VM ou por SSH, rode:
   ```bash
   ip a
   ```
   Procure o IP da interface `enp0s3` (por exemplo, `192.168.3.17`). Como a rede está em modo Bridge, a VM recebe um IP da própria rede (do laboratório ou de casa), e esse IP pode mudar.
3. No navegador de qualquer computador da mesma rede, acesse:
   ```
   http://IP-DA-VM:8080
   ```
   Exemplo: `http://192.168.3.17:8080`

### Comandos úteis na VM

```bash
ssh kaua@IP-DA-VM                                  # acessar a VM pelo terminal
sudo ~/actions-runner/svc.sh status                # ver se o Runner está online
docker compose -p crud-produtos ps                 # ver os containers
docker compose -p crud-produtos logs app           # ver os logs da aplicação
```

Para rodar manualmente, sem o Runner, em uma máquina com Docker:

```bash
git clone https://github.com/kauaMatos05/trab-devops-Deploy-automatico-em-VM.git
cd trab-devops-Deploy-automatico-em-VM
docker compose up -d
# acessar http://localhost:8080
```
