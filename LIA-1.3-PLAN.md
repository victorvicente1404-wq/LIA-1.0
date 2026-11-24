# Lia 1.3 — Plano de arquitetura e implementação

## Objetivo

Evoluir a Lia para uma arquitetura híbrida, mantendo uma única identidade e personalidade persistente, com execução local no Android e uso de provedores remotos somente quando a tarefa realmente exigir.

A versão 1.3 prioriza controle de custos, roteamento de tarefas e integração Android. Não deve remover nem enfraquecer os recursos já existentes na 1.2.

## Regras obrigatórias

1. Preservar a identidade da Carol/Lia independentemente do modelo utilizado. Personalidade, preferências e memória não podem ficar presas ao prompt de um provedor.
2. O motor local continua sendo o caminho padrão para tarefas que ele consegue resolver. A indisponibilidade do motor local não pode disparar provedores remotos silenciosamente.
3. Não implementar varredura infinita de modelos ou fallback em cascata. Cada tarefa tem um destino definido e um número limitado de tentativas.
4. Nenhuma chamada paga pode ser iniciada sem estimativa de custo, autorização de orçamento e registro local.
5. O bloqueio de orçamento é aplicado no próprio aplicativo/backend controlado pela Lia; limites do painel do provedor são apenas uma camada adicional.
6. Ações sensíveis (enviar mensagens, publicar, comprar, apagar dados ou alterar configurações críticas) exigem confirmação do usuário.
7. Recursos Android nativos devem ser usados diretamente quando bastarem: notificações, intents, acessibilidade, leitura de elementos da interface e automação local não devem chamar uma IA apenas para executar a operação.
8. Não enviar histórico inteiro por padrão. O contexto deve ser selecionado e limitado por relevância.
9. Nunca registrar chaves de API, tokens de acesso ou conteúdo privado de notificações em logs de custo.
10. Flex é opcional e temporário; a arquitetura não pode depender dele. Batch é reservado para tarefas assíncronas, nunca para conversa ao vivo.

## Arquitetura proposta

- **Identity Core:** personalidade, estilo de comunicação, preferências, limites e instruções estáveis da Lia.
- **Memory Context Builder:** seleciona memórias e trechos recentes relevantes; evita reenviar o histórico completo.
- **Task Router:** classifica a tarefa por capacidade necessária, urgência, risco, privacidade e custo.
- **Local Executor:** motor llama.cpp/Termux e capacidades nativas Android.
- **Provider Gateway:** integração remota isolada, com provedores explicitamente configurados e sem fallback silencioso.
- **Cost Guard:** orçamento mensal e anual, estimativa pré-chamada, contabilização de uso, bloqueio e reserva.
- **Android Bridge:** notificações autorizadas, intents, Accessibility Service, leitura de tela e execução local.
- **Audit Log:** metadados de uso (provedor, modelo, tokens, custo, horário, tarefa e resultado), sem guardar segredos nem conteúdo privado desnecessário.

## Política inicial de orçamento

- Teto planejado: R$ 15 por mês.
- Teto acumulado de planejamento: R$ 180 em 12 meses.
- Reserva inicial: R$ 2 por mês, não disponível para uso rotineiro.
- Distribuição de referência: R$ 8 para chamadas Standard ao vivo, R$ 3 para Flex somente quando disponível e permitido, R$ 2 para Batch e R$ 2 de reserva.
- Os valores são limites configuráveis, não metas de consumo.
- O cálculo deve usar a tabela de preços configurada por modelo e a cotação atualizada. Não codificar câmbio ou preços como constantes eternas.
- Antes de cada chamada, estimar custo máximo com margem de segurança. Se preço, uso estimado ou saldo forem desconhecidos, bloquear a chamada paga.
- Após a resposta, reconciliar com o uso informado pelo provedor. Se o provedor não informar tokens, registrar estimativa como estimativa, nunca como custo confirmado.
- Ao atingir o teto, bloquear provedores pagos até a próxima janela de orçamento; manter recursos locais disponíveis.

## Modos de operação

### Normal
Usa o motor local e ferramentas nativas por padrão; chama o modelo remoto principal para raciocínio complexo, tarefas multimodais suportadas ou quando solicitado.

### Econômico
Preserva o Identity Core e o mesmo construtor de contexto, mas usa respostas locais para tarefas simples, reduz contexto redundante, limita saída e reserva chamadas remotas para casos de maior valor.

### Sem orçamento remoto
Bloqueia integralmente chamadas pagas e mantém apenas motor local e ferramentas nativas. A interface deve explicar limitações sem simular capacidades indisponíveis.

## Roteamento inicial

