import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { readUserGeminiKey, writeUserGeminiKey, readUserGroqKey, writeUserGroqKey } from "@/lib/lia/user-gemini";
import { LocalModelToggle } from "./LocalModelToggle";

function KeyField(props: {
  title: string;
  hint: string;
  placeholder: string;
  read: () => string;
  write: (v: string) => void;
}) {
  const [value, setValue] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    const k = props.read();
    setValue(k);
    setSaved(!!k);
  }, []);

  return (
    <div className="space-y-2 rounded-lg border border-border bg-card/40 p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{props.title}</p>
        <span className={saved ? "text-xs text-primary" : "text-xs text-muted-foreground"}>
          {saved ? "em uso" : "não configurada"}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{props.hint}</p>
      <Input type="password" placeholder={props.placeholder} value={value} onChange={(e) => setValue(e.target.value)} />
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => {
            props.write(value);
            setSaved(!!value.trim());
            toast.success(value.trim() ? "Chave salva." : "Chave removida.");
          }}
        >
          Salvar
        </Button>
        {saved && (
          <Button size="sm" variant="ghost" onClick={() => { props.write(""); setValue(""); setSaved(false); toast.success("Chave removida."); }}>
            Remover
          </Button>
        )}
      </div>
    </div>
  );
}

export function UserGeminiKey() {
  return (
    <div className="space-y-2">
      <KeyField
        title="Minha chave Groq (principal)"
        hint="Grátis em console.groq.com/keys — Llama 3.3 70B, milhares de mensagens por dia. Fica salva só neste aparelho."
        placeholder="gsk_..."
        read={readUserGroqKey}
        write={writeUserGroqKey}
      />
      <KeyField
        title="Minha chave Gemini"
        hint="Use sua própria chave do Google AI Studio (aistudio.google.com/apikey). Fica salva só neste aparelho."
        placeholder="AIza..."
        read={readUserGeminiKey}
        write={writeUserGeminiKey}
      />
      <LocalModelToggle />
    </div>
  );
}
