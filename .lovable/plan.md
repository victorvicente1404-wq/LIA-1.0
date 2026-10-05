# Notificações Web Push da Lia

## O que você vai ver
- Em Configurações, uma seção **Notificações** com:
  - Botão para ligar e desligar as notificações push
  - Status: Não solicitado / Ativado / Bloqueado / Não suportado
  - Botão **Enviar notificação de teste**
  - Quando o navegador bloqueia: passo a passo para liberar no Chrome, Safari (iPhone: adicionar à Tela de Início) e Firefox
- Notificações com o título "Lia • Assunto", o ícone da Lia, vibração curta e os botões **Abrir conversa** e **Dispensar**
- Ao clicar: abre a aba da Lia que já estiver aberta ou abre uma nova no lugar certo

## Avisos automáticos
1. **Agenda**: aviso 15 minutos antes de cada compromisso do Google Agenda conectado
2. **WhatsApp e pendências**: mensagens novas importantes chegam como push, mesmo com a aba fechada
3. **Rotinas**: você cria lembretes (ex: "todo dia 8h — beber água"), com hora e dias da semana
4. **Tarefas concluídas**: quando a Lia termina algo demorado com a aba escondida

## Plano B
- Se o navegador não aceitar push, ou o site não estiver em HTTPS, a Lia usa o aviso simples do navegador enquanto a aba estiver aberta
- Se uma inscrição expirar, a Lia apaga ela e se inscreve de novo sozinha

## Limites
- O push só funciona no app publicado, não no preview do editor
- No iPhone, só funciona depois de "Adicionar à Tela de Início" (iOS 16.4+)
- Os avisos da agenda e das rotinas com a aba fechada exigem login, para ligar a inscrição à sua conta

## Detalhes técnicos
- Chaves VAPID: a pública fica no app, a privada fica guardada como segredo no servidor
- Nova tabela `push_subscriptions` (user_id, endpoint único, p256dh, auth, card_id, user_agent) com RLS por `auth.uid()` e GRANTs; tabela `push_routines` para as rotinas
- Arquivo `public/sw.js` só com `push` e `notificationclick`, sem cache de páginas. É registrado apenas no app publicado e nunca no preview ou dentro de iframe; `?sw=off` desregistra
- Assinatura do push feita com Web Crypto (VAPID JWT ES256 + criptografia aes128gcm), compatível com o servidor, sem a biblioteca `web-push` que depende do Node
- Funções no servidor: `savePushSubscription`, `removePushSubscription`, `sendTestPush`. Respostas 404 ou 410 do serviço de push apagam a inscrição
- Rota `/api/public/push-cron` chamada a cada minuto pelo pg_cron, protegida por um segredo, para verificar a agenda (janela de 15 min, sem repetir aviso) e as rotinas
- O WhatsApp e as tarefas concluídas usam o mesmo envio no servidor; o aviso local atual fica como plano B
- Ícones `public/icon-192.png` e `public/badge.png` (monocromático) criados a partir do ícone oficial
- A memória da Lia não é alterada

---

# Parte 2: Extensões dinâmicas (APIs personalizadas e modelos de IA reservas)

## O que você vai ver no painel interno (senha atual)
- **Provedores de IA**: lista com setas para subir e descer. O de cima é o Primário, os outros são Reserva 1, 2, 3. Cada um tem ligar/desligar, editar, excluir e **Testar provedor**
- **Ferramentas**: formulário com nome, nome visível, descrição, endereço, método (GET, POST, PUT, DELETE), onde vão os parâmetros (automático, corpo, endereço), cabeçalhos com chaves e parâmetros. Botão **Testar API** mostra o status e a resposta na hora
- O visual, a órbita, o tema escuro e as abas continuam iguais. Só entram duas seções novas dentro do painel

## Como a Lia usa
- Ferramentas ativas viram ações que a Lia pode chamar sozinha no chat. O servidor faz a chamada e devolve o resultado para ela
- Fila de respostas: IA principal da Lovable, depois os seus provedores na ordem escolhida (cada um com limite de 7 segundos), depois o Gemini e a busca que já existem
- Você pode pedir no chat: "cadastre a API X". A Lia registra, explica para que serve e confirma que já está pronta

## Portabilidade
- Tudo fica salvo no Lia Card e entra no backup em JSON. A importação mescla pelo nome da API
- Com login, as APIs também ficam salvas na sua conta e são sincronizadas com o cartão

## Segurança
- As chaves ficam no Lia Card, como você pediu, e por isso aparecem no arquivo de backup. Guarde o arquivo com cuidado
- O servidor bloqueia endereços internos e privados, por exemplo localhost e 192.168.x. Por isso o Ollama no seu computador só funciona se estiver exposto por um endereço público (como um túnel)
- As respostas são limitadas em tamanho e tempo. Os cabeçalhos com as chaves nunca aparecem nos registros
- A memória da Lia não é alterada

## Detalhes técnicos
- Tabela `custom_api_integrations` com os campos pedidos e unique(user_id, name). Tem GRANTs e RLS com `auth.uid() = user_id`
- `customApis?: CustomApi[]` opcional em `LiaCardData`. O merge do backup trata esse campo
- O cliente envia as APIs ativas no `liaRespond`, com validação zod. Elas viram `tool()` dinâmicas com `jsonSchema()`
- `customProviders`: chamada no formato compatível com OpenAI (`/chat/completions`), com `AbortSignal.timeout(7000)`
- Meta-tool `register_new_api_tool`: o servidor devolve a definição criada. O cliente grava no Lia Card e, com login, também no banco
- Proteção SSRF: só https, ou http com host público. Bloqueia IPs privados e de loopback e limita a resposta a 20KB
- Funções no servidor `testCustomApi` e `testCustomProvider`
