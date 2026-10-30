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

O `docker-compose.yml` define dois serviços (containers) que sobem juntos: o banco de dados (`db`) e a aplicação (`app`).

#### Serviço `db`: banco de dados PostgreSQL

```yaml
db:
  image: postgres:16-alpine
  restart: unless-stopped
  environment:
    POSTGRES_USER: crud
    POSTGRES_PASSWORD: crud123
    POSTGRES_DB: produtos
  volumes:
    - dados-banco:/var/lib/postgresql/data
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U crud -d produtos"]
    interval: 5s
    retries: 10
```

- `image: postgres:16-alpine`: usa a imagem oficial do PostgreSQL 16, baixada do Docker Hub. A versão `alpine` é baseada no Alpine Linux, bem menor e mais leve.
- `restart: unless-stopped`: se o container cair ou a VM reiniciar, o Docker sobe o banco de novo sozinho. Só não reinicia se alguém parar o container manualmente.
- `environment:`: variáveis que a imagem do Postgres lê na **primeira vez** que sobe, para criar o usuário `crud`, a senha `crud123` e o banco `produtos`.
- `volumes: dados-banco:/var/lib/postgresql/data`: `/var/lib/postgresql/data` é a pasta onde o Postgres grava os dados, dentro do container. O volume `dados-banco` guarda essa pasta **fora** do container, no Docker da VM. Assim, mesmo que o container seja apagado e recriado, os produtos cadastrados continuam salvos.
- `healthcheck:`: um teste que o Docker roda periodicamente para saber se o banco está pronto para uso.
  - `pg_isready -U crud -d produtos`: comando do próprio Postgres que responde se o banco já aceita conexões.
  - `interval: 5s`: roda o teste a cada 5 segundos.
  - `retries: 10`: depois de 10 falhas seguidas, o container é marcado como *unhealthy*.
  - Quando o teste passa, o `docker compose ps` mostra o banco como `(healthy)`.

#### Serviço `app`: aplicação Node.js (sem Dockerfile)

```yaml
app:
  image: node:22-alpine
  restart: unless-stopped
  user: "1000:1000"
  working_dir: /app
  volumes:
    - ./app:/app
  command: sh -c "npm install && npm start"
  ports:
    - "8080:3000"
  environment:
    DB_HOST: db
    DB_USER: crud
    DB_PASSWORD: crud123
    DB_NAME: produtos
  depends_on:
    db:
      condition: service_healthy
```

- `image: node:22-alpine`: usa a imagem oficial do Node.js 22. Ela já tem o `node` e o `npm` instalados, mas **não tem o código** da aplicação.
- `restart: unless-stopped`: igual ao do banco. A aplicação volta sozinha se cair ou se a VM reiniciar.
- `user: "1000:1000"`: roda o container com o usuário de ID 1000, que é o mesmo do usuário `kaua` na VM. Por padrão, o container rodaria como `root`, e os arquivos que ele cria na pasta do projeto (como a `node_modules`) ficariam com dono `root`. O Runner, que roda como `kaua`, não conseguiria apagar esses arquivos no próximo deploy.
- `working_dir: /app`: a pasta onde os comandos do container são executados, como se fosse um `cd /app`.
- `volumes: ./app:/app`: **é isso que substitui o Dockerfile.** A pasta `app/` do repositório (onde está o `server.js`) aparece dentro do container em `/app`. O container não tem uma cópia do código: ele enxerga diretamente os arquivos da VM. Quando o Runner baixa um código novo, o container já vê os arquivos novos.
- `command: sh -c "npm install && npm start"`: o comando que roda quando o container inicia.
  - `npm install`: baixa as dependências do `package.json` (`express` e `pg`) para a pasta `node_modules`.
  - `&&`: só executa o próximo comando se o anterior deu certo.
  - `npm start`: roda o script `start` do `package.json`, que é `node server.js`.
  - `sh -c "..."`: executa os dois comandos juntos num shell, porque o `&&` é um recurso do shell.
