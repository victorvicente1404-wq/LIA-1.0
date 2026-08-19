import { useEffect, useState } from "react";
import { LiaOrb } from "./LiaOrb";

const steps = [
  "Iniciando núcleo da Lia",
  "Carregando módulos",
  "Procurando Lia Card",
  "Restaurando memória e personalidade",
  "Lia pronta",
];

export function BootSequence({
  cardConnected,
  cardPresent,
  onDone,
}: {
  cardConnected: boolean;
  cardPresent: boolean;
  onDone: () => void;
}) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (step >= steps.length) {
      const t = setTimeout(onDone, 450);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setStep((s) => s + 1), 420);
    return () => clearTimeout(t);
  }, [step, onDone]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 bg-background">
      <LiaOrb state="thinking" size={120} />
      <div className="text-center">
        <h1 className="font-display text-5xl font-semibold tracking-[0.35em] text-gradient-lia">
          LIA
        </h1>
        <p className="mt-2 text-xs uppercase tracking-[0.3em] text-muted-foreground">
          assistente pessoal · modular · portátil
        </p>
      </div>
      <div className="w-72 space-y-2">
        {steps.map((s, i) => (
          <div
            key={s}
            className={`flex items-center gap-2 text-xs transition-opacity ${
              i <= step ? "opacity-100" : "opacity-25"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${i < step ? "bg-primary" : "bg-muted-foreground/40"}`}
            />
            <span className="text-muted-foreground">
              {i === 2
                ? cardConnected
                  ? "Lia Card detectado"
                  : cardPresent
                    ? "Lia Card presente, não montado"
                    : "Nenhum Lia Card encontrado"
                : s}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
