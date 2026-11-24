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