- `ports: "8080:3000"`: liga a porta **8080 da VM** à porta **3000 do container**, onde o Node escuta. Quem acessa `http://IP-DA-VM:8080` chega no Node. O banco não tem `ports`, então ele **não fica acessível de fora** da VM, só pela aplicação.
- `environment:`: variáveis que o `server.js` lê com `process.env` para conectar no banco. Assim, os dados de conexão não ficam escritos no código.
  - `DB_HOST: db`: dentro do Docker Compose, cada serviço pode ser encontrado pelo **nome**. A aplicação acha o banco pelo nome `db`, sem precisar de IP.
- `depends_on: db: condition: service_healthy`: o `app` só é iniciado **depois** que o healthcheck do banco passar. Sem isso, o Node poderia tentar conectar enquanto o Postgres ainda está iniciando e daria erro.

#### Volume nomeado

```yaml
volumes:
  dados-banco:
```

- Declara o volume `dados-banco`, usado pelo serviço `db`. O Docker cria e gerencia esse volume. Ele só é apagado se alguém rodar `docker compose down -v` ou remover o volume manualmente.

## Runner local e deploy automático

### Como o Runner local funciona

O **GitHub Actions Runner** é um programa instalado na própria VM e registrado neste repositório (*Settings → Actions → Runners*). Ele roda como serviço do Linux (`svc.sh`), então inicia junto com a VM.

O Runner mantém uma conexão de saída com o GitHub e fica esperando jobs (*Listening for Jobs*). Como é a VM que se conecta ao GitHub, não é preciso IP público nem abrir portas no roteador. Quando um workflow pede `runs-on: self-hosted`, o GitHub entrega o job a esse Runner, e **os comandos executam dentro da VM**, onde a aplicação está rodando.

O Runner usa o usuário `kaua`, que pertence ao grupo `docker` e por isso pode executar `docker compose` sem `sudo`.

### Como a Action faz o deploy (`.github/workflows/deploy.yml`)

Resumo do fluxo:

```
git push → GitHub → Runner na VM → checkout → restart do container → nova versão no navegador
```

#### Quando a Action roda

```yaml
on:
  push:
    branches: [main]
  workflow_dispatch:
```

- `push: branches: [main]`: a Action começa sozinha sempre que um commit é enviado para a branch `main`.
- `workflow_dispatch`: permite também rodar manualmente, pelo botão *Run workflow* na aba *Actions*.

#### Onde a Action roda

```yaml
jobs:
  deploy:
    runs-on: self-hosted
```

- `jobs: deploy:` define um único job, chamado `deploy`.
- `runs-on: self-hosted` é o que faz o job rodar **na VM**. Sem essa linha, o GitHub usaria uma máquina dele na nuvem (`ubuntu-latest`), que não tem acesso à aplicação na VM. Com ela, o job vai para o Runner `vm-deploy`, e cada comando `run:` abaixo é executado no terminal da VM pelo usuário `kaua`.

#### Etapa 1: baixar o código mais recente

```yaml
- name: Baixar o código mais recente
  uses: actions/checkout@v5
```

- `uses:` chama uma Action pronta, mantida pelo próprio GitHub. A `actions/checkout` faz o equivalente a um `git clone` ou `git pull` do repositório.
- O código vai para a pasta de trabalho do Runner na VM: `~/actions-runner/_work/trab-devops-Deploy-automatico-em-VM/trab-devops-Deploy-automatico-em-VM`.
- Depois dessa etapa, essa pasta tem exatamente a versão do commit que disparou o deploy. É dela que o Docker Compose lê o `docker-compose.yml` e a pasta `app/`.

#### Etapa 2: subir os containers

```yaml
- name: Subir os containers (se ainda não estiverem rodando)
  run: docker compose -p crud-produtos up -d
```

