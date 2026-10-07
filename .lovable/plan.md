# Notificações Push reais da Lia

## O que você vai ver
- Em Configurações, uma seção **Notificações** com:
  - Botão para ligar e desligar as notificações
  - Status: Não solicitado / Ativado / Bloqueado / Não suportado
  - Botão **Enviar notificação de teste**
  - Quando o navegador bloqueia: passo a passo para liberar no Chrome, Safari (iPhone: adicionar à Tela de Início) e Firefox
- Notificações com o título "Lia • Assunto", o ícone da Lia, vibração curta e os botões **Abrir conversa** e **Dispensar**
- Ao tocar: abre a aba da Lia que já estiver aberta ou abre uma nova

## Avisos automáticos (mesmo com a aba fechada)
1. **Agenda**: 15 minutos antes de cada compromisso do Google Agenda conectado
2. **WhatsApp**: mensagens novas importantes
3. **Rotinas**: lembretes que você cria (ex: "todo dia 8h — beber água"), com hora e dias da semana
4. **Tarefas concluídas**: quando a Lia termina algo com a aba escondida

## Plano B
- Sem suporte a push, a Lia usa o aviso simples do navegador enquanto a aba estiver aberta
- Inscrição expirada é apagada e refeita sozinha

## Limites
- Funciona só no app publicado, não no preview do editor
- No iPhone, só depois de "Adicionar à Tela de Início" (iOS 16.4+)
- Avisos com a aba fechada exigem login
- WhatsApp com a aba fechada exige que a chave da Evolution fique guardada no servidor (hoje ela fica só no navegador); sem isso, o aviso do WhatsApp só chega com a aba aberta

## Detalhes técnicos
- Chaves VAPID: pública no app, privada como segredo no servidor
- Tabelas `push_subscriptions` e `push_routines` com RLS por `auth.uid()` e GRANTs
- `public/sw.js` só com `push` e `notificationclick`, sem cache; registrado apenas fora do preview/iframe
- Envio com Web Crypto (VAPID ES256 + aes128gcm), sem a biblioteca `web-push`
- Server functions `savePushSubscription`, `removePushSubscription`, `sendTestPush`; 404/410 apagam a inscrição
- Rota `/api/public/push-cron` chamada a cada minuto pelo pg_cron, protegida por segredo, para agenda e rotinas
- Ícones `public/icon-192.png` e `public/badge.png` a partir do ícone oficial
- A memória da Lia não é alterada
