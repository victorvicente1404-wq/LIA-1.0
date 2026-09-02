# Corrigir erro `client_not_found` dos conectores Google

## Diagnóstico

O erro `App User OAuth start failed (404): client_not_found` significa que o gateway não reconhece mais a chave de cliente OAuth que o app envia. Como as chaves/clients dos conectores foram alteradas, as variáveis de ambiente sincronizadas no projeto (`GOOGLE_*_APP_USER_CONNECTOR_CLIENT_API_KEY`) ficaram inválidas ou foram removidas — e hoje nenhuma delas aparece na lista de secrets do projeto.

A correção não é editar código: é religar os clients corretos ao projeto, o que sincroniza as chaves novamente automaticamente.

## Passos

1. **Religar os 5 conectores Google ao projeto** via ferramenta de conexão (um card de aprovação por conector, onde você escolhe o client correto ou cria um novo):
   - `google_calendar` (Agenda)
   - `google_mail` (Gmail)
   - `google_drive` (Drive)
   - `google_docs` (Docs)
   - `google_slides` (Slides)
2. **Verificar** que as variáveis `GOOGLE_*_APP_USER_CONNECTOR_CLIENT_API_KEY` voltaram a existir nos secrets do projeto.
3. **Reiniciar o servidor de desenvolvimento** para carregar as novas variáveis.
4. **Testar o fluxo completo** no preview: fazer login, abrir a seção Conectores e clicar em "Conectar" em um dos serviços Google, confirmando que o popup de autorização do Google abre sem o erro 404.
5. Se o teste de OAuth concluir, **validar uma leitura real** (ex.: listar próximos eventos da Agenda) para confirmar que a chave de conexão foi salva criptografada.

## Observações

- Nenhum arquivo de código precisa mudar: `src/server/connectors.server.ts` já lê as variáveis corretas.
- Se você trocou também a chave de criptografia (`APP_USER_CONNECTION_KEY_SECRET`), as conexões salvas anteriormente não poderão mais ser descriptografadas — nesse caso, cada usuário precisará reconectar os serviços (os dados antigos seriam removidos).
