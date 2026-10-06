/** Módulo IoT (Arduino/ESP32): preferências locais + esquema compartilhado. */
import { z } from "zod";
import type { IotConfig } from "./types";

const KEY = "lia.iot";

export const IotSchema = z.object({ url: z.string().url().max(300), token: z.string().max(300) });

export function readIot(): IotConfig {
  try {
    if (typeof localStorage === "undefined") return { url: "", token: "" };
    const v = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<IotConfig>;
    return { url: v.url ?? "", token: v.token ?? "" };
  } catch {
    return { url: "", token: "" };
  }
}

export function writeIot(cfg: IotConfig) {
  try {
    localStorage.setItem(KEY, JSON.stringify(cfg));
  } catch {
    /* sem armazenamento local */
  }
}

export const ESP32_SKETCH = `// Lia • ESP32 — servidor HTTP para automação
// Endpoints: GET /status | POST /cmd  {"action":"digital_write|pwm|digital_read|analog_read","pin":2,"value":1}
#include <WiFi.h>
#include <WebServer.h>
#include <ArduinoJson.h>   // instale "ArduinoJson" (v7) pelo Gerenciador de Bibliotecas

const char* WIFI_SSID = "SUA_REDE";
const char* WIFI_PASS = "SUA_SENHA";
const char* LIA_TOKEN = "";   // opcional: mesmo token configurado na Lia

WebServer server(80);

bool autorizado() {
  if (strlen(LIA_TOKEN) == 0) return true;
  return server.header("Authorization") == String("Bearer ") + LIA_TOKEN;
}

void responder(int code, JsonDocument& doc) {
  String out; serializeJson(doc, out);
  server.send(code, "application/json", out);
}

void handleStatus() {
  JsonDocument doc;
  doc["ok"] = true; doc["device"] = "esp32"; doc["ip"] = WiFi.localIP().toString();
  doc["uptime_ms"] = millis();
  responder(200, doc);
}

void handleCmd() {
  JsonDocument res;
  if (!autorizado()) { res["ok"] = false; res["error"] = "token invalido"; return responder(401, res); }
  JsonDocument req;
  if (deserializeJson(req, server.arg("plain"))) { res["ok"] = false; res["error"] = "json invalido"; return responder(400, res); }
  String action = req["action"] | "";
  int pin = req["pin"] | -1;
  int value = req["value"] | 0;
  res["action"] = action; res["pin"] = pin;
  if (action == "digital_write") { pinMode(pin, OUTPUT); digitalWrite(pin, value ? HIGH : LOW); res["value"] = value ? 1 : 0; }
  else if (action == "pwm") { pinMode(pin, OUTPUT); analogWrite(pin, constrain(value, 0, 255)); res["value"] = constrain(value, 0, 255); }
  else if (action == "digital_read") { pinMode(pin, INPUT_PULLUP); res["value"] = digitalRead(pin); }
  else if (action == "analog_read") { res["value"] = analogRead(pin); }
  else { res["ok"] = false; res["error"] = "acao desconhecida"; return responder(400, res); }
  res["ok"] = true;
  responder(200, res);
}

void setup() {
  Serial.begin(115200);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) { delay(400); Serial.print("."); }
  Serial.printf("\\nLia ESP32 pronto em http://%s\\n", WiFi.localIP().toString().c_str());
  const char* hdrs[] = {"Authorization"};
  server.collectHeaders(hdrs, 1);
  server.on("/status", HTTP_GET, handleStatus);
  server.on("/cmd", HTTP_POST, handleCmd);
  server.begin();
}

void loop() { server.handleClient(); }
`;

export const ARDUINO_SKETCH = `// Lia • Arduino Uno — recebe comandos pela Serial (115200)
// Formato: "W <pin> <0|1>" | "P <pin> <0-255>" | "R <pin>" | "A <pin>"
void setup() { Serial.begin(115200); }

void loop() {
  if (!Serial.available()) return;
  String line = Serial.readStringUntil('\\n'); line.trim();
  char op = line.charAt(0);
  int sp = line.indexOf(' ', 2);
  int pin = line.substring(2, sp > 0 ? sp : line.length()).toInt();
  int val = sp > 0 ? line.substring(sp + 1).toInt() : 0;
  if (op == 'W') { pinMode(pin, OUTPUT); digitalWrite(pin, val ? HIGH : LOW); Serial.println(val ? 1 : 0); }
  else if (op == 'P') { pinMode(pin, OUTPUT); analogWrite(pin, constrain(val, 0, 255)); Serial.println(val); }
  else if (op == 'R') { pinMode(pin, INPUT_PULLUP); Serial.println(digitalRead(pin)); }
  else if (op == 'A') { Serial.println(analogRead(pin)); }
  else Serial.println("ERR");
}
`;

export const PYTHON_BRIDGE = `# Lia • Ponte Python para Arduino Uno (Serial USB -> HTTP)
# pip install flask pyserial    |    python lia_bridge.py
# Endpoints iguais ao ESP32: GET /status  |  POST /cmd {"action","pin","value"}
import serial, time
from flask import Flask, request, jsonify

PORTA = "COM3"        # Linux/Mac: "/dev/ttyACM0" ou "/dev/tty.usbmodem..."
LIA_TOKEN = ""        # opcional: mesmo token configurado na Lia

ser = serial.Serial(PORTA, 115200, timeout=2)
time.sleep(2)  # o Uno reinicia ao abrir a porta
app = Flask(__name__)
OPS = {"digital_write": "W", "pwm": "P", "digital_read": "R", "analog_read": "A"}

def autorizado():
    return not LIA_TOKEN or request.headers.get("Authorization") == f"Bearer {LIA_TOKEN}"

@app.get("/status")
def status():
    return jsonify(ok=True, device="arduino-uno", port=PORTA)

@app.post("/cmd")
def cmd():
    if not autorizado():
        return jsonify(ok=False, error="token invalido"), 401
    d = request.get_json(force=True) or {}
    op = OPS.get(d.get("action"))
    if not op:
        return jsonify(ok=False, error="acao desconhecida"), 400
    pin, val = int(d.get("pin", 13)), int(d.get("value", 0))
    ser.reset_input_buffer()
    ser.write(f"{op} {pin} {val}\\n".encode() if op in "WP" else f"{op} {pin}\\n".encode())
    resp = ser.readline().decode().strip()
    return jsonify(ok=resp != "ERR", action=d.get("action"), pin=pin, value=resp)

if __name__ == "__main__":
    # Exponha com um túnel (ex: ngrok http 5000) e cole o endereço https na Lia.
    app.run(host="0.0.0.0", port=5000)
`;
