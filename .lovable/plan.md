# Conectores da Lia — cada usuário conecta a própria conta

Objetivo: no app publicado, cada pessoa autoriza suas próprias contas e a Lia passa a ler/agir sobre os dados dela (agenda, e-mails, documentos, arquivos).

## O que dá para conectar hoje (por usuário)

Disponíveis no catálogo de conexões por usuário:

- Google Calendar — ver rotina, compromissos do dia
- Gmail — ler e enviar mensagens
- Google Docs — ler e editar documentos
- Google Drive — listar e abrir arquivos
- Google Slides — ler e editar apresentações
- Microsoft Word — ler e editar documentos .docx no OneDrive

Não disponíveis nesse modelo (cada usuário com a própria conta):

- Google Maps — é uma API por chave, sem login por usuário. Pode entrar depois como recurso do app (mesma chave para todos).
- Gemini Enterprise — só existe como conexão da sua conta, não por usuário.
- TikTok — idem: hoje só como conexão da sua conta.
- Perplexity — não existe conector; "usar outras IAs" já é atendido pelo modelo que a Lia usa hoje (Lovable AI).

Proposta: nesta etapa entregar os 6 conectores por usuário (4 Google + Slides + Word). Maps/Gemini/TikTok ficam para uma etapa seguinte, no modelo "conta única do app".


## Pré-requisitos (o app ainda não tem)

Conexão por usuário exige saber *quem* é o usuário e guardar a autorização dele com segurança. Hoje a Lia é 100% local (Lia Card no navegador), sem login.

1. Ativar o Lovable Cloud (banco + autenticação).
2. Tela de login/cadastro (e-mail e senha, e opcionalmente "Entrar com Google").
3. Tabela server-side que guarda, criptografada, a autorização de cada usuário por serviço.

A Lia continua funcionando sem login; os conectores é que ficam disponíveis só para quem entrar na conta.

## Interface

- Nova seção **Conectores** no painel lateral, ao lado de Módulos e Privacidade.
- Um cartão por serviço (Calendar, Gmail, Docs, Drive, Slides, Word) com estado: desconectado / conectado (com a conta) / erro, botão Conectar e Desconectar.
- Se o usuário não estiver logado, o cartão mostra "entre na sua conta para conectar".

## Como a Lia usa os dados

- Novo módulo **Serviços** na lista de módulos, ligável por perfil.
- A Lia recebe, no prompt, um resumo honesto do que está conectado (ex.: "Calendar conectado; Gmail conectado; Drive não conectado") — sem inventar acesso.
- Ações iniciais: próximos compromissos do dia, últimos e-mails não lidos, enviar e-mail (com confirmação antes de enviar), buscar arquivos no Drive por nome, ler e editar um documento do Docs, ler e editar slides no Google Slides, ler e editar documentos Word no OneDrive.
- Toda chamada aos serviços acontece no servidor, nunca no navegador.

## Detalhes técnicos

- Conectores por usuário: `google_calendar`, `google_mail`, `google_docs`, `google_drive`, `google_slides` e `microsoft_word`, ligados ao projeto via o fluxo de App User Connectors (um cliente OAuth por conector, aprovado por você em um cartão no chat).
- Google: um único cliente OAuth do Google Cloud atende todos os conectores Google. Redirect URI a cadastrar: `https://connector-gateway.lovable.dev/api/v1/app-users/oauth2/callback`.
- Microsoft: um registro de app no Entra ID atende o Word (mesmo redirect URI). Se for um app de tenant único, é preciso informar o Directory (tenant) ID.
- Escopos: leitura de Calendar; leitura + envio no Gmail; leitura/escrita em Docs e Slides; leitura de metadados e arquivos no Drive; `Files.ReadWrite` + `offline_access` no Microsoft.
- Chave de conexão de cada usuário guardada criptografada (AES-GCM) em `app_user_connections`, acessível só pelo service role.
- Chamadas via `callAsAppUser` em server functions dedicadas (`src/lib/lia/connectors.functions.ts`), com validação Zod da entrada.

- Correção pendente: o erro "useLia deve ser usado dentro de LiaProvider" — o provider será movido para envolver toda a árvore da rota, evitando o crash.

## Ordem de execução

1. Ativar Cloud + login e a tabela de conexões.
2. Ligar os 4 conectores Google e o fluxo de consentimento.
3. Painel Conectores no side panel.
4. Ações da Lia (agenda, e-mails, arquivos, documentos) e integração no prompt.
