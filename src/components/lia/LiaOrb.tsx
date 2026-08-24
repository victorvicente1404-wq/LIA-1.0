import { cn } from "@/lib/utils";
import type { LiaState } from "@/lib/lia/types";

const label: Record<LiaState, string> = {
  idle: "Inativa",
  passive: "Aguardando “Lia”",
  waking: "Chamada detectada",
  watching: "Observando",
  listening: "Ouvindo",
  thinking: "Pensando",
  speaking: "Falando",
};

export function stateLabel(state: LiaState) {
  return label[state];
}

export function LiaOrb({
  state,
  size = 64,
  className,
}: {
  state: LiaState;
  size?: number;
  className?: string;
}) {
  const active = state !== "idle";
  return (
    <div
      className={cn("relative grid place-items-center", className)}
      style={{ width: size, height: size }}
      aria-label={`Lia: ${label[state]}`}
    >
      <div
        className={cn(
          "absolute inset-0 rounded-full bg-gradient-lia opacity-25 blur-xl",
          active && "animate-lia-pulse",
        )}
      />
      <div
        className={cn(
          "absolute inset-[12%] rounded-full border border-primary/50",
          state === "thinking" && "animate-lia-spin-slow border-dashed border-primary",
        )}
      />
      <div
        className={cn(
          "absolute inset-[26%] rounded-full bg-gradient-lia",
          state === "speaking" && "animate-lia-pulse",
          state === "idle" && "opacity-50",
        )}
      />
      {state === "listening" && (
        <div className="absolute inset-0 flex items-center justify-center gap-[3px]">
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className="w-[3px] rounded-full bg-glow"
              style={{
                height: size * 0.45,
                animation: `lia-wave 900ms ease-in-out ${i * 110}ms infinite`,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
