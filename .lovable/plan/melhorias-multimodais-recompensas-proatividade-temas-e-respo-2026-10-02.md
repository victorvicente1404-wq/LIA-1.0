# Melhorias multimodais, recompensas, proatividade, temas e responsividade

## Objetivo
Entregar o pacote solicitado sem substituir, migrar ou alterar a estrutura de memória da Lia. O histórico, as memórias, a personalidade e o fluxo atual de armazenamento continuarão sendo a fonte de contexto das respostas.

## Implementação

### 1. Anexos multimodais confiáveis
- Criar um utilitário isolado no navegador para validar, redimensionar e comprimir imagens antes da prévia e do envio, mantendo orientação, proporção e MIME coerente.
- Aplicar limites seguros por tipo de arquivo e mensagens claras para anexos incompatíveis ou grandes demais.
- Corrigir a transformação no servidor: imagens como parte visual e PDFs como dados base64 com `mimeType`/nome corretos; arquivos de texto continuam extraídos como texto.
- Usar a mesma representação multimodal no provedor principal e no fallback Gemini (`inlineData`), sem duplicar ou perder o texto da mensagem.
- Limpar anexos e o seletor de arquivo imediatamente ao confirmar o envio, preservando-os apenas se a leitura/compressão ainda não terminou.

### 2. Recompensas “Pen-drives de Sabores”
- Adicionar um botão de petisco junto às ações da conversa e um modal com quatro sabores: Chocolate com Laranja, Café Espresso Turbinado, Menta Refrescante e Frutas Criativas.
- Criar um estado afetivo separado da memória, com Humor, Confiança e Intimidade, persistido como dados opcionais do Lia Card para acompanhar a Lia entre computadores.
- Cada sabor terá ganhos próprios e limites de 0–100; entregar um sabor atualiza os indicadores e adiciona uma reação personalizada da Lia à conversa.
- Animar a reação e o orbe com respeito à preferência de redução de movimento. Nenhum petisco criará, removerá ou reclassificará memórias.

### 3. Notificações e iniciativa própria
- Completar os controles de Configurações para ativar notificações, fala em tempo real, iniciativa e assuntos acompanhados.
- Solicitar permissão pela Web Notifications API somente após ação do usuário e enviar alertas quando a Lia produzir uma atualização com a aba oculta/minimizada.
- Ao terminar a inicialização com um Lia Card conectado — e também após uma conexão manual — disparar uma única saudação contextual por sessão, baseada no horário, contexto atual, assuntos acompanhados e serviços disponíveis.
- A saudação reutilizará o mesmo prompt, histórico e memórias já recuperados pelo fluxo atual, sem inserir uma falsa mensagem do usuário e sem aprender novas memórias a partir do disparo interno.

### 4. Temas e AMOLED
- Expor um seletor em Configurações com Cyber/Neon, Lavanda, Oceano, Esmeralda, Monocromático e AMOLED.
- Manter o AMOLED em preto puro e tornar todas as superfícies, bordas, painéis, gradientes e contrastes dependentes dos tokens do tema.
- Aplicar e restaurar a preferência do armazenamento local antes da experiência principal, evitando troca visual ao abrir o app.

### 5. Layout móvel e desktop
- No celular, transformar o histórico e as configurações em gavetas laterais, mantendo a conversa como tela principal.
- Fixar a composição de mensagem na base segura da tela, com controles de microfone, anexo, petisco, câmera e envio distribuídos sem apertar o texto.
- Ajustar alturas com viewport dinâmica e áreas seguras para o teclado virtual não cobrir o campo nem criar rolagem dupla.
- No desktop, usar uma grade estável e ampla para histórico, percepção, conversa e painel, com colunas recolhíveis e limites mínimos para evitar cortes.
- Corrigir também o detector visual que mantém “Pessoa detectada” aceso, usando uma janela curta de expiração em vez de estado permanente.

## Detalhes técnicos
- Alterações concentradas no fluxo de conversa, utilitário de mídia, estado opcional de vínculo/recompensas, Configurações, layout principal e tokens globais.
- A função atual que constrói o prompt continuará recebendo a mesma memória e personalidade; a função atual de extração e persistência de memórias não será modificada.
- Não serão criadas tabelas, migrações nem uma segunda base de memória.
- Os novos campos do Lia Card serão opcionais para manter compatibilidade com cartões e backups existentes.

## Validação
- Testar imagem grande, PNG/JPG, PDF e arquivo textual com e sem mensagem; conferir prévia, limpeza e payload nos dois provedores.
- Testar os quatro sabores, limites dos atributos, reação na conversa e persistência após recarregar/conectar o cartão.
- Testar permissão negada/aceita de notificações e saudação única na abertura/conexão.
- Conferir todos os temas, incluindo fundo AMOLED puro, em claro/escuro e contraste dos controles.
- Validar visualmente em celular e desktop, incluindo gavetas, teclado virtual, rolagem, câmera e barra inferior.
- Verificar erros de execução, compilação e regressões do chat e da memória.
