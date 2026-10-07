/** Lia Agent: preferências locais e script Python do agente de desktop. */
export const ACAO_MAP = {
  clicar: "click",
  mover_mouse: "move_mouse",
  digitar: "type_text",
  tecla_atalho: "press_key",
  abrir_programa: "open_app",
  rolar: "scroll",
  executar_comando: "run_script",
} as const;

export const ACTION_LABEL: Record<string, string> = {
  click: "Clicou",
  move_mouse: "Moveu o mouse",
  type_text: "Digitou texto",
  press_key: "Pressionou atalho",
  open_app: "Abriu programa",
  scroll: "Rolou a tela",
  run_script: "Executou comando",
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
  return `# Lia Desktop Agent — rode com: python agent.py
# pip install pyautogui requests
import time, subprocess, platform, requests, pyautogui

LIA_URL = "${origin}/api/public/os-agent"
TOKEN = "${token}"
H = {"Authorization": f"Bearer {TOKEN}", "X-Platform": platform.system()}
pyautogui.FAILSAFE = True  # mova o mouse ao canto da tela para parar

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
        if s == "Windows": subprocess.Popen(["cmd", "/c", "start", "", app])
        elif s == "Darwin": subprocess.Popen(["open", "-a", app])
        else: subprocess.Popen([app])
    elif act == "run_script":
        r = subprocess.run(str(p.get("script", "")), shell=True, capture_output=True, text=True, timeout=60)
        return (r.stdout or r.stderr)[-1500:]
    else: raise ValueError("ação desconhecida: " + act)
    return "ok"

print("Lia Agent conectado. Ctrl+C para sair.")
while True:
    try:
        r = requests.get(LIA_URL, headers=H, timeout=15)
        if r.status_code == 401: print("Token inválido — gere outro no app."); break
        for a in r.json().get("actions", []):
            try: out, ok = run(a), True
            except Exception as e: out, ok = str(e), False
            print(("✓ " if ok else "✗ ") + a["action"], out)
            requests.post(LIA_URL, headers=H, json={"id": a["id"], "ok": ok, "result": str(out)}, timeout=15)
    except Exception as e:
        print("Sem conexão:", e); time.sleep(3)
    time.sleep(1)
`;
}
