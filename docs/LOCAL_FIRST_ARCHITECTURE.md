# Lia AI — arquitetura híbrida local-first

## Objetivo

A Lia deve iniciar e manter suas funções essenciais sem internet. A conexão amplia
as capacidades disponíveis, mas não é requisito para abrir o app, acessar os dados
locais ou conversar com o motor local.

## Limites de responsabilidade

### Núcleo local (deve funcionar offline)
- Interface e recursos estáticos embarcados no APK.
- Identidade, personalidade, perfis, configurações e histórico.
- Memórias locais e operações de leitura/gravação.
- Seleção e comunicação com o motor local.
- Recursos Android que tenham permissão e implementação nativa disponível.

### Serviços online (degradáveis)
- Login remoto e sincronização de conta.
- Google Calendar, Gmail, Drive e demais conectores.
- Pesquisa na web e provedores de IA remotos.
- Serviços externos de voz, push, WhatsApp e APIs personalizadas.
- Operações que dependam de credenciais ou de um backend remoto.

Nenhum serviço online pode bloquear a inicialização do núcleo local. Falhas de rede
devem produzir indisponibilidade localizada, não derrubar a conversa local.

## Estado atual auditado

- O frontend usa TanStack Start e a compilação atual produz artefatos público e
  servidor; não é seguro copiar apenas o diretório público para um APK.
- O cliente local llama.cpp já existe em `src/lib/lia/termux-llm.ts` e aponta para
  `127.0.0.1:8080`. Ainda depende de um processo llama-server iniciado no Termux.
- Conversas e Lia Card usam localStorage.
- A memória exportável usa IndexedDB + File System Access API, cuja disponibilidade
  e permissões variam entre navegador e WebView Android.
- Há funções TanStack server para conectores, IoT, agentes, TTS, push e WhatsApp.
- Capacitor Core e alguns plugins já estão nas dependências, mas o projeto Android
  completo e a configuração Capacitor ainda precisam ser montados.
- Existem fontes Kotlin em `native-android/`, mas ainda não formam um app Android
  Gradle completo.

## Ordem de migração

1. Criar uma camada única de estado de conectividade, sem acoplar o núcleo à rede.
2. Consolidar persistência local em uma interface de armazenamento com adaptador
   Android nativo e fallback web.
3. Tornar a interface principal uma shell estática embarcável, preservando as
   rotas necessárias e isolando funções server-only.
4. Integrar o motor local ao Android por uma ponte nativa/serviço local confiável.
5. Reintroduzir cada capacidade online como módulo opcional, com estados de
   indisponibilidade claros e sem bloquear o modo local.
6. Compilar e validar o APK em modo avião, com reinicialização e persistência real.

## Regras de segurança e compatibilidade

- Não remover funções server-side antes de mapear todos os seus consumidores.
- Não colocar chaves privadas de provedores no APK.
- Não expor o llama-server em interfaces de rede externas; manter acesso local.
- Não migrar dados nem alterar o formato atual da memória sem teste de compatibilidade.
- Manter a branch `main` intacta. Esta arquitetura é desenvolvida em `lia-ai/1.1`.
- Manter a família de versão 1.1; incrementos de patch somente quando houver release
  funcional e validada.

## Primeiro incremento

Foi adicionado `src/lib/lia/network.ts`, uma camada independente que consulta
Capacitor Network no Android e usa `navigator.onLine` como fallback web. Ela não
é chamada automaticamente pelo núcleo e não altera o comportamento atual.
