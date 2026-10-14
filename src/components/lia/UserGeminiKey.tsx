import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { readUserGeminiKey, writeUserGeminiKey } from "@/lib/lia/user-gemini";

export function UserGeminiKey() {
  const [value, setValue] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    const k = readUserGeminiKey();
    setValue(k);
    setSaved(!!k);
  }, []);

  return (
    <div className="space-y-2 rounded-lg border border-border bg-card/40 p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Minha chave Gemini</p>
        <span className={saved ? "text-xs text-primary" : "text-xs text-muted-foreground"}>
          {saved ? "em uso" : "não configurada"}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        Use sua própria chave do Google AI Studio (aistudio.google.com/apikey). Fica salva só neste aparelho.
      </p>
      <Input type="password" placeholder="AIza..." value={value} onChange={(e) => setValue(e.target.value)} />
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => {
            writeUserGeminiKey(value);
            setSaved(!!value.trim());
            toast.success(value.trim() ? "Chave Gemini salva." : "Chave removida.");
          }}
        >
          Salvar
        </Button>
        {saved && (
          <Button size="sm" variant="ghost" onClick={() => { writeUserGeminiKey(""); setValue(""); setSaved(false); toast.success("Chave removida."); }}>
            Remover
          </Button>
        )}
      </div>
    </div>
  );
}
