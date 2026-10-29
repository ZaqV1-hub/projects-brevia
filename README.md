# Portal de protótipos Brevia

Portal em português, com o visual do HTML de referência: Poppins e Inter, cores Brevia, login, galeria com busca, administração e visualizador responsivo. O protótipo de referência foi usado como design; seus usuários, senhas e projetos fictícios não fazem parte do portal.

## Executar localmente

Requer Node.js 22.13 ou superior (Node 24 LTS recomendado). O SQLite já vem no Node, sem serviço de banco separado.

```powershell
npm ci
npm run setup
npm start
```

Abra http://localhost:3000. A configuração inicial cria `zaq@brevia.local` e imprime uma senha aleatória uma única vez. A troca é obrigatória no primeiro acesso. Não há senha padrão no código. Executar o setup novamente preserva o administrador existente.

É possível escolher o e-mail e a senha inicial pelas variáveis `ADMIN_EMAIL` e `ADMIN_PASSWORD` antes do setup. A senha deve ter pelo menos 12 caracteres e até 72 bytes. Não coloque credenciais em arquivos versionados. `.env.example` documenta as opções; para carregar um arquivo `.env` local, use `node --env-file=.env server.js` e `node --env-file=.env scripts/setup.js`.

Para importar o HTML Estância na primeira configuração:

```powershell
node scripts/setup.js "J:\My Drive\Brevia-Projects\Estancia\Aplicativo dos Representantes\Protótipo app Estância Representantes.html"
```

A importação acontece somente se não existir nenhum protótipo. Ele fica disponível apenas ao administrador até que acessos sejam atribuídos.

## Uso

Em Administração, publique um HTML com nome, cliente, descrição e pessoas autorizadas. Em Pessoas, crie os logins dos clientes com senhas provisórias. A pessoa deverá criar sua própria senha no primeiro acesso. A administração permite editar nome, empresa, e-mail, protótipos liberados, redefinir senha e desativar o login. Desativar ou redefinir senha invalida as sessões daquele usuário imediatamente.

Em “Editar / acessos”, ajuste os dados do protótipo e as pessoas autorizadas. “Nova versão” substitui o HTML, incrementa v1, v2 etc. e preserva as permissões. O contador não é um histórico recuperável: o HTML anterior é substituído. A remoção exige digitar REMOVER e apaga o HTML e as permissões.

Clientes só recebem os metadados dos protótipos liberados para eles. Os cards têm miniaturas isoladas e a busca aceita palavras com ou sem acento. O visualizador oferece desktop, tablet, celular, recarregar e tela cheia. No celular, as tabelas administrativas podem ser deslizadas horizontalmente.

## Segurança e limites

Os HTMLs ficam como BLOBs no banco privado `data/portal.sqlite`, fora dos arquivos servidos. O servidor expõe somente três arquivos do portal por caminhos explícitos. Não existe rota de download. Cada entrega de HTML exige sessão ativa, senha definitiva e autorização consultada no banco; copiar o link não concede acesso.

Senhas usam bcrypt com custo 12. A sessão de oito horas usa um token aleatório; o banco guarda apenas seu SHA-256. O cookie é HttpOnly, SameSite=Strict e Secure em produção. Mutações exigem origem exata e token CSRF, com exceção do login, que exige origem exata. Há limitação de tentativas de login e de solicitações da API. Consultas usam parâmetros, os uploads são limitados a 10 MB e os dados apresentados no portal são escapados.

O iframe e a resposta HTTP têm sandbox com `allow-scripts allow-forms`, sem `allow-same-origin`. O HTML permanece isolado mesmo aberto diretamente na aba. Formulários simulados podem disparar seus eventos JavaScript; o envio para servidores, chamadas fetch/XHR, frames internos e acesso ao portal são bloqueados pela política de conteúdo. Scripts, imagens, estilos e fontes HTTPS externos são permitidos para compatibilidade com protótipos. Esses recursos precisam de conexão e disponibilidade do fornecedor. Os arquivos devem ser autocontidos: CSS, scripts e imagens locais relativos não são hospedados junto do HTML. Protótipos que dependem de localStorage, cookies, APIs reais, downloads ou popups precisam ser adaptados ao isolamento.

Um usuário autorizado consegue inspecionar ou salvar o HTML recebido no navegador. Não há como exibir HTML interativo e esconder completamente seu código. O controle protege a distribuição para pessoas sem autorização. Revogação bloqueia novas entregas, mas não remove conteúdo já carregado. `robots.txt`, meta robots e X-Robots-Tag pedem a não indexação; a proteção efetiva é a autenticação.

## Testes

```powershell
npm test
```

Testes de integração cobrem autenticação, cookies, hash, autorização por cliente, acesso direto ao HTML, proteção da administração, CSRF e origem, versões, revogação, persistência, desativação, senha provisória, e-mail duplicado, upload inválido, arquivos privados, remoção e logout. Usam banco temporário separado dos dados locais.

## Instalar na máquina virtual depois da aprovação

O projeto está preparado para um servidor Node atrás de um proxy HTTPS. Ainda não houve publicação em produção.

Configure `NODE_ENV=production`, `APP_ORIGIN=https://seu-dominio` e `HOST=127.0.0.1`. O proxy deve encaminhar para a porta 3000 e informar `X-Forwarded-Proto: https`. O portal confia em um único salto de proxy; a porta Node não deve ficar exposta diretamente. Use exatamente o domínio configurado: login por outra origem é recusado. Em produção o cookie exige HTTPS.

O Dockerfile usa Node 24 e usuário sem privilégios. Com um `.env` contendo `APP_ORIGIN=https://seu-dominio`, execute na VM:

```sh
docker compose build
docker compose run --rm portal node scripts/setup.js
docker compose up -d
```

O domínio e o proxy HTTPS devem apontar para `127.0.0.1:3000`. O volume `portal-data` persiste usuários, sessões, acessos e HTMLs. Para migrar os dados locais, restaure um backup do banco nesse volume com o serviço parado e as permissões do usuário `node`.

Antes da migração ou de uma atualização, execute `npm run backup`. O comando usa o mecanismo de backup do SQLite por `VACUUM INTO`, criando uma cópia consistente em `data/backups/`, mesmo com o portal ativo. Guarde cópias em local privado separado. Para restaurar, pare o serviço e substitua `portal.sqlite` pela cópia; remova os arquivos auxiliares `portal.sqlite-wal` e `portal.sqlite-shm` antigos somente com todas as conexões fechadas. Depois reinicie o serviço.

## Organização

`server.js` contém as rotas e a segurança HTTP, `db.js` cria o banco, `public/` contém a interface, `scripts/setup.js` cria o administrador e importa o primeiro protótipo, e `test/` contém os testes de integração. `data/`, senhas, dependências e arquivos `.env` ficam fora do Git.