- `docker compose`: lê o `docker-compose.yml` da pasta atual (a que o checkout acabou de atualizar).
- `-p crud-produtos`: dá um nome fixo ao projeto. O Compose usa esse nome para identificar os containers (`crud-produtos-app-1` e `crud-produtos-db-1`) e o volume do banco. Com o nome fixo, todo deploy mexe nos mesmos containers, em vez de criar outros.
- `up`: cria e inicia os serviços `db` e `app`. Se eles já existem e estão rodando, não faz nada.
- `-d` (*detached*): roda em segundo plano. Sem ele, o comando ficaria preso mostrando os logs e o job nunca terminaria.

No **primeiro deploy**, essa etapa baixa as imagens `postgres` e `node`, cria o volume `dados-banco` e sobe os dois containers. Nos deploys seguintes, ela só garante que os containers continuam de pé.

#### Etapa 3: reiniciar a aplicação com o código novo

```yaml
- name: Reiniciar a aplicação com o código novo
  run: docker compose -p crud-produtos restart app
```

- `restart app`: para e inicia de novo **só** o serviço `app`.
- O código já está atualizado dentro do container, porque a pasta `app/` está montada nele pelo volume `./app:/app`. Mas o processo do Node carregou a versão antiga na memória quando iniciou. Ao reiniciar, o container roda de novo `npm install && npm start`, e o Node passa a servir os arquivos novos.
- O serviço `db` **não** é reiniciado. Por isso o banco continua com os dados, e os produtos cadastrados não somem no deploy.

#### Etapa 4: verificar se a aplicação está respondendo

```yaml
- name: Verificar se a aplicação está respondendo
  run: |
    for i in $(seq 1 30); do
      if curl -fs http://localhost:8080/api/produtos > /dev/null; then
        echo "Aplicação no ar!"
        exit 0
      fi
      echo "Aguardando a aplicação subir ($i/30)..."
      sleep 5
    done
    echo "A aplicação não respondeu."
    docker compose -p crud-produtos logs app
    exit 1
```

Depois do restart, o Node leva alguns segundos para rodar o `npm install` e iniciar. Esta etapa confirma que o deploy deu certo, em vez de só presumir:

- `run: |`: o `|` permite escrever um script de várias linhas.
- `for i in $(seq 1 30)`: repete até 30 vezes.
- `curl -fs http://localhost:8080/api/produtos`: faz uma requisição para a API, de dentro da VM. O `-f` faz o `curl` falhar se a resposta for um erro HTTP (como 500), e o `-s` esconde a barra de progresso. O `> /dev/null` descarta o conteúdo da resposta, porque aqui só importa se deu certo ou não.
- Se a API responder: imprime `Aplicação no ar!` e `exit 0` encerra a etapa com **sucesso** (✅ no GitHub).
- Se não responder: `sleep 5` espera 5 segundos e tenta de novo. São até 30 tentativas, cerca de 2,5 minutos.
- Se nenhuma tentativa der certo: `docker compose ... logs app` mostra os logs do Node no próprio log da Action, para facilitar achar o erro, e `exit 1` marca o deploy como **falho** (❌ no GitHub).

#### Etapa 5: mostrar o status dos containers

```yaml
- name: Status dos containers
  run: docker compose -p crud-produtos ps
```

- `ps` lista os containers do projeto, com status (`Up`, `healthy`) e portas (`0.0.0.0:8080->3000/tcp`). Fica registrado no log de cada execução, como comprovação de como a VM ficou depois do deploy.

#### Resultado

Qualquer alteração enviada ao GitHub aparece na VM sem deploy manual. Na demonstração, o texto da página mudou de "Versão 1.0" para "Versão 2.0" só com um `git push`, e os produtos já cadastrados continuaram no banco. O log de cada etapa pode ser visto na aba **[Actions](https://github.com/kauaMatos05/trab-devops-Deploy-automatico-em-VM/actions)**: clique numa execução do workflow *Deploy na VM* e depois no job `deploy`.

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