- Notificações: Android Notification Listener, sem LLM para coleta; modelo local ou remoto apenas para resumir/interpretar quando necessário.
- Abrir aplicativos, intents, toques, digitação e navegação: Android Bridge/Accessibility Service, sem API de IA para a execução.
- Leitura estruturada da tela: Accessibility Service primeiro; OCR/modelo de visão apenas quando os elementos não forem acessíveis.
- Memória e resumos não urgentes: processamento local primeiro; Batch remoto opcional se houver orçamento e benefício.
- Conversa cotidiana: motor local no modo econômico; provedor remoto somente pela política do Task Router.
- Conversa complexa: provedor remoto principal, sujeito ao Cost Guard.
- Voz: contabilizar separadamente transcrição, síntese e/ou serviço de áudio; não presumir que o modelo de texto aceite áudio diretamente.

## Fases de implementação

1. Inventário da 1.2: localizar os pontos reais de geração, persistência, configurações e integração Android; não duplicar módulos.
2. Cost Guard: tipos, armazenamento local, tabela de preços configurável, estimador, contador, painel e bloqueio fail-closed.
3. Provider Gateway: integração controlada ao GPT-6 Luna via Responses API, com timeout, limite de saída, captura de usage e sem fallback em cascata. Segredos apenas em armazenamento seguro do ambiente apropriado.
4. Task Router e modo econômico: Identity Core independente do provedor; roteamento local/remoto com razões auditáveis.
5. Android Bridge: conectar os recursos já existentes e ampliar notificações/acessibilidade sem chamadas de IA desnecessárias.
6. Testes: orçamento esgotado, erro de rede, preço desconhecido, resposta sem usage, repetição, reinício do app, modo econômico, modo sem orçamento e preservação de dados da 1.2.

## Critérios de conclusão da 1.3

- Nenhuma chamada paga ocorre quando o orçamento está bloqueado.
- Cada chamada paga aparece no histórico de consumo e é reconciliada quando há usage do provedor.
- A Lia continua conversando localmente quando o orçamento remoto acaba.
- A personalidade não muda ao trocar entre motor local e remoto.
- Tarefas Android simples não acionam o modelo remoto.
- Não existe fallback infinito nem troca silenciosa para uma opção mais cara.
- A atualização preserva applicationId, dados locais e chave de assinatura permanente já estabelecida.


## Andamento registrado

### Primeira entrega — Cost Guard local

- [x] Núcleo local de orçamento, estimativa de tarifas, reservas pré-chamada, liquidação por usage e liberação em caso de falha.
- [x] Limites iniciais de R$ 15/mês, R$ 180/ano e reserva de R$ 2/mês.
- [x] Tarifas de referência configuradas para Standard, Flex e Batch, com câmbio editável.
- [x] Painel de custos disponível na seção lateral, sem exigir Lia Card conectado.
- [x] Testes unitários criados para estimativa, cache, reserva, bloqueio, liquidação e liberação.
- [x] Script `npm test` adicionado para executar Vitest.

### Limitação importante desta entrega

O Cost Guard ainda não está ligado a um provedor remoto de conversa. Nesta branch, o chat principal continua usando diretamente o llama-server local; portanto, não existem chamadas pagas do chat para contabilizar ou bloquear neste momento. O painel informa essa condição. A próxima fase deverá criar o Provider Gateway e obrigar toda chamada paga a passar por `authorizePaidCall` antes do envio, seguida de `settlePaidCall` com os tokens retornados pelo provedor. Não considerar o painel atual como um bloqueio de cobrança no provedor até essa integração e seus testes estarem concluídos.


### Segunda entrega — Provider Gateway Luna (adaptador isolado)

- [x] Criado endpoint server-side autenticado para GPT-6 Luna via Responses API.
- [x] A chave é lida exclusivamente de `OPENAI_API_KEY` no servidor; não é recebida do navegador.
- [x] Modelo fixo em `gpt-6-luna`, sem permitir ao cliente escolher modelos ou provedores.
- [x] `store: false`, limite de saída de 64 a 1.024 tokens (padrão 768), timeout de 45 segundos e validação dos tamanhos de entrada.
- [x] Adaptador cliente chama `authorizePaidCall` antes da rede, registra usage real e usa estimativa conservadora pelo teto reservado quando o provedor não retorna usage.
- [x] Se a resposta puder ter sido enviada mas o estado do custo não puder ser reconciliado, a chamada é tratada como falha e a interface deve impedir novas chamadas até conferência.
- [x] Testes unitários iniciais da estimativa conservadora de tokens.
- [ ] Integração do adaptador ao fluxo de conversa ainda não ativada. O chat atual permanece local por padrão; não haverá fallback remoto silencioso.
- [ ] Configurar `OPENAI_API_KEY` como segredo no ambiente de hospedagem antes de testar a conexão real.
- [ ] O Cost Guard ainda usa LocalStorage no cliente. A autenticação protege o endpoint, mas isso ainda não equivale a um teto financeiro inviolável no servidor; a persistência/serialização server-side do orçamento deve vir antes de tratar o limite como hard cap.

