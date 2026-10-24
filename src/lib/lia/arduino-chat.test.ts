import { describe, expect, it } from "vitest";
import { parseArduinoChat } from "./arduino-chat";

describe("comandos locais do chat", () => {
  it("ligue pino 2 envia HIGH para o pino 2", () => {
    expect(parseArduinoChat("ligue pino 2")).toEqual({ command: { pin: 2, value: 1, name: "Sala" } });
  });
  it("ligue sala usa o pino 2 do nome salvo", () => {
    expect(parseArduinoChat("ligue sala")).toEqual({ command: { pin: 2, value: 1, name: "Sala" } });
  });
  it("desligue sala envia LOW", () => {
    expect(parseArduinoChat("desligue sala")).toEqual({ command: { pin: 2, value: 0, name: "Sala" } });
  });
  it("aceita acentos, saudação curta e os sinônimos existentes", () => {
    expect(parseArduinoChat("Lia, acenda a luz da suíte master, por favor!")).toEqual({ command: { pin: 5, value: 1, name: "Suíte Master" } });
    expect(parseArduinoChat("apague quarto grande")).toEqual({ command: { pin: 5, value: 0, name: "Suíte Master" } });
  });
  it("não aciona hardware ao conversar ou ao receber comandos ambíguos", () => {
    for (const text of ["não ligue sala", "como ligar pino 2?", "ligue sala e cozinha", "ligue a internet"]) {
      expect(parseArduinoChat(text)).toBeNull();
    }
  });
  it("protege os pinos de comunicação e limita ao Uno", () => {
    for (const pin of [0, 1, 20, 99]) expect(parseArduinoChat(`ligue pino ${pin}`)).toHaveProperty("error");
    expect(parseArduinoChat("ligue pino 19")).toHaveProperty("command.pin", 19);
  });
});