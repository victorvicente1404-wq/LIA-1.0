# Wake Word e ativação por voz da Lia

Substituir a escuta contínua por um sistema de Wake Word ("Lia"), modular e com privacidade em primeiro lugar. Nada de personalidade, memória, visão, módulos, Lia Card, perfis, conectores ou chat muda — só a camada de entrada de voz e as telas de Configurações/Privacidade.

## Como vai funcionar

1. Microfone ligado → **🔵 Em espera** ("Aguardando Lia..."). Nada é interpretado nem enviado à IA.
2. Usuário diz "Lia, ..." → **🟣 Acordando** → **🟣 Ouvindo**.
3. Comando na mesma frase é aproveitado: "Lia, qual é a previsão do tempo?" envia só "qual é a previsão do tempo?".
4. Só "Lia." → a Lia responde "Sim?" e abre a janela de escuta.
5. Janela de escuta de ~8s sem fala (ou ~3s de silêncio após a fala) → volta sozinha para espera.
6. Enquanto a Lia fala, o áudio dela é ignorado (portão de estado + cancelamento de eco), mas um "Lia!" do usuário interrompe a fala e reabre a escuta.

## Motor de detecção (híbrido)

- **Porcupine (Picovoice), on-device**: usado automaticamente quando existirem a AccessKey e o arquivo de palavra personalizada `lia.ppn`. Detecção 100% local, sem enviar áudio. Vou documentar no app e no README como gerar os dois no console do Picovoice; a chave entra como segredo do projeto e o `.ppn` como arquivo do projeto.
- **Fallback do navegador**: sem chave, uso o `SpeechRecognition` em modo de baixa retenção — a transcrição parcial é descartada e nada vai para a IA até "Lia" aparecer. A tela de Privacidade avisa com clareza que, nesse modo, o Chrome processa o áudio nos servidores do Google.
- A troca entre motores é transparente para o resto do app.

## Voz e ambiente

- Captura com `echoCancellation`, `noiseSuppression` e `autoGainControl` ligados.
- VAD por energia (Web Audio) para marcar início/fim de fala e cortar ruído de fundo.
- Variações aceitas de pronúncia: "lia", "lía", "lya", "leah" no início ou após pausa — com limiar conservador para não disparar em conversa alheia.
- **SpeakerRecognition**: módulo e UI criados ("Minha voz": cadastrar / testar / remover / status), porém marcados honestamente como indisponíveis neste ambiente — sem simulação de identificação. A arquitetura fica pronta para plugar um provedor real.

## Estados visuais

Novos estados no orbe e no painel de chat: Em espera, Acordando, Ouvindo, Processando, Falando, Inativa — com as cores e animações já existentes da Lia.

## Configurações

Nova seção **Voz** (e complementos em Privacidade):

- Modo: Wake Word (padrão) ou Escuta contínua.
- Wake Word ativada/desativada; palavra de ativação exibida ("Lia").
- Escuta passiva ativada/desativada.
- Duração da janela de escuta.
- Identificação da minha voz (com aviso de indisponibilidade).
- Motor em uso: on-device (Porcupine) ou navegador, com explicação de privacidade.

## Detalhes técnicos

Nova pasta `src/lib/lia/voice/`:

```text
voice/
├── types.ts             contratos de todos os módulos
├── audio-processor.ts   getUserMedia + AEC/NS/AGC + grafo Web Audio
├── vad.ts               início/fim de fala por energia
├── wakeword/
│   ├── index.ts         seleção do motor (Porcupine → navegador)
│   ├── porcupine.ts     motor on-device (carregado dinamicamente)
│   └── browser.ts       motor de fallback
├── speaker-recognition.ts  stub honesto + enrollment local
├── transcription.ts     fala → texto (SpeechRecognition, provedor trocável)
└── controller.ts        máquina de estados idle→passive→waking→listening→processing→speaking
```

- `useVoice.ts` passa a ser um invólucro fino sobre `VoiceController`, preservando a API atual usada por `LiaWorkspace` e `ChatPanel` (mais os novos campos de estado).
- Novo tipo de estado em `types.ts` (`passive`, `waking`) e novas chaves de configuração de voz no `LiaCardData.settings`, com migração compatível (valores padrão para cards já existentes).
- Porcupine (`@picovoice/porcupine-web`) só é importado dinamicamente quando há chave, então o pacote não pesa no carregamento do fallback.
- O portão anti-eco fica no controller: enquanto o TTS toca, resultados de transcrição são descartados e apenas o detector de wake word segue ativo para permitir a interrupção.