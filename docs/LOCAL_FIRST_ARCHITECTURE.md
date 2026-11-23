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
- Capacitor Core, Android, CLI e os plugins App, Browser, Device, Geolocation e
  Network estão nas dependências; `capacitor.config.ts` define o appId
  `app.lia.lia` e a pasta pública embarcada.
- O pipeline do GitHub Actions gera o projeto Gradle durante o build, sincroniza
  Capacitor e compila um APK debug. O diretório Android gerado não é versionado;
  a fonte de configuração permanece no repositório.
- Existem fontes Kotlin em `native-android/`, mas os serviços personalizados ainda
  não foram copiados/registrados no projeto Android gerado.
- Há chamadas a localStorage em módulos de preferências e integrações. Não é
  necessário migrar todas essas chaves na primeira etapa de persistência.

## Auditoria de persistência — 2026-11-22

### Dados principais

| Dado | Local atual | Leitura na inicialização | Observação |
| --- | --- | --- | --- |
| Lia Card | `lia.card.volume` em localStorage | Sim, se o cartão estiver montado | Contém identidade, perfis, memórias, configurações e até 200 mensagens de histórico |
| Estado montado | `lia.card.mounted` em localStorage | Sim | Apenas sinalizador de montagem; não é um cartão físico |
| Conversas | `lia.conversations` em localStorage | Sim | Até 60 conversas; cada conversa guarda até 200 mensagens |
| Conversa ativa | `lia.conversations.active` em localStorage | Sim | Guarda o ID da conversa selecionada |
| Arquivo de memória | `lia-memoria.json` na pasta escolhida | Não | O código grava uma cópia, mas não restaura esse arquivo ao iniciar |
| Handle da pasta | IndexedDB (`lia-memoria/handles`) | Sim, apenas para recuperar o handle | A API File System Access e as permissões não são garantidas em WebView Android |

### Achados e riscos

1. O Lia Card é a fonte principal da identidade e das memórias. Sem cartão montado,
   `persist()` atualiza apenas o estado React; não grava o cartão. Portanto, os dados
   pessoais não são persistidos de forma confiável sem criar/conectar um cartão.
2. O histórico de conversas é salvo separadamente em localStorage. Erros de gravação
   são ignorados silenciosamente; quando o armazenamento enche, a UI pode aparentar
   que salvou algo que não foi persistido.
3. `memory-store.ts` escreve `lia-memoria.json` quando uma pasta está configurada,
   mas `readMemories()` não participa da inicialização. Esse arquivo é uma cópia
   exportável, não a fonte ativa de memória.
4. A memória do perfil e o histórico também aparecem no Lia Card. Uma migração deve
   preservar o formato JSON, IDs, limites, perfis, configurações, rostos e integrações.
5. Lia Link lê e grava o cartão e as conversas diretamente; qualquer armazenamento
   novo precisa manter esse caminho de sincronização compatível.
6. O uso de localStorage e IndexedDB não significa que esses mecanismos falhem
   automaticamente no Android. A durabilidade deve ser testada no APK real, incluindo
   encerramento forçado, reinício, atualização e falta de espaço.
7. O seletor de pasta não pode ser tratado como requisito do modo offline Android.
   A exportação/importação JSON deve continuar disponível como backup portátil.

### Direção técnica recomendada

- Introduzir uma interface de repositório assíncrona para o Lia Card e as conversas,
  com adaptadores separados para Web e Capacitor Android.
- No Android, avaliar armazenamento privado persistente do app via Capacitor
  Filesystem para os documentos JSON. Avaliar SQLite apenas se a necessidade de
  transações/consultas superar a simplicidade de manter o formato portátil atual.
- Manter preferências pequenas em armazenamento chave/valor e não colocar histórico
  volumoso ou anexos em Preferences.
- Manter localStorage como adaptador web e fallback de compatibilidade durante a
  transição; não apagar dados antigos automaticamente.
- Fazer leitura/migração com cópia de segurança, validação de versão e escrita
  atômica/recuperável. Em caso de erro, não substituir um cartão válido por dados
  vazios ou incompletos.
- Inicializar/hidratar o armazenamento antes de permitir alterações no Provider.
  A API assíncrona exige migrar os consumidores, inclusive LiaProvider e Lia Link.
- Tornar explícito o resultado de cada gravação. Não ocultar quota, permissão ou
  falha de I/O como se o salvamento tivesse sido concluído.

## Ordem de migração

1. Criar uma camada única de estado de conectividade, sem acoplar o núcleo à rede.
2. Consolidar persistência local em uma interface de armazenamento com adaptador
   Android nativo e fallback web.
3. [Concluído parcialmente] Gerar uma shell SPA estática e empacotá-la com Capacitor
   em um APK debug; ainda falta validar a inicialização offline no aparelho.
4. Consolidar persistência local em uma interface de armazenamento com adaptador
   Android nativo e fallback web.
5. Integrar o motor local ao Android por uma ponte nativa/serviço local confiável.
6. Reintroduzir cada capacidade online como módulo opcional, com estados de
   indisponibilidade claros e sem bloquear o modo local.
7. Validar no aparelho: instalação, modo avião, reinicialização e persistência real.

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

## Segundo incremento

A auditoria de persistência documentou os locais atuais, as leituras/gravações,
a cópia externa que ainda não é restaurada e os consumidores que precisam ser
migrados. Nenhum dado, chave, formato ou comportamento da aplicação foi alterado
nesta etapa.

## Terceiro incremento

Foi criado `src/lib/lia/storage/adapter.ts` com o contrato assíncrono
`LiaKeyValueStore` e um adaptador Web para `localStorage`. As operações preservam
as chaves existentes e propagam erros de gravação, em vez de ocultá-los.

Este incremento é apenas a fundação: ainda não substitui as chamadas atuais do
Lia Card nem migra dados. O adaptador Android será implementado depois de adicionar
e configurar o plugin nativo de Filesystem; os consumidores serão migrados em
etapas separadas para evitar uma quebra geral da aplicação.


## Quarto incremento — shell estática e primeiro APK Android

- O TanStack Start foi configurado em SPA mode com saída estática em
  `.output/public/index.html`. O build manteve o pipeline Start e gerou a shell
  sem remover as funções server-side da versão hospedada.
- Foi adicionado `capacitor.config.ts` com `appId: app.lia.lia`,
  `appName: Lia AI` e `webDir: .output/public`.
- `@capacitor/android` e `@capacitor/cli` foram adicionados ao manifesto e o
  Bun lockfile foi atualizado pelo CI.
- O workflow agora prepara Java 21 e Android SDK, gera o projeto Android com
  `cap add android`, sincroniza plugins e executa `assembleDebug`.
- Execução validada: GitHub Actions run
  `45097059696` concluiu com sucesso; as etapas de build da shell, verificação
  do `index.html`, geração do projeto, sync Capacitor e compilação Gradle
  passaram. O artefato `lia-ai-android-debug` foi publicado.
- Limite desta validação: o APK foi compilado, mas ainda não foi instalado nem
  executado no Galaxy. O teste físico de inicialização offline continua pendente.
- Os serviços Kotlin de acessibilidade, bolha, notificações e foreground ainda
  não estão integrados no projeto gerado; não anunciar essas capacidades como
  disponíveis no APK atual.
