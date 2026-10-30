# Instalação publicada no IIS

Endereço: https://prototipos.brevia.company

O IIS usa o site e o pool `BreviaPrototipos`, com bindings HTTP e HTTPS com SNI. `C:\Sites\BreviaPrototipos` contém apenas o `web.config` do proxy; nenhum HTML privado ou banco está na raiz do IIS. HTTP redireciona para HTTPS, e respostas de erro do servidor são preservadas. O cabeçalho `X-Forwarded-Proto` é definido pelo proxy, com permissão limitada a este site.

O serviço automático `BreviaPrototipos` usa a identidade virtual `NT SERVICE\BreviaPrototipos` e escuta somente em `127.0.0.1:4607`. O código fica em `C:\BreviaPrototipos\app`, o banco em `C:\BreviaPrototipos\data` e os logs em `C:\BreviaPrototipos\logs`. O serviço tem leitura do código e do runtime e permissão de alteração apenas nos dados e logs. O Node 22.23.4 fica em uma pasta privada, sem substituir o Node dos demais sistemas.

O certificado foi emitido e vinculado ao site pelo win-acme, usando o identificador de renovação `brevia-prototipos`. A tarefa `BreviaPrototipos-CertificateRenewal` verifica essa renovação diariamente, sem alterar as tarefas dos demais sites. A tarefa `BreviaPrototipos-Backup` cria diariamente uma cópia consistente do SQLite em `C:\BreviaPrototipos\data\backups`. Ambas usam o horário da VM. As cópias também devem ser guardadas em armazenamento privado fora da VM conforme a política da empresa.

Os dados locais foram migrados, preservando usuários, senhas, empresas, protótipos e vínculos. As sessões locais foram excluídas somente da cópia enviada à VM, exigindo novo login no domínio público. A chave SSH não faz parte do projeto ou dos pacotes de publicação.

Para atualizar, execute o backup, transfira uma nova versão do código sem incluir `data/`, `node_modules/` ou credenciais, atualize as dependências com o npm do runtime privado e reinicie apenas o serviço `BreviaPrototipos`. Preserve `C:\BreviaPrototipos\data`. Não reinicie o IIS inteiro ou serviços da Lumi. Antes de reverter o banco, pare o serviço do portal e use uma cópia consistente.

Os arquivos `Install-Portal.ps1`, `BreviaPrototipos.xml` e `web.config` documentam a instalação. O script de instalação pressupõe que o banco, o código e o runtime privado já foram transferidos. O executável do serviço é o WinSW 2.12, copiado da instalação existente na VM. A emissão inicial do certificado usa o win-acme já instalado em `C:\Tools\win-acme`; não é executada novamente pelo instalador.
