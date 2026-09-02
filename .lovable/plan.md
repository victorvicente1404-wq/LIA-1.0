# Corrigir conectores + wake word e melhoria de áudio

## Parte 1 — Erro `client_not_found` nos conectores Google

O erro `App User OAuth start failed (404): client_not_found` significa que o gateway não reconhece mais a chave de cliente OAuth que o app envia. Como as chaves/clients dos conectores foram alteradas, as variáveis sincronizadas no projeto (`GOOGLE_*_APP_USER_CONNECTOR_CLIENT_API_KEY`) ficaram inválidas — hoje nenhuma delas aparece na lista de secrets do projeto.

A correção não é editar código: é religar os clients corretos ao projeto, o que ressincroniza as chaves.

1. Religar os 5 conectores Google (um card de aprovação por conector, onde você escolhe o client correto ou cria um novo): `google_calendar`, `google_mail`, `google_drive`, `google_docs`, `google_slides`.
2. Verificar que as variáveis `GOOGLE_*_APP_USER_CONNECTOR_CLIENT_API_KEY` voltaram aos secrets do projeto e reiniciar o servidor.
3. Testar no preview: login → seção Conectores → "Conectar", confirmando que o popup do Google abre sem o erro 404, e validar uma leitura real (próximos eventos da Agenda).

Nenhum arquivo precisa mudar: `src/server/connectors.server.ts` já lê as variáveis corretas.
Se a chave de criptografia (`APP_USER_CONNECTION_KEY_SECRET`) também tiver mudado, as conexões antigas não podem mais ser descriptografadas e cada usuário precisará reconectar.

## Parte 2 — Wake word ("Lia")

Ativação por voz sem precisar clicar no microfone.

- Novo modo de escuta em `useVoice`: **dormindo** (só procura a palavra de ativação) → **ativa** (conversa normal) → volta a dormir após um período de silêncio.
- Palavra de ativação padrão "Lia", configurável no painel lateral (Configurações), com opção de desligar totalmente a wake word.
- Detecção tolerante: normaliza acentos/maiúsculas e aceita variações no início da frase ("lia,", "ei lia", "olá lia"). O texto após a palavra já entra como primeira pergunta.
- Frase de despertar curta e feedback visual: o orbe e o selo de status mostram "Dormindo / Ouvindo / Pensando / Falando".

## Parte 3 — Captação de áudio e redução de ruído

- Abrir o microfone com `getUserMedia` usando `echoCancellation`, `noiseSuppression` e `autoGainControl` ativados, além de canal mono e taxa de amostragem adequada — isso reduz ruído de fundo e evita que a Lia escute a própria voz.
- Medidor de nível de áudio com `AudioContext`/`AnalyserNode`: calcula o volume em tempo real, estabelece um piso de ruído do ambiente e só considera "fala" o que passa desse piso. Isso corta falsos disparos causados por ventilador, TV ou teclado.
- Detecção de fim de fala por silêncio (VAD simples): após ~1,2 s abaixo do limiar, o trecho é considerado concluído e enviado — evita cortes no meio da frase e esperas longas.
- Interrupção mais confiável: a Lia só para de falar quando o nível de voz supera o limiar por alguns quadros seguidos, não em qualquer estalo.
- Barra de nível de áudio no painel de percepção e controle de sensibilidade nas Configurações.

## Detalhes técnicos

- `src/lib/lia/audio.ts` (novo): captura da stream com constraints de supressão de ruído, analisador de nível, calibração do piso de ruído e detecção de silêncio.
- `src/lib/lia/useVoice.ts`: novos estados (`sleeping`, `active`, `hearing`, `processing`), integração com o analisador, lógica de wake word e retomada automática da escuta.
- `src/lib/lia/wake-word.ts` (novo): normalização e correspondência da palavra de ativação.
- `src/lib/lia/types.ts` / `defaults.ts`: preferências novas (wake word, sensibilidade, tempo de silêncio) persistidas no Lia Card.
- `src/components/lia/ChatPanel.tsx` e `PerceptionPanel.tsx`: selo de estado, barra de nível.
- `src/components/lia/SidePanel.tsx`: controles em Configurações.

## Parte 4 — Ícone da Lia (favicon e identidade)

- Gerar um único ícone da Lia (orbe roxo luminoso sobre preto profundo, minimalista e futurista), em quadrado.
- Aplicar como favicon em `public/` e referenciar em `src/routes/__root.tsx`, substituindo o padrão.
- Reaproveitar o mesmo ícone no cabeçalho do app e no Lia Card, para identidade consistente.

## Parte 5 — WhatsApp (ideia: Lia como extensão no PC e no celular)

Não existe conector oficial "por usuário" de WhatsApp pessoal: a Meta só permite integração via **WhatsApp Business Cloud API**, com um número de negócio, conta Meta Business verificada e um webhook. Ler ou automatizar o WhatsApp pessoal por extensão de navegador (WhatsApp Web) viola os termos da Meta e quebra a cada atualização — não recomendo esse caminho.

Caminho viável, a implementar depois das partes 1–4:

- Endpoint público de webhook (`/api/public/whatsapp`) com verificação de assinatura da Meta.
- Vínculo do número do usuário à conta na Lia (código de confirmação enviado por WhatsApp).
- A Lia responde no WhatsApp com a mesma personalidade, memória e conectores — funciona no celular e no PC porque é o próprio WhatsApp do usuário conversando com o número da Lia.
- Requer: número/conta WhatsApp Business e as credenciais da Meta (token e segredo do webhook), que você fornece quando chegarmos nesta etapa.

Se preferir algo mais simples antes disso, dá para começar por "enviar resumos da Lia no WhatsApp" (só saída), que exige a mesma conta Business mas menos fluxo.
