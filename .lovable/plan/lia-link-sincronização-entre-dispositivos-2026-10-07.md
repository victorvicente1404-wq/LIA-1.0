# Lia Link — sincronização entre dispositivos

## O que o usuário vai ver
- Novo selo no topo: "Lia Link ativo (N dispositivos)", "Sincronizando..." ou "Modo local". Ao tocar, aparece a lista de dispositivos (ex.: "Chrome no Windows") com botão "Desvincular".
- Janela "Lia Link / Parear dispositivo":
  - Dispositivo 1: "Gerar código de pareamento" → código de 6 dígitos (vale 10 min) + QR Code + campo de senha de sincronização.
  - Dispositivo 2: ler o QR ou digitar código + senha → "Sincronizar dispositivos".
  - No primeiro pareamento, mescla memórias, APIs, rostos, conversas e preferências dos dois lados (nada é apagado), usando a mesclagem que já existe para backups.
- Conversa espelhada: mensagens e respostas da Lia aparecem nos dois aparelhos na mesma conversa.
- Comandos cruzados: pedir no PC algo que só o celular faz (ou o contrário) envia a ordem ao outro aparelho, que executa e devolve o resultado ao chat.

## O que sincroniza
- Memórias, perfis/personalidade, voz, temas e configurações, histórico de conversas, APIs personalizadas, rostos cadastrados, IoT e WhatsApp (URL, chave, instância).
- Google (Agenda, Gmail, Drive, Docs, Slides): as permissões já ficam guardadas com segurança na conta do usuário no servidor. Não serão copiadas para os aparelhos; basta entrar na mesma conta nos dois aparelhos. Isso é mais seguro do que transferir as chaves do Google.

## Segurança
- Todo o conteúdo é criptografado no próprio aparelho com a senha de sincronização, antes de ir para a nuvem. O servidor só guarda dados cifrados e não consegue lê-los.
- Sem a senha, um aparelho novo não consegue ler nada. Esquecer a senha significa parear de novo.
- O sistema de memória continua igual: a sincronização só lê e grava o Lia Card existente; não cria outra memória.

## Offline
- Cada aparelho continua funcionando sozinho. Ao reconectar, envia o que mudou e aplica o que chegou. Em caso de conflito, prevalece a alteração mais recente. Listas (memórias, APIs, mensagens) são mescladas item por item.

## Detalhes técnicos
- Tabelas: `sync_spaces` (id, owner user_id, salt, verificador da senha), `sync_devices` (space_id, user_id, nome, plataforma, last_seen), `sync_pairings` (código de 6 dígitos, space_id, expires_at, used), `sync_blobs` (space_id, entity, item_id, ciphertext, iv, updated_at, deleted, device_id), `sync_commands` (space_id, target_device, payload cifrado, status, resultado cifrado). RLS: só quem é membro do espaço lê/escreve. Realtime ligado em `sync_blobs` e `sync_commands`.
- O pareamento exige estar com a conta aberta nos dois aparelhos (a mesma conta ou outra; quem resgata o código entra no espaço). Resgate do código via server function autenticada que valida a validade e marca como usado.
- Criptografia: Web Crypto, PBKDF2 (310k iterações, salt do espaço) → AES-GCM 256. Chave guardada no IndexedDB como não exportável.
- Granularidade: uma entrada por memória, mensagem, API, rosto; configurações e perfis como entradas únicas. Exclusões viram marcas de exclusão.
- Módulo novo `src/lib/lia/sync/` (crypto, engine, hook `useLiaLink`), integrado no `LiaProvider` observando mudanças do Lia Card e aplicando as remotas com a mesclagem existente. Chave do WhatsApp passa a entrar na sincronização cifrada.
- Comandos cruzados: nova ferramenta `comando_outro_dispositivo` (alvo "mobile" ou "desktop"), executada pelo aparelho alvo (USB, câmera, notificação local, abrir link) com resposta gravada no chat espelhado.
- QR Code com a biblioteca `qrcode`; leitura pela câmera com `BarcodeDetector` quando o navegador suportar, senão digitação do código.
