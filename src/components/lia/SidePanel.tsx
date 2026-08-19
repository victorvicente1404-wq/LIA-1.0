import { useState } from "react";
import {
  Blocks,
  Brain,
  Cpu,
  Settings2,
  ShieldCheck,
  Sparkle,
  UserRound,
  Plus,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { LiaCardPanel } from "./LiaCardPanel";
import { useLia } from "@/lib/lia/LiaProvider";
import { cn } from "@/lib/utils";
import type { Personality } from "@/lib/lia/types";

type SectionId =
  | "memoria"
  | "perfil"
  | "personalidade"
  | "modulos"
  | "config"
  | "privacidade"
  | "card";

const sections: { id: SectionId; label: string; icon: React.ElementType }[] = [
  { id: "memoria", label: "Memória", icon: Brain },
  { id: "perfil", label: "Perfil", icon: UserRound },
  { id: "personalidade", label: "Personalidade", icon: Sparkle },
  { id: "modulos", label: "Módulos", icon: Blocks },
  { id: "config", label: "Configurações", icon: Settings2 },
  { id: "privacidade", label: "Privacidade", icon: ShieldCheck },
  { id: "card", label: "Lia Card", icon: Cpu },
];

export function SidePanel() {
  const [active, setActive] = useState<SectionId>("card");
  const lia = useLia();

  return (
    <aside className="panel flex w-full min-h-0 flex-col lg:w-96">
      <nav className="flex flex-wrap gap-1 border-b border-border p-2">
        {sections.map((s) => (
          <button
            key={s.id}
            onClick={() => setActive(s.id)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition-colors",
              active === s.id
                ? "bg-primary/20 text-glow"
                : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
            )}
          >
            <s.icon className="h-3.5 w-3.5" />
            {s.label}
          </button>
        ))}
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {!lia.cardConnected && active !== "card" && active !== "privacidade" && (
          <NoCard onGo={() => setActive("card")} />
        )}
        {(lia.cardConnected || active === "card" || active === "privacidade") && (
          <>
            {active === "memoria" && <MemorySection />}
            {active === "perfil" && <ProfileSection />}
            {active === "personalidade" && <PersonalitySection />}
            {active === "modulos" && <ModulesSection />}
            {active === "config" && <SettingsSection />}
            {active === "privacidade" && <PrivacySection />}
            {active === "card" && <LiaCardPanel />}
          </>
        )}
      </div>
    </aside>
  );
}

