import { useCallback, useState } from "react";
import { RefreshCw, ShieldCheck, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { readAiRoutingMode, writeAiRoutingMode, type AiRoutingMode } from "@/lib/lia/ai-router";
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
  const [annualBudget, setAnnualBudget] = useState(String(state.config.annualBudgetBRL));
  const [exchange, setExchange] = useState(String(state.config.usdToBrl));
  const [notice, setNotice] = useState("");\n  const [routingMode, setRoutingMode] = useState<AiRoutingMode>(() => readAiRoutingMode());

  const refresh = useCallback(() => {
    const latest = readCostGuard();
    setState(latest);
    setBudget(String(latest.config.monthlyBudgetBRL));
    setReserve(String(latest.config.reserveBRL));
    setAnnualBudget(String(latest.config.annualBudgetBRL));
    setExchange(String(latest.config.usdToBrl));
    setRoutingMode(readAiRoutingMode());
    setNotice("");
  }, []);

  const summary = summarizeCostGuard(state);

  const save = () => {
    const monthlyBudgetBRL = Number(budget);
    const reserveBRL = Number(reserve);
    const annualBudgetBRL = Number(annualBudget);
    const usdToBrl = Number(exchange);
    if (![monthlyBudgetBRL, reserveBRL, annualBudgetBRL, usdToBrl].every(Number.isFinite) ||
        monthlyBudgetBRL <= 0 || annualBudgetBRL <= 0 || reserveBRL < 0 || reserveBRL >= monthlyBudgetBRL || usdToBrl <= 0) {
      setNotice("Confira os valores: limites maiores que zero, reserva menor que o orçamento mensal e câmbio positivo.");
      return;
    }
    const next = updateCostGuardConfig({ monthlyBudgetBRL, annualBudgetBRL, reserveBRL, usdToBrl });
    setState(next);
    setNotice("Orçamento salvo neste aparelho.");
  };

  const toggle = () => {
    const next = updateCostGuardConfig({ enabled: !state.config.enabled });
    setState(next);
    setNotice(next.config.enabled ? "Chamadas pagas liberadas somente após autorização de orçamento." : "Chamadas pagas pausadas. O gateway deve bloquear todas as novas chamadas.");
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-base font-semibold">Custos e proteção</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Orçamento da Lia com pré-autorização local e limite adicional no servidor. O painel local é um espelho; a cobrança oficial continua no provedor.
        </p>
      </div>

      <div className="space-y-2 rounded-md border border-border bg-surface/60 p-3">
        <div className="text-sm font-medium">Roteamento de IA</div>
        <p className="text-xs text-muted-foreground">
          O modo local é o padrão. No híbrido, pedidos complexos podem usar a Luna paga; conversas comuns, comandos do aparelho e anexos continuam no motor local.
        </p>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">{routingMode === "hybrid" ? "Híbrido · local + Luna" : "Somente local"}</p>
            <p className="text-[11px] text-muted-foreground">
              {routingMode === "hybrid" ? "Pode gerar cobranças quando a tarefa for complexa." : "Nenhuma chamada paga será iniciada pelo chat."}
            </p>
          </div>
          <Button size="sm" variant={routingMode === "hybrid" ? "default" : "secondary"} onClick={() => {
            const next: AiRoutingMode = routingMode === "hybrid" ? "local" : "hybrid";
            if (!writeAiRoutingMode(next)) {
              setNotice("Não consegui salvar o modo de roteamento neste aparelho.");
              return;
            }
            setRoutingMode(next);
            setNotice(next === "hybrid" ? "Modo híbrido ativado. A Luna só será chamada para tarefas classificadas como complexas e após autorização de orçamento." : "Modo local ativado. O chat não iniciará novas chamadas pagas.");
          }}>
            {routingMode === "hybrid" ? "Desativar híbrido" : "Ativar híbrido"}
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Proteção de orçamento
          </div>
          <span className={state.config.enabled ? "text-xs text-primary" : "text-xs text-destructive"}>
            {state.config.enabled ? "Ativa · chamadas sob controle" : "Pausada · chamadas pagas bloqueadas"}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          O app verifica o limite antes da chamada e o servidor mantém uma segunda reserva independente antes de acessar a OpenAI.
        </p>
        <Button className="mt-3 w-full" size="sm" variant={state.config.enabled ? "secondary" : "default"} onClick={toggle}>
          {state.config.enabled ? "Pausar chamadas pagas" : "Retomar chamadas pagas"}
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
          <span className="text-xs text-muted-foreground">Limite anual (R$)</span>
          <Input inputMode="decimal" value={annualBudget} onChange={(event) => setAnnualBudget(event.target.value)} />
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
