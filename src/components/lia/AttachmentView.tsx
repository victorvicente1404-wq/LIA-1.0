import { Download, FileText, X } from "lucide-react";
import type { Attachment } from "@/lib/lia/types";

export function downloadAttachment(a: Attachment) {
  const url =
    a.dataUrl ?? URL.createObjectURL(new Blob([a.text ?? ""], { type: a.mime || "text/plain" }));
  const el = document.createElement("a");
  el.href = url;
  el.download = a.name;
  el.click();
  if (!a.dataUrl) URL.revokeObjectURL(url);
}

export function formatSize(bytes: number) {
  if (!bytes) return "";
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1048576).toFixed(1)} MB`;
}

/** Cartão de arquivo / imagem em uma mensagem, com download. */
export function AttachmentCard({ a }: { a: Attachment }) {
  const isImage = a.mime.startsWith("image/") && a.dataUrl;
  if (isImage) {
    return (
      <div className="group relative overflow-hidden rounded-xl border border-border">
        <img src={a.dataUrl} alt={a.name} className="max-h-64 w-auto object-contain" />
        <button
          type="button"
          onClick={() => downloadAttachment(a)}
          title="Baixar imagem"
          className="absolute right-2 top-2 rounded-lg border border-border bg-background/80 p-1.5 text-muted-foreground backdrop-blur transition hover:text-foreground"
        >
          <Download className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => downloadAttachment(a)}
      className="flex items-center gap-2.5 rounded-xl border border-border bg-surface/70 px-3 py-2 text-left transition hover:border-primary/60"
    >
      <FileText className="h-4 w-4 shrink-0 text-primary" />
      <span className="min-w-0">
        <span className="block truncate text-xs font-medium">{a.name}</span>
        <span className="block text-[10px] uppercase tracking-widest text-muted-foreground">
          {formatSize(a.size)} · baixar
        </span>
      </span>
      <Download className="ml-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
    </button>
  );
}

/** Prévia dos anexos antes do envio. */
export function AttachmentPreview({ a, onRemove }: { a: Attachment; onRemove: () => void }) {
  const isImage = a.mime.startsWith("image/") && a.dataUrl;
  return (
    <div className="relative flex items-center gap-2 rounded-lg border border-border bg-surface/70 px-2 py-1.5">
      {isImage ? (
        <img src={a.dataUrl} alt={a.name} className="h-9 w-9 rounded object-cover" />
      ) : (
        <FileText className="h-5 w-5 text-primary" />
      )}
      <div className="min-w-0 max-w-36">
        <p className="truncate text-[11px]">{a.name}</p>
        <p className="text-[10px] text-muted-foreground">{formatSize(a.size)}</p>
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="rounded-full p-0.5 text-muted-foreground hover:text-foreground"
        aria-label={`Remover ${a.name}`}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