function Title({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div className="mb-4">
      <h2 className="font-display text-base font-semibold">{children}</h2>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function NoCard({ onGo }: { onGo: () => void }) {
  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface/60 p-4 text-sm">
      <p className="font-display font-semibold">Lia Card não conectado</p>
      <p className="text-xs text-muted-foreground">
        Memória, perfis e personalidade vivem no Lia Card. Conecte ou crie um cartão para
        personalizar a Lia.
      </p>
      <Button size="sm" onClick={onGo}>
        Ir para o Lia Card
      </Button>
    </div>
  );
}

function MemorySection() {
  const { memory, addMemory, removeMemory, profile } = useLia();
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");

  return (
    <div>
      <Title sub={`Tudo que a Lia sabe no perfil ${profile.nome}. Persistido no Lia Card.`}>
        Memória da Lia
      </Title>
      <div className="mb-4 flex gap-2">
        <Input placeholder="Assunto" value={key} onChange={(e) => setKey(e.target.value)} />
        <Input placeholder="Informação" value={value} onChange={(e) => setValue(e.target.value)} />
        <Button
          size="icon"
          onClick={() => {
            if (!key.trim() || !value.trim()) return;
            addMemory({ kind: "conhecimento", key, value, source: "usuario" });
            setKey("");
            setValue("");
          }}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <div className="space-y-2">
        {memory.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Ainda não aprendi nada por aqui. Conte algo sobre você na conversa e eu guardo.
          </p>
        )}
        {memory.map((m) => (
          <div
            key={m.id}
            className="group flex items-start justify-between gap-2 rounded-md border border-border bg-surface/60 px-3 py-2"
          >
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-widest text-primary">{m.kind}</p>
              <p className="truncate text-sm font-medium">{m.key}</p>
              <p className="text-xs text-muted-foreground">{m.value}</p>
            </div>
            <button
              onClick={() => removeMemory(m.id)}
              className="opacity-0 transition-opacity group-hover:opacity-100"
            >
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProfileSection() {
  const { profiles, profile, setActiveProfile, addProfile, user, updateUser } = useLia();
  const [nome, setNome] = useState("");

  return (
    <div className="space-y-5">
      <div>
        <Title sub="A mesma Lia, contextos diferentes. Cada perfil tem memória e personalidade próprias.">
          Perfis
        </Title>
        <div className="space-y-2">
          {profiles.map((p) => (
            <button
              key={p.id}
              onClick={() => setActiveProfile(p.id)}
              className={cn(
                "w-full rounded-md border px-3 py-2 text-left transition-colors",
                p.id === profile.id
                  ? "border-primary/60 bg-primary/10"
                  : "border-border bg-surface/60 hover:bg-surface-2",
              )}
            >
              <p className="text-sm font-medium">{p.nome}</p>
              <p className="text-xs text-muted-foreground">{p.descricao}</p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {p.memory.length} memórias · iniciativa {p.personality.iniciativa}%
              </p>
            </button>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <Input
            placeholder="Novo perfil"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
          />
          <Button
            size="icon"
            onClick={() => {
              if (!nome.trim()) return;
              addProfile(nome, "Perfil personalizado");
              setNome("");
            }}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="space-y-3 border-t border-border pt-4">
        <h3 className="font-display text-sm font-semibold">Sobre você</h3>
        <div className="space-y-1.5">
          <Label className="text-xs">Como a Lia deve te chamar</Label>
          <Input value={user.nome} onChange={(e) => updateUser({ nome: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Pronome / tratamento</Label>
          <Input value={user.pronome} onChange={(e) => updateUser({ pronome: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Notas pessoais</Label>
          <Textarea
            rows={3}
            value={user.notas}
            onChange={(e) => updateUser({ notas: e.target.value })}
          />
        </div>
      </div>
    </div>
  );
}

const traits: { key: keyof Personality; label: string; low: string; high: string }[] = [
  { key: "formalidade", label: "Formalidade", low: "informal", high: "formal" },
  { key: "humor", label: "Humor", low: "séria", high: "bem-humorada" },
  { key: "iniciativa", label: "Iniciativa", low: "reativa", high: "proativa" },
  { key: "curiosidade", label: "Curiosidade", low: "discreta", high: "curiosa" },
  { key: "explicacao", label: "Explicação", low: "objetiva", high: "detalhada" },
];

function PersonalitySection() {
  const { personality, updatePersonality } = useLia();
  return (
    <div>
      <Title sub="Como eu penso, falo e me comporto. Guardado por perfil no Lia Card.">
        Personalidade da Lia
      </Title>
      <div className="space-y-5">
        {traits.map((t) => (
          <div key={t.key}>
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="font-medium">{t.label}</span>
              <span className="text-muted-foreground">{personality[t.key] as number}%</span>
            </div>
            <Slider
              value={[personality[t.key] as number]}
              max={100}
              step={5}
              onValueChange={([v]) => updatePersonality({ [t.key]: v } as Partial<Personality>)}
            />
            <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
              <span>{t.low}</span>
              <span>{t.high}</span>
            </div>
          </div>
        ))}
        <div className="space-y-1.5">
          <Label className="text-xs">Modo de tratamento</Label>
          <Input
            value={personality.tratamento}
            onChange={(e) => updatePersonality({ tratamento: e.target.value })}
            placeholder="ex.: pelo nome, com você, formalmente"
          />
        </div>
      </div>
    </div>
  );
}

function ModulesSection() {
  const { modules, toggleModule } = useLia();
  return (
    <div>
      <Title sub="A Lia é uma plataforma. Novos módulos poderão ser instalados no futuro.">
        Módulos da Lia
      </Title>
      <div className="space-y-2">
        {modules.map((m) => (
          <div
            key={m.id}
            className={cn(
              "rounded-md border p-3",
              m.ativo ? "border-primary/40 bg-primary/5" : "border-border bg-surface/60",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{m.nome}</p>
                <p className="text-xs text-muted-foreground">{m.descricao}</p>
              </div>
              <Switch checked={m.ativo} onCheckedChange={() => toggleModule(m.id)} />
            </div>
            <div className="mt-2 flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
              <span className="rounded bg-surface-2 px-1.5 py-0.5">permissão {m.permissao}</span>
              <span className="truncate">{m.config}</span>
            </div>
          </div>
        ))}
        <div className="rounded-md border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
          Slot livre — reconhecimento facial, OCR, automação residencial, Arduino/ESP32 e modelos
          locais poderão ser adicionados aqui.
        </div>
      </div>
    </div>
  );
}

function SettingsSection() {
  const { settings, updateSettings, profile } = useLia();
  return (
    <div>
      <Title sub="Preferências do sistema para este Lia Card.">Configurações</Title>
      <div className="space-y-3">
        <Toggle
          label="Usar IA externa"
          desc="Necessário para conversação avançada."
          checked={settings.aiExterna}
          onChange={(v) => updateSettings({ aiExterna: v })}
        />
        <Toggle
          label="Permitir microfone"
          desc="Escuta local via navegador."
          checked={settings.microfone}
          onChange={(v) => updateSettings({ microfone: v })}
        />
        <Toggle
          label="Permitir câmera"
          desc="Sistema de visão da Lia."
          checked={settings.camera}
          onChange={(v) => updateSettings({ camera: v })}
        />
        <Toggle
          label="Animações"
          desc="Efeitos visuais da interface."
          checked={settings.animacoes}
          onChange={(v) => updateSettings({ animacoes: v })}
        />
        <div className="rounded-md border border-border bg-surface/60 p-3 text-xs text-muted-foreground">
          Voz do perfil {profile.nome}: velocidade {profile.voz.velocidade}x · tom{" "}
          {profile.voz.tom}
        </div>
      </div>
    </div>
  );
}

function Toggle({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border border-border bg-surface/60 p-3">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function PrivacySection() {
  const { cardConnected, modules, settings, memory } = useLia();
  const ativos = modules.filter((m) => m.ativo);
  return (
    <div>
      <Title sub="Fui projetada com filosofia de privacidade local: seus dados ficam com você.">
        Privacidade
      </Title>
      <div className="space-y-2 text-xs">
        <Row label="Memória e perfis" value={cardConnected ? "no Lia Card" : "indisponível"} />
        <Row label="Itens de memória neste perfil" value={String(memory.length)} />
        <Row label="Histórico de conversa" value={cardConnected ? "no Lia Card" : "só na sessão"} />
        <Row label="Câmera" value={settings.camera ? "permitida" : "desligada"} />
        <Row label="Microfone" value={settings.microfone ? "permitido" : "desligado"} />
        <Row label="Voz e escuta" value="processadas no navegador" />
        <Row
          label="IA externa"
          value={settings.aiExterna ? "ativa (Lovable AI)" : "desativada"}
        />
        <Row label="Módulos ativos" value={ativos.map((m) => m.nome).join(", ") || "nenhum"} />
      </div>
      <p className="mt-4 rounded-md border border-border bg-surface/60 p-3 text-xs leading-relaxed text-muted-foreground">
        Transparência: a conversação usa um modelo de linguagem hospedado externamente, então o
        texto enviado a mim sai do seu computador. Memória, personalidade, perfis e histórico ficam
        no Lia Card, sob seu controle. Criptografia do cartão e modelos locais estão previstos para
        versões futuras.
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface/60 px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{value}</span>
    </div>
  );
}
