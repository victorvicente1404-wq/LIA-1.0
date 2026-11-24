import { useCallback, useState } from "react";
import { RefreshCw, ShieldCheck, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  readCostGuard,
  summarizeCostGuard,
  updateCostGuardConfig,
  type CostGuardState,
} from "@/lib/lia/cost-guard";

const brl = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function CostGuardSection() {
  const [state, setState] = useState<CostGuardState>(() => readCostGuard());
  const [budget, setBudget] = useState(String(state.config.monthlyBudgetBRL));
  const [reserve, setReserve] = useState(String(state.config.reserveBRL));
  const [exchange, setExchange] = useState(String(state.config.usdToBrl));
  const [notice, setNotice] = useState("");

  const refresh = useCallback(() => {
    const latest = readCostGuard();
    setState(latest);
    setBudget(String(latest.config.monthlyBudgetBRL));
    setReserve(String(latest.config.reserveBRL));
    setExchange(String(latest.config.usdToBrl));
    setNotice("");
  }, []);

  const summary = summarizeCostGuard(state);

  const save = () => {
    const monthlyBudgetBRL = Number(budget);
    const reserveBRL = Number(reserve);
    const usdToBrl = Number(exchange);
    if (![monthlyBudgetBRL, reserveBRL, usdToBrl].every(Number.isFinite) ||
        monthlyBudgetBRL <= 0 || reserveBRL < 0 || reserveBRL >= monthlyBudgetBRL || usdToBrl <= 0) {
      setNotice("Confira os valores: orçamento maior que zero, reserva menor que o orçamento e câmbio positivo.");
      return;
    }
    const next = updateCostGuardConfig({ monthlyBudgetBRL, reserveBRL, usdToBrl });
    setState(next);
    setNotice("Orçamento salvo neste aparelho.");
  };

  const toggle = () => {
    const next = updateCostGuardConfig({ enabled: !state.config.enabled });
    setState(next);
    setNotice(next.config.enabled ? "Proteção de orçamento ativada." : "Proteção desativada. Chamadas pagas devem permanecer bloqueadas até o gateway aplicar esta configuração.");
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-base font-semibold">Custos e proteção</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Painel local de orçamento da Lia. As tarifas são estimativas configuráveis; o registro real começa quando o gateway pago for conectado.
        </p>
      </div>

      <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Proteção de orçamento
          </div>
          <span className={state.config.enabled ? "text-xs text-primary" : "text-xs text-destructive"}>
            {state.config.enabled ? "Ativa" : "Desativada"}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Reserva de segurança protegida contra uso rotineiro. O bloqueio será aplicado pelo gateway antes de cada chamada paga.
        </p>
        <Button className="mt-3 w-full" size="sm" variant={state.config.enabled ? "secondary" : "default"} onClick={toggle}>
          {state.config.enabled ? "Desativar proteção" : "Ativar proteção"}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-md border border-border bg-surface/60 p-3">
          <p className="text-[10px] text-muted-foreground">Gasto neste mês</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">{brl(summary.monthSpentBRL)}</p>
        </div>
        <div className="rounded-md border border-border bg-surface/60 p-3">
          <p className="text-[10px] text-muted-foreground">Gasto neste ano</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">{brl(summary.yearSpentBRL)}</p>
        </div>
        <div className="rounded-md border border-border bg-surface/60 p-3">
          <p className="text-[10px] text-muted-foreground">Disponível para uso normal</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">{brl(summary.monthAvailableBRL)}</p>
        </div>
        <div className="rounded-md border border-border bg-surface/60 p-3">
          <p className="text-[10px] text-muted-foreground">Reserva protegida</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">{brl(summary.reserveBRL)}</p>
        </div>
      </div>

      <div className="space-y-3 rounded-md border border-border bg-surface/60 p-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Wallet className="h-4 w-4 text-primary" />
          Limites e câmbio
        </div>
        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">Orçamento mensal (R$)</span>
          <Input inputMode="decimal" value={budget} onChange={(event) => setBudget(event.target.value)} />
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">Reserva mensal (R$)</span>
          <Input inputMode="decimal" value={reserve} onChange={(event) => setReserve(event.target.value)} />
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">Câmbio USD → BRL usado na estimativa</span>
          <Input inputMode="decimal" value={exchange} onChange={(event) => setExchange(event.target.value)} />
        </label>
        <Button className="w-full" size="sm" onClick={save}>Salvar limites</Button>
        {notice && <p className="text-[11px] text-muted-foreground" role="status">{notice}</p>}
      </div>

      <div className="space-y-2 rounded-md border border-border bg-surface/60 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">Tarifas de referência · USD / 1 milhão de tokens</p>
          <Button size="icon" variant="ghost" onClick={refresh} title="Atualizar painel">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
        {(["standard", "flex", "batch"] as const).map((tier) => {
          const rate = state.config.rates[tier];
          return (
            <div key={tier} className="flex items-center justify-between gap-2 text-xs">
              <span className="capitalize font-medium">{tier}</span>
              <span className="text-right text-muted-foreground">
                entrada ${rate.inputPerMillion} · cache ${rate.cachedInputPerMillion} · saída ${rate.outputPerMillion}
              </span>
            </div>
          );
        })}
        <div className="border-t border-border pt-2 text-[11px] text-muted-foreground">
          {summary.monthEntryCount} lançamento(s) no mês · {summary.pendingBRL.toFixed(4)} em chamadas reservadas.
          <br />
          O histórico fica neste navegador/aparelho e não é sincronizado com o painel de cobrança do provedor.
        </div>
      </div>
    </div>
  );
}
