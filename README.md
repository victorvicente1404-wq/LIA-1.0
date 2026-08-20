# Lia Personal Companion

Crie um aplicativo chamado Lia, uma assistente pessoal de inteligência artificial feminina, modular, portátil e focada em privacidade.

A Lia deve ser apresentada como uma IA feminina, com personalidade própria, amigável, inteligente, curiosa, natural e elegante. Ela deve falar de si mesma no feminino e tratar o usuário de forma natural.

IDENTIDADE VISUAL

A identidade visual da Lia deve ser futurista, minimalista e tecnológica, sem parecer excessivamente neon ou infantil.

Paleta principal:

Preto profundo como cor principal.

Cinza escuro para painéis, cartões e áreas secundárias.

Roxo como cor de destaque e interação.

Pequenos detalhes em tons de roxo luminoso podem ser usados em estados ativos.

Evite excesso de cores.
Não usar interface branca predominante.

A aparência deve transmitir:

inteligência artificial avançada;

tecnologia;

privacidade;

elegância;

personalidade;

sensação de sistema premium.

ESTRUTURA PRINCIPAL

Crie uma interface principal com:

Área de conversa

mensagens do usuário;

mensagens da Lia;

indicador de que a Lia está pensando;

histórico de conversa;

suporte para mensagens longas;

botão para interromper a resposta da Lia.

Área de percepção

câmera;

indicação de usuário detectado;

indicação de que a Lia está vendo;

indicação de que a Lia está ouvindo;

estados como:

Observando

Ouvindo

Pensando

Falando

Inativa

Entrada de texto

campo de mensagem;

botão enviar;

botão de microfone;

botão de câmera.

Painel lateral
Criar seções para:

Memória

Perfil

Personalidade

Módulos

Configurações

Privacidade

Lia Card

VOZ

A Lia deve possuir uma interface preparada para interação por voz.

Criar:

botão de ativação do microfone;

indicador visual de escuta;

indicador visual quando a Lia está falando;

botão para interromper a fala;

animação sutil enquanto a Lia ouve;

animação diferente enquanto ela fala.

O sistema deve ser preparado para permitir que o usuário interrompa a Lia enquanto ela está falando.

Quando uma nova entrada do usuário for detectada, a fala atual deve ser interrompida e a nova entrada processada.

VISÃO

A Lia deve possuir suporte visual.

Criar uma área de câmera onde:

a imagem da câmera possa ser exibida;

a Lia possa indicar que está observando;

usuários possam ser detectados;

o sistema possa futuramente reconhecer pessoas;

o sistema possa futuramente analisar mudanças no ambiente.

A interface deve mostrar claramente quando a câmera estiver:

desligada;

ligada;

analisando;

detectando uma pessoa.

Não trate a câmera apenas como uma webcam comum. Ela representa o sistema de visão da Lia.

MEMÓRIA

Criar uma arquitetura de memória persistente.

A memória deve representar:

nome do usuário;

preferências;

conhecimentos aprendidos;

histórico;

rotina;

informações importantes;

relacionamentos entre informações;

perfil do usuário.

Criar uma seção visual chamada Memória da Lia mostrando o que está armazenado.

A Lia deve poder aprender informações novas e mantê-las após reiniciar o aplicativo.

PERSONALIDADE

Criar uma seção chamada Personalidade da Lia.

Ela deve permitir configurar características como:

nível de formalidade;

humor;

iniciativa;

curiosidade;

quantidade de explicação;

modo de tratamento do usuário.

A personalidade deve ser tratada como configuração persistente.

A Lia é feminina.

PERFIS

Criar um sistema de perfis.

Exemplos:

Pessoal

Estudos

Trabalho

Casa

Cada perfil pode possuir:

preferências;

personalidade;

módulos ativados;

permissões;

memória específica;

configurações de voz;

nível de iniciativa.

O mesmo programa deve poder carregar diferentes perfis.

SISTEMA MODULAR

A Lia deve ser construída conceitualmente como uma plataforma modular.

Criar uma interface chamada Módulos da Lia.

Módulos iniciais:

Conversação

Memória

Pesquisa

Voz

Visão

Automação

Rotina

Personalidade

Cada módulo deve possuir:

nome;

descrição;

estado ativo/inativo;

configuração;

nível de permissão.