**Importante:** o Gateway foi adicionado como caminho explícito e isolado, mas ainda não está sendo chamado pelo chat. Isso evita começar a gastar automaticamente ou expor a chave enquanto o roteamento e o armazenamento confiável do orçamento não estiverem prontos.


### Terceira entrega — roteamento do chat e orçamento autoritativo

- [x] O chat principal consulta uma política de roteamento local-first.
- [x] O modo padrão permanece **Somente local**; o modo **Híbrido** precisa ser ativado explicitamente em Custos.
- [x] No modo híbrido, pedidos técnicos/complexos e pedidos explícitos para usar a Luna podem seguir para GPT-6 Luna. Mensagens comuns seguem no llama.cpp.
- [x] Anexos permanecem no motor local nesta etapa; não são enviados à OpenAI.
- [x] O caminho local mantém streaming. Luna retorna resposta completa nesta primeira integração.
- [x] Falhas do Gateway não fazem fallback silencioso para outro provedor.
- [x] Criada migração Supabase com reservas por usuário e RPCs atômicas de pré-autorização/reconciliação no servidor.
- [x] O teto servidor é fixo e conservador: R$13/mês de uso + R$2 preservados, R$180/ano, câmbio de referência R$5,94/USD. O orçamento local pode reduzir o limite, mas não aumentar o teto servidor.
- [x] O servidor recalcula a reserva com estimativa conservadora, não confia no custo informado pelo cliente, e exige a reserva antes de chamar a OpenAI.
- [ ] Aplicar/deployar a migração `20261124120000_lia_ai_server_budget.sql` no projeto Supabase conectado.
- [ ] Configurar `OPENAI_API_KEY` como segredo no ambiente de hospedagem.
- [ ] Executar testes, typecheck e build no ambiente do projeto.
- [ ] Validar uma chamada real com orçamento baixo e conferir o lançamento no painel local e no billing oficial da OpenAI.

**Estado de ativação:** a integração do chat está no código, mas chamadas remotas ficam bloqueadas até que a migração do orçamento esteja aplicada e a chave esteja configurada. Isso é intencional: se a barreira server-side não existir, o Gateway falha fechado. Para ativar o caminho remoto, o usuário também precisa escolher Híbrido no painel Custos. O modo local continua sendo o padrão.

**Limitações conhecidas:** a resposta Luna não faz streaming nesta etapa. Parar a interface depois que a chamada remota começou não cancela necessariamente o processamento no servidor; o endpoint limita a chamada a 45 segundos e mantém a reserva financeira quando não consegue reconciliar o uso. O painel local registra o usage retornado, mas não consulta diretamente o billing da OpenAI.

### Ajuste de segurança — contagem exata antes da reserva

- [x] O Gateway consulta `POST /v1/responses/input_tokens` com o mesmo modelo, instruções e mensagens que serão enviados à geração.
- [x] A reserva usa a contagem retornada, o maior preço possível de input (cache write) e o máximo de output permitido.
- [x] Se a contagem falhar ou ultrapassar 150 mil tokens, a chamada é bloqueada antes da geração paga.
- [x] A contagem de tokens é documentada pela OpenAI como gratuita e não consome a cota normal de inferência.
- [ ] Confirmar em teste controlado que `gpt-6-luna` é aceito pelo endpoint de contagem no projeto/conta usados.

Isso substitui a estimativa anterior baseada em caracteres. A reserva continua usando as tarifas Standard configuradas no servidor; qualquer mudança de preço do modelo exige atualizar as constantes antes de reativar chamadas pagas.

### Ajuste de segurança — cache write

- [x] A reserva usa US$0,125 por milhão de tokens de entrada como pior caso, cobrindo a tarifa de cache write da Luna.
- [x] A liquidação diferencia tokens comuns, cache hits e cache writes.
- [x] Criada migração complementar `20261124124500_lia_ai_cache_write_budget.sql`, que adiciona a coluna de cache write e substitui a assinatura antiga da RPC de liquidação.
- [ ] Aplicar as migrações em ordem no Supabase e validar a liquidação com usage real.

A tarifa Standard publicada para GPT-6 Luna é US$0,10/M input, US$0,01/M cached input, US$0,125/M cache write e US$0,50/M output. A reserva usa o maior custo de entrada para não depender de desconto de cache.
