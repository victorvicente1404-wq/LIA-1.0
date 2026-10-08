import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { LiaNeoFace } from "./LiaNeoFace";
import {
  clearFaceOverride,
  FACE_RANGES,
  NEUTRAL_FACE,
  setFaceOverride,
  triggerGesture,
  type FaceGesture,
  type FaceParams,
} from "@/lib/lia/face-engine";

const LABELS: Record<keyof FaceParams, string> = {
  eyeOpen: "Abertura dos olhos",
  eyeSmile: "Olhos felizes ^^",
  browRaise: "Sobrancelhas (altura)",
  browTilt: "Sobrancelhas (inclinação)",
  mouthSmile: "Sorriso",
  mouthOpen: "Boca aberta",
  blush: "Blush",
  headTilt: "Inclinação da cabeça",
};

const GESTURES: [FaceGesture, string][] = [
  ["nod", "Acenar Sim"], ["shake", "Balançar Não"], ["tilt", "Curiosa"], ["blink", "Piscar"], ["bounce", "Pular"],
];

/** Laboratório do rosto: testar gestos e cada parâmetro ao vivo. */
export function FacePlayground() {
  const [open, setOpen] = useState(false);
  const [vals, setVals] = useState<FaceParams>(NEUTRAL_FACE);

  const set = (k: keyof FaceParams, v: number) => {
    const next = { ...vals, [k]: v };
    setVals(next);
    setFaceOverride(next, 0);
  };

  return (
    <section className="rounded-lg border border-border bg-surface p-3">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between text-sm font-medium">
        Laboratório do rosto
        <ChevronDown className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          <div className="flex justify-center"><LiaNeoFace mode="idle" size={160} /></div>
          <div className="flex flex-wrap gap-2">
            {GESTURES.map(([g, label]) => (
              <Button key={g} size="sm" variant="outline" onClick={() => triggerGesture(g)}>{label}</Button>
            ))}
            <Button size="sm" variant="outline" onClick={() => set("blush", vals.blush > 0.5 ? 0 : 1)}>Corar</Button>
            <Button size="sm" variant="ghost" onClick={() => { setVals(NEUTRAL_FACE); clearFaceOverride(); }}>Resetar</Button>
          </div>
          {(Object.keys(LABELS) as (keyof FaceParams)[]).map((k) => {
            const [min, max] = FACE_RANGES[k];
            return (
              <div key={k} className="space-y-1">
                <Label className="flex justify-between text-xs"><span>{LABELS[k]}</span><span className="text-muted-foreground">{vals[k].toFixed(2)}</span></Label>
                <Slider min={min} max={max} step={k === "headTilt" ? 1 : 0.05} value={[vals[k]]} onValueChange={([v]) => set(k, v ?? 0)} />
              </div>
            );
          })}
          <p className="text-xs text-muted-foreground">A Lia também controla o rosto sozinha durante a conversa.</p>
        </div>
      )}
    </section>
  );
}
