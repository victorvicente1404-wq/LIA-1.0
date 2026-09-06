import { MessageSquare, PanelLeftClose, PanelLeftOpen, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLia } from "@/lib/lia/LiaProvider";
import { cn } from "@/lib/utils";

/** Barra retrátil com as conversas salvas neste navegador. */
export function ConversationsSidebar({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  const { conversations, activeConversationId, newConversation, selectConversation, deleteConversation } =
    useLia();

  if (!open) {
    return (
      <div className="hidden shrink-0 flex-col items-center gap-2 border-r border-border px-1.5 py-3 lg:flex">
        <Button size="icon" variant="ghost" onClick={onToggle} title="Abrir conversas">
          <PanelLeftOpen className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" onClick={newConversation} title="Nova conversa">
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <aside className="panel flex w-full shrink-0 flex-col lg:w-60">
      <header className="flex items-center justify-between border-b border-border px-2 py-2">
        <Button size="sm" variant="secondary" onClick={newConversation} className="flex-1 justify-start">
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Nova conversa
        </Button>
        <Button size="icon" variant="ghost" onClick={onToggle} title="Recolher">
          <PanelLeftClose className="h-4 w-4" />
        </Button>
      </header>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
        {conversations.map((c) => (
          <div
            key={c.id}
            className={cn(
              "group flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition",
              c.id === activeConversationId
                ? "bg-primary/15 text-foreground"
                : "text-muted-foreground hover:bg-white/5",
            )}
          >
            <button
              type="button"
              onClick={() => selectConversation(c.id)}
              className="flex min-w-0 flex-1 items-center gap-2 text-left"
            >
              <MessageSquare className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{c.title}</span>
            </button>
            <button
              type="button"
              onClick={() => deleteConversation(c.id)}
              title="Apagar conversa"
              className="opacity-0 transition group-hover:opacity-100"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
}
