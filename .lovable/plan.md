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
