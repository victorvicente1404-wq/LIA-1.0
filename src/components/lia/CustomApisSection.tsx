import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, CloudDownload, Pencil, Plus, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useLia } from "@/lib/lia/LiaProvider";
import { CustomApiSchema, emptyApi, loadCustomApisFromAccount, mergeCustomApis } from "@/lib/lia/custom-apis";
import { testCustomApi, testCustomProvider } from "@/lib/lia/customApis.functions";
import type { CustomApi } from "@/lib/lia/types";

const selectCls = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";

function Editor({ value, onCancel, onSave }: { value: CustomApi; onCancel: () => void; onSave: (a: CustomApi) => void }) {
  const [a, setA] = useState(value);
  const [headers, setHeaders] = useState(JSON.stringify(value.headers, null, 2));
  const [schema, setSchema] = useState(JSON.stringify(value.parameters_schema, null, 2));
  const set = (p: Partial<CustomApi>) => setA((x) => ({ ...x, ...p }));
  const isTool = a.type === "tool";

  const submit = () => {
    try {
      const next = { ...a, headers: JSON.parse(headers || "{}"), parameters_schema: JSON.parse(schema || "{}") };
      const parsed = CustomApiSchema.safeParse(next);
      if (!parsed.success) return toast.error(parsed.error.issues[0]?.message ?? "Dados inválidos.");
      onSave(parsed.data as CustomApi);
    } catch {
      toast.error("Cabeçalhos ou parâmetros não são um JSON válido.");
    }
  };

  return (
    <div className="space-y-2 rounded-xl border border-primary/40 p-3">
      <div className="grid grid-cols-2 gap-2">
        <div><Label className="text-[11px]">Identificador</Label><Input value={a.name} onChange={(e) => set({ name: e.target.value })} placeholder={isTool ? "web_search" : "groq_llama"} /></div>
        <div><Label className="text-[11px]">Nome visível</Label><Input value={a.display_name} onChange={(e) => set({ display_name: e.target.value })} /></div>
      </div>
      <div><Label className="text-[11px]">Endereço</Label><Input value={a.api_url} onChange={(e) => set({ api_url: e.target.value })} placeholder={isTool ? "https://api.exemplo.com/busca" : "https://api.groq.com/openai/v1"} /></div>
      {isTool ? (
        <div className="grid grid-cols-2 gap-2">
          <div><Label className="text-[11px]">Método</Label>
            <select className={selectCls} value={a.method} onChange={(e) => set({ method: e.target.value as CustomApi["method"] })}>
              {["GET", "POST", "PUT", "DELETE"].map((m) => <option key={m}>{m}</option>)}
            </select></div>
          <div><Label className="text-[11px]">Parâmetros vão no</Label>
            <select className={selectCls} value={a.param_location} onChange={(e) => set({ param_location: e.target.value as CustomApi["param_location"] })}>
              <option value="auto">Automático</option><option value="query">Endereço</option><option value="body">Corpo</option>
            </select></div>
        </div>
      ) : (
        <div><Label className="text-[11px]">Modelo</Label><Input value={a.model_name ?? ""} onChange={(e) => set({ model_name: e.target.value })} placeholder="llama-3.3-70b-versatile" /></div>
      )}
      <div><Label className="text-[11px]">Descrição (para a Lia saber quando usar)</Label><Textarea rows={2} value={a.description} onChange={(e) => set({ description: e.target.value })} /></div>
      <div><Label className="text-[11px]">Cabeçalhos (JSON)</Label><Textarea rows={2} className="font-mono text-xs" value={headers} onChange={(e) => setHeaders(e.target.value)} placeholder='{"Authorization": "Bearer ..."}' /></div>
      {isTool && <div><Label className="text-[11px]">Parâmetros (JSON Schema)</Label><Textarea rows={4} className="font-mono text-xs" value={schema} onChange={(e) => setSchema(e.target.value)} /></div>}
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancelar</Button>
        <Button size="sm" onClick={submit}>Salvar</Button>
      </div>
    </div>
  );
}

