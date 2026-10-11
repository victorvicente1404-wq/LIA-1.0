/** Lia Agent: preferências locais e script Python do agente de desktop. */
export const ACAO_MAP = {
  clicar: "click",
  mover_mouse: "move_mouse",
  digitar: "type_text",
  tecla_atalho: "press_key",
  abrir_programa: "open_app",
  rolar: "scroll",
  executar_comando: "run_script",
  abrir_link: "open_link",
  ler_clipboard: "read_clipboard",
  notificar: "notify",
} as const;

export const ACTION_LABEL: Record<string, string> = {
  click: "Clicou",
  move_mouse: "Moveu o mouse",
  type_text: "Digitou texto",
  press_key: "Pressionou atalho",
  open_app: "Abriu programa",
  scroll: "Rolou a tela",
  run_script: "Executou comando",
  open_link: "Abriu link",
  read_clipboard: "Leu a área de transferência",
  notify: "Mostrou aviso",
};

const KEY = "lia.osAgent";
export interface OsAgentPrefs { enabled: boolean; autonomo: boolean }
export function readOsAgentPrefs(): OsAgentPrefs {
  if (typeof window === "undefined") return { enabled: false, autonomo: false };
  try {
    return { enabled: false, autonomo: false, ...(JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<OsAgentPrefs>) };
  } catch {
    return { enabled: false, autonomo: false };
  }
}
export function saveOsAgentPrefs(p: OsAgentPrefs) {
  localStorage.setItem(KEY, JSON.stringify(p));
}

export function agentScript(origin: string, token: string) {
  return `# Lia Desktop Agent — roda em segundo plano (sem janela): dê dois cliques em agent.pyw
# Instale uma vez: pip install pyautogui pyperclip requests
# Log em: agent_lia.log (mesma pasta). Para parar: Gerenciador de Tarefas > pythonw.exe
import os, sys, time, subprocess, platform, webbrowser, logging, requests, pyautogui
try:
    import pyperclip
except ImportError:
    pyperclip = None

LIA_URL = "${origin}/api/public/os-agent"
TOKEN = "${token}"
H = {"Authorization": f"Bearer {TOKEN}", "X-Platform": platform.system()}
pyautogui.FAILSAFE = True  # mova o mouse ao canto da tela para parar uma ação

LOG = os.path.join(os.path.dirname(os.path.abspath(__file__)), "agent_lia.log")
logging.basicConfig(filename=LOG, level=logging.INFO, format="%(asctime)s %(message)s", encoding="utf-8")
log = logging.info

def notificar(texto):
    s = platform.system()
    if s == "Windows":
        t = str(texto).replace("'", "''")
        ps = "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show('" + t + "', 'Lia')"
        subprocess.Popen(["powershell", "-WindowStyle", "Hidden", "-Command", ps], creationflags=0x08000000)
    elif s == "Darwin":
        subprocess.Popen(["osascript", "-e", 'display notification "' + str(texto).replace('"', "'") + '" with title "Lia"'])
    else:
        subprocess.Popen(["notify-send", "Lia", str(texto)])

def run(a):
    act, p = a["action"], a.get("payload") or {}
    if act == "click":
        if "x" in p and "y" in p: pyautogui.click(int(p["x"]), int(p["y"]))
        else: pyautogui.click()
    elif act == "move_mouse": pyautogui.moveTo(int(p.get("x", 0)), int(p.get("y", 0)), duration=0.3)
    elif act == "type_text": pyautogui.write(str(p.get("text", "")), interval=0.02)
    elif act == "press_key": pyautogui.hotkey(*str(p.get("key", "")).lower().replace(" ", "").split("+"))
    elif act == "scroll": pyautogui.scroll(int(p.get("amount", -500)))
    elif act == "open_app":
        app = str(p.get("app_name", ""))
        s = platform.system()
        if s == "Windows": subprocess.Popen(["cmd", "/c", "start", "", app], creationflags=0x08000000)
        elif s == "Darwin": subprocess.Popen(["open", "-a", app])
        else: subprocess.Popen([app])
    elif act == "run_script":
        r = subprocess.run(str(p.get("script", "")), shell=True, capture_output=True, text=True, timeout=60)
        return (r.stdout or r.stderr)[-1500:]
    elif act == "open_link":
        url = str(p.get("url", ""))
        if not url.startswith(("http://", "https://")): raise ValueError("link inválido")
        webbrowser.open(url)
        return "aberto: " + url
    elif act == "read_clipboard":
        if not pyperclip: raise RuntimeError("instale pyperclip")
        return (pyperclip.paste() or "(vazio)")[:1500]
    elif act == "notify":
        notificar(p.get("text", ""))
    else: raise ValueError("ação desconhecida: " + act)
    return "ok"

log("Lia Agent ativo e aguardando comandos...")
while True:
    try:
        r = requests.get(LIA_URL, headers=H, timeout=15)
        if r.status_code == 401:
            log("Token inválido — gere outro no app."); notificar("Lia Agent: token inválido, gere outro no app."); sys.exit(1)
        for a in r.json().get("actions", []):
            try: out, ok = run(a), True
            except Exception as e: out, ok = str(e), False
            log(("OK " if ok else "ERRO ") + a["action"] + " " + str(out)[:200])
            requests.post(LIA_URL, headers=H, json={"id": a["id"], "ok": ok, "result": str(out)}, timeout=15)
    except Exception as e:
        log("Sem conexão: " + str(e)); time.sleep(3)
    time.sleep(1)
`;
}
