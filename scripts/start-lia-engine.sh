#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

MODEL_PATH="${1:-${LIA_MODEL_PATH:-}}"
if ! command -v llama-server >/dev/null 2>&1; then
  echo "Erro: llama-server não foi encontrado no PATH do Termux."
  echo "Confira a instalação do pacote llama.cpp e rode novamente."
  exit 127
fi

if [[ -z "$MODEL_PATH" ]]; then
  echo "Uso: bash scripts/start-lia-engine.sh /caminho/para/modelo.gguf"
  echo "Ou defina LIA_MODEL_PATH antes de executar."
  exit 2
fi

if [[ ! -f "$MODEL_PATH" ]]; then
  echo "Erro: arquivo GGUF não encontrado: $MODEL_PATH"
  exit 2
fi

echo "Iniciando o motor local da Lia AI..."
echo "Modelo: $MODEL_PATH"
echo "Endereço: http://127.0.0.1:8080"
echo "Aguarde a mensagem de servidor pronto antes de testar a conexão no app."

exec llama-server \
  --model "$MODEL_PATH" \
  --host 127.0.0.1 \
  --port 8080 \
  --ctx-size 2048 \
  --threads 4 \
  --parallel 1 \
  --cors-origins "*"