export function CustomApisSection() {
  const { customApis, saveCustomApis, cardConnected } = useLia();
  const [editing, setEditing] = useState<CustomApi | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [result, setResult] = useState<Record<string, string>>({});
  const providers = customApis.filter((a) => a.type === "llm_provider").sort((a, b) => a.priority - b.priority);
  const tools = customApis.filter((a) => a.type === "tool");

  useEffect(() => {
    if (!cardConnected) return;
    void loadCustomApisFromAccount().then((remote) => {
      const merged = mergeCustomApis(customApis, remote);
      if (merged.length !== customApis.length) saveCustomApis(merged);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardConnected]);

  if (!cardConnected) {
    return <p className="rounded-xl border border-border p-3 text-[11px] text-muted-foreground">Conecte um Lia Card para cadastrar extensões.</p>;
  }

  const upsert = (api: CustomApi) => {
    if (customApis.some((x) => x.name === api.name && x.id !== api.id)) return toast.error("Já existe uma extensão com esse identificador.");
    const exists = customApis.some((x) => x.id === api.id);
    saveCustomApis(exists ? customApis.map((x) => (x.id === api.id ? api : x)) : [...customApis, api]);
    setEditing(null);
    toast.success("Extensão salva.");
  };
  const patch = (id: string, p: Partial<CustomApi>) => saveCustomApis(customApis.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const remove = (id: string) => saveCustomApis(customApis.filter((x) => x.id !== id));
  const move = (idx: number, dir: -1 | 1) => {
    const order = [...providers];
    const j = idx + dir;
    if (j < 0 || j >= order.length) return;
    [order[idx], order[j]] = [order[j]!, order[idx]!];
    const prio = new Map(order.map((p, i) => [p.id, i]));
    saveCustomApis(customApis.map((x) => (prio.has(x.id) ? { ...x, priority: prio.get(x.id)! } : x)));
  };
  const test = async (api: CustomApi) => {
    setTesting(api.id);
    try {
      const r = api.type === "tool" ? await testCustomApi({ data: { api, params: {} } }) : await testCustomProvider({ data: { api } });
      const status = "status" in r ? `HTTP ${r.status} · ` : "";
      setResult((m) => ({ ...m, [api.id]: `${r.ok ? "🟢" : "🔴"} ${status}${r.ms}ms\n${r.body}` }));
    } catch (e) {
      setResult((m) => ({ ...m, [api.id]: `🔴 ${(e as Error).message}` }));
    } finally {
      setTesting(null);
    }
  };

  const row = (api: CustomApi, extra?: React.ReactNode, label?: string) => (
    <div key={api.id} className="space-y-1.5 rounded-lg border border-border p-2">
      <div className="flex items-center gap-2">
        {extra}
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{api.display_name || api.name} {label && <span className="ml-1 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary">{label}</span>}</p>
          <p className="truncate text-[10px] text-muted-foreground">{api.type === "tool" ? `${api.method} ${api.api_url}` : `${api.model_name} · ${api.api_url}`}</p>
        </div>
        <Switch checked={api.is_active} onCheckedChange={(v) => patch(api.id, { is_active: v })} />
      </div>
      <div className="flex flex-wrap gap-1">
        <Button size="sm" variant="secondary" className="h-7 text-xs" disabled={testing === api.id} onClick={() => void test(api)}>
          <Zap className="mr-1 h-3 w-3" />{testing === api.id ? "Testando…" : api.type === "tool" ? "Testar API" : "Testar provedor"}
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditing(api)}><Pencil className="mr-1 h-3 w-3" />Editar</Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => remove(api.id)}><Trash2 className="mr-1 h-3 w-3" />Excluir</Button>
      </div>
      {result[api.id] && <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 text-[10px]">{result[api.id]}</pre>}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-xl border border-border p-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Provedores de IA reservas</p>
            <p className="text-[11px] text-muted-foreground">Usados em ordem se a IA principal falhar (7s cada). Formato compatível com OpenAI.</p>
          </div>
          <Button size="sm" variant="secondary" onClick={() => setEditing(emptyApi("llm_provider", providers.length))}><Plus className="h-3.5 w-3.5" /></Button>
        </div>
        {providers.length === 0 && <p className="text-[11px] text-muted-foreground">Nenhum provedor cadastrado.</p>}
        {providers.map((p, i) =>
          row(
            p,
            <div className="flex flex-col">
              <button aria-label="Subir prioridade" className="text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="h-3.5 w-3.5" /></button>
              <button aria-label="Descer prioridade" className="text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={i === providers.length - 1} onClick={() => move(i, 1)}><ArrowDown className="h-3.5 w-3.5" /></button>
            </div>,
            i === 0 ? "Primário" : `Reserva ${i}`,
          ),
        )}
      </div>

      <div className="space-y-2 rounded-xl border border-border p-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Ferramentas dinâmicas</p>
            <p className="text-[11px] text-muted-foreground">APIs que a Lia pode chamar sozinha no chat. Você também pode pedir: "cadastre a API…".</p>
          </div>
          <Button size="sm" variant="secondary" onClick={() => setEditing(emptyApi("tool"))}><Plus className="h-3.5 w-3.5" /></Button>
        </div>
        {tools.length === 0 && <p className="text-[11px] text-muted-foreground">Nenhuma ferramenta cadastrada.</p>}
        {tools.map((t) => row(t))}
      </div>

      {editing && <Editor key={editing.id} value={editing} onCancel={() => setEditing(null)} onSave={upsert} />}
      <p className="flex items-center gap-1 text-[10px] text-muted-foreground"><CloudDownload className="h-3 w-3" /> As chaves ficam no Lia Card e no backup JSON. Guarde o arquivo com cuidado.</p>
    </div>
  );
}