A interface deve deixar claro que novos módulos poderão ser adicionados futuramente.

LIA CARD

Essa é uma característica central do projeto.

Criar uma seção chamada Lia Card.

O Lia Card representa um dispositivo físico removível, como um cartão USB, pendrive ou pequeno armazenamento externo.

O programa principal fica instalado no computador, mas o Lia Card deve representar a identidade portátil da Lia e do usuário.

O Lia Card deve ser pensado para armazenar:

memória;

personalidade;

preferências;

perfis;

conhecimentos;

histórico;

rotina;

configurações;

identidade;

estado dos módulos;

outras informações pessoais da Lia.

A interface deve mostrar:

Lia Card conectado
ou
Lia Card não conectado

Quando conectado:

carregar perfil;

carregar memória;

carregar preferências;

carregar personalidade;

carregar configurações dos módulos.

Quando removido:

a aplicação continua funcionando;

porém os dados pessoais portáteis deixam de estar disponíveis.

O conceito deve ser:

O computador fornece o corpo e o poder de processamento.
O Lia Card fornece identidade, memória e personalização.

Criar uma representação visual elegante do Lia Card dentro da interface.

PRIVACIDADE

Criar uma seção chamada Privacidade.

Mostrar claramente:

dados locais;

memória armazenada no Lia Card;

uso de IA externa;

câmera;

microfone;

módulos ativos;

permissões.

A interface deve deixar claro que a Lia foi projetada com uma filosofia de privacidade local.

Não afirmar que tudo funciona offline se a aplicação utilizar serviços externos.

PORTABILIDADE

A aplicação deve ser pensada para funcionar em diferentes computadores.

Conceito:

Computador A
+
Lia Card

Lia personalizada

Computador B
+
mesmo Lia Card

mesma Lia personalizada

A troca de computador não deve exigir a recriação do perfil e da memória do usuário.

ARQUITETURA

Organize o projeto de forma modular e limpa.

Separar conceitualmente:

interface;

núcleo da Lia;

memória;

personalidade;

perfis;

voz;

visão;

pesquisa;

automação;

rotina;

Lia Card;

configurações.

Não criar uma arquitetura monolítica.

Preparar o projeto para que o código possa ser exportado e continuar sendo desenvolvido fora do Lovable.

GITHUB E PORTABILIDADE DO CÓDIGO

Estruture o projeto para ser facilmente exportado para GitHub e posteriormente aberto no VS Code.

Evite dependências desnecessárias da plataforma.

O código deve ser organizado, documentado e modular.

EXPERIÊNCIA DO USUÁRIO

Ao iniciar:

Mostrar animação discreta de inicialização.

Mostrar o logotipo/nome Lia.

Detectar se existe um Lia Card.

Se existir, carregar o perfil.

Mostrar o estado da Lia.

Abrir a interface principal.

Mensagem inicial da Lia:

"Olá! Eu sou a Lia. Como posso ajudar?"

A Lia deve parecer uma assistente real, e não apenas uma página de chatbot.

FUTURO

Deixe a arquitetura preparada para futuramente adicionar:

reconhecimento facial;

detecção de pessoas;

reconhecimento de objetos;

OCR;

reconhecimento de rotina;

previsão de rotina;

iniciativas próprias;

automação do computador;

automação residencial;

Arduino;

ESP32;

funcionamento offline;

modelos locais;

múltiplas IAs;

sincronização opcional;

criptografia do Lia Card.

Não implemente tudo agora caso isso prejudique a estabilidade do protótipo. Priorize uma experiência funcional e uma arquitetura preparada para expansão.

RESULTADO ESPERADO

Quero um protótipo visualmente impressionante, funcional e modular da Lia.

A Lia deve parecer:

uma IA pessoal feminina, portátil, modular e orientada à privacidade.

O diferencial central não é apenas conversar.

O diferencial é que:

a Lia pode acompanhar o usuário.

Sua memória, personalidade, preferências e perfis podem estar associados a um Lia Card físico, permitindo que a mesma Lia seja carregada entre diferentes computadores.

Use preto, cinza escuro e roxo como identidade visual principal, com uma aparência tecnológica, elegante e futurista.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://lia-your-portable-ai.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/6aa37f7d-aa28-4fc3-bb34-fb19cd27ff8a).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
