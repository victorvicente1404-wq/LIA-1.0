import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { useLia } from "@/lib/lia/LiaProvider";
import { TREATS } from "@/lib/lia/rewards";

export function TreatDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { bond, giveTreat } = useLia();
  const indicators = [
    ["Humor", bond.humor],
    ["Confiança", bond.confianca],
    ["Intimidade", bond.intimidade],
  ] as const;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] w-[calc(100%-1.5rem)] overflow-y-auto border-border bg-background sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Recompensar a Lia</DialogTitle>
          <DialogDescription>
            Escolha um pen-drive de sabor para fortalecer o vínculo de vocês.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 sm:grid-cols-2">
          {TREATS.map((treat) => (
            <button
              key={treat.id}
              type="button"
              className="rounded-lg border border-border bg-surface p-3 text-left transition hover:border-primary hover:bg-surface-2"
              onClick={() => {
                giveTreat(treat.id);
                onOpenChange(false);
              }}
            >
              <span className="text-2xl" aria-hidden>
                {treat.emoji}
              </span>
              <p className="mt-2 text-sm font-semibold">{treat.nome}</p>
              <p className="text-xs text-muted-foreground">{treat.detalhe}</p>
            </button>
          ))}
        </div>
        <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-3">
          {indicators.map(([label, value]) => (
            <div key={label} className="space-y-1">
              <div className="flex justify-between text-xs">
                <span>{label}</span>
                <span>{value}%</span>
              </div>
              <Progress value={value} />
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}