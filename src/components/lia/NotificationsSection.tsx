import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Bell, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { notificationsEnabled, notify, setNotificationsEnabled } from "@/lib/lia/notifications";
import { hasPushSubscription, pushStatus, pushSupported, subscribePush, unsubscribePush, type PushStatus } from "@/lib/lia/push-client";
import { addRoutine, deleteRoutine, listRoutines, sendSelfPush } from "@/lib/lia/push.functions";

const LABEL: Record<PushStatus, string> = {
  default: "Não solicitado",
  granted: "Ativado",
  denied: "Bloqueado",
  unsupported: "Não suportado",
};
const DAYS = ["D", "S", "T", "Q", "Q", "S", "S"];
type Routine = { id: string; title: string; time_hm: string; weekdays: number[] };

export function NotificationsSection() {
  const [status, setStatus] = useState<PushStatus>("default");
  const [on, setOn] = useState(false);
  const [logged, setLogged] = useState(false);
  const [supported, setSupported] = useState(false);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("08:00");
  const [days, setDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);

  const loadRoutines = () => listRoutines().then((r) => setRoutines(r as Routine[])).catch(() => {});

  useEffect(() => {
    setStatus(pushStatus());
    setSupported(pushSupported());
    void supabase.auth.getSession().then(({ data }) => {
      const ok = !!data.session;
      setLogged(ok);
      if (ok) void loadRoutines();
      if (pushSupported() && ok) {
        void hasPushSubscription().then(async (has) => {
          setOn(has);
          if (has && Notification.permission === "granted") await subscribePush().catch(() => {}); // renova
        });
      } else setOn(notificationsEnabled());
    });
  }, []);

  async function toggle(value: boolean) {
    try {
      if (supported && logged) {
        if (value) {
          const ok = await subscribePush();
          setOn(ok);
          if (!ok) toast.error("A permissão de notificações não foi concedida.");
        } else {
          await unsubscribePush();
          setOn(false);
        }
        await setNotificationsEnabled(value);
      } else {
        const ok = await setNotificationsEnabled(value);
        setOn(ok);
        if (value && !ok) toast.error("A permissão de notificações não foi concedida.");
      }
    } catch {
      toast.error("Não foi possível ativar as notificações agora.");
    }
    setStatus(pushStatus());
  }

  async function test() {
    if (supported && logged && on) {
      const r = await sendSelfPush({ data: { title: "Teste", body: "Tudo certo! As notificações da Lia estão funcionando." } }).catch(() => null);
      if (r?.sent) { toast.success("Notificação enviada."); return; }
      toast.error("O servidor não conseguiu entregar o push. Desligue e ligue as notificações de novo.");
    }
    if (notificationsEnabled()) {
      await notify("Lia • Teste", "Tudo certo! As notificações da Lia estão funcionando.");
      toast.success(logged ? "Notificação enviada." : "Notificação enviada (entre na conta para receber com a aba fechada).");
      return;
    }
    toast.error("Ative as notificações primeiro.");
  }

  async function saveRoutine() {
    if (!title.trim() || !days.length) return;
    try {
      await addRoutine({ data: { title: title.trim(), time_hm: time, weekdays: days } });
      setTitle("");
      await loadRoutines();
      toast.success("Rotina salva.");
    } catch {
      toast.error("Não foi possível salvar a rotina.");
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-medium"><Bell className="h-3.5 w-3.5" /> Notificações</p>
          <p className="text-[11px] text-muted-foreground">
            Status: <span className="text-glow">{LABEL[status]}</span>
            {!supported && " · aviso simples só com a aba aberta"}
          </p>
        </div>
        <Switch checked={on} onCheckedChange={(v) => void toggle(v)} disabled={status === "unsupported"} />
      </div>
      {supported && !logged && (
        <p className="text-[11px] text-muted-foreground">Entre na sua conta para receber avisos com a aba fechada.</p>
      )}
      {!supported && status !== "unsupported" && (
        <p className="text-[11px] text-muted-foreground">O push completo funciona só no app publicado (no iPhone, depois de "Adicionar à Tela de Início").</p>
      )}
      {status === "denied" && (
        <div className="space-y-1 rounded-md bg-muted/40 p-2 text-[11px] text-muted-foreground">
          <p className="font-medium text-foreground">Como liberar:</p>
          <p>Chrome/Edge: toque no cadeado ao lado do endereço → Notificações → Permitir.</p>
          <p>Safari no iPhone: Compartilhar → Adicionar à Tela de Início, abra por lá e ative de novo.</p>
          <p>Firefox: cadeado → Permissões → Notificações → Permitir.</p>
        </div>
      )}
      <Button size="sm" variant="outline" onClick={() => void test()}>Enviar notificação de teste</Button>

      {logged && (
        <div className="space-y-2 border-t border-border pt-2">
          <p className="text-xs font-medium">Rotinas</p>
          {routines.map((r) => (
            <div key={r.id} className="flex items-center justify-between text-xs">
              <span>{r.time_hm} · {r.title} <span className="text-muted-foreground">({r.weekdays.map((d) => DAYS[d]).join("")})</span></span>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => void deleteRoutine({ data: { id: r.id } }).then(loadRoutines)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
          <div className="flex gap-2">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: beber água" className="h-8 text-xs" />
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-8 w-24 text-xs" />
          </div>
          <div className="flex items-center gap-1">
            {DAYS.map((d, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setDays((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i].sort()))}
                className={`h-6 w-6 rounded-full border text-[10px] ${days.includes(i) ? "border-primary bg-primary/20 text-glow" : "border-border text-muted-foreground"}`}
              >
                {d}
              </button>
            ))}
            <Button size="sm" className="ml-auto h-7" onClick={() => void saveRoutine()}>Adicionar</Button>
          </div>
        </div>
      )}
    </div>
  );
}
