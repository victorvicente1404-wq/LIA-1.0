import { useState } from "react";
import { Lightbulb, Loader2, Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ROOMS } from "@/lib/lia/device";
import { sendSerial } from "@/lib/lia/webserial";

export function ArduinoPinControls({ connected }: { connected: boolean }) {
  const [pending, setPending] = useState<number | null>(null);
  const [feedback, setFeedback] = useState("");

  const command = async (pin: number, on: boolean) => {
    setPending(pin);
    setFeedback("");
    try {
      const response = await sendSerial({ action: "digital_write", pin, value: on ? 1 : 0 });
      if (response !== (on ? "1" : "0")) {
        throw new Error(response ? `Arduino respondeu: ${response}` : "Arduino não confirmou o comando. Confira o sketch e a porta USB.");
      }
      setFeedback(`Pino ${pin}: Arduino confirmou ${on ? "HIGH (1)" : "LOW (0)"}.`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Não foi possível enviar o comando.");
    } finally {
      setPending(null);
    }
  };

  return (
    <section className="space-y-2 border-t border-border pt-3" aria-label="Controle dos pinos Arduino">
      <p className="flex items-center gap-2 text-xs font-medium"><Lightbulb className="h-4 w-4 text-primary" /> LEDs da maquete</p>
      <div className="divide-y divide-border">
        {ROOMS.map((room) => (
          <div key={room.pin} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <div className="min-w-0 flex-1">
              <p className="break-words text-xs font-medium">{room.nome}</p>
              <p className="text-[11px] text-muted-foreground">Pino {room.pin}</p>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button size="sm" variant="outline" disabled={!connected || pending !== null} aria-label={`Ligar ${room.nome}, pino ${room.pin}`} onClick={() => void command(room.pin, true)}>
                {pending === room.pin ? <Loader2 className="mr-1 h-3 w-3 animate-spin motion-reduce:animate-none" /> : <Lightbulb className="mr-1 h-3 w-3" />} Ligar
              </Button>
              <Button size="sm" variant="ghost" disabled={!connected || pending !== null} aria-label={`Desligar ${room.nome}, pino ${room.pin}`} onClick={() => void command(room.pin, false)}>
                <Power className="mr-1 h-3 w-3" /> Desligar
              </Button>
            </div>
          </div>
        ))}
      </div>
      {!connected && <p className="text-[11px] text-muted-foreground">USB desconectado</p>}
      {feedback && <p role="status" className="break-words text-[11px] text-muted-foreground">{feedback}</p>}
    </section>
  );
}