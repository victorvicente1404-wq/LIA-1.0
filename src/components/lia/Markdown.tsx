import { memo, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="group relative my-2 overflow-hidden rounded-xl border border-border bg-black/60">
      <div className="flex items-center justify-between border-b border-border/70 px-3 py-1.5">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
          {lang || "código"}
        </span>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(code).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            });
          }}
          className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "copiado" : "copiar"}
        </button>
      </div>
      <pre className="overflow-x-auto px-3 py-2.5 text-[12.5px] leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}

const toText = (children: ReactNode): string =>
  Array.isArray(children) ? children.map(toText).join("") : typeof children === "string" ? children : "";

export const Markdown = memo(function Markdown({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  return (
    <div className={cn("lia-md text-sm leading-relaxed", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="my-1.5 first:mt-0 last:mb-0">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          ul: ({ children }) => <ul className="my-1.5 list-disc space-y-1 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="my-1.5 list-decimal space-y-1 pl-5">{children}</ol>,
          h1: ({ children }) => <h1 className="mt-3 mb-1.5 font-display text-base font-semibold">{children}</h1>,
          h2: ({ children }) => <h2 className="mt-3 mb-1.5 font-display text-[15px] font-semibold">{children}</h2>,
          h3: ({ children }) => <h3 className="mt-2.5 mb-1 font-display text-sm font-semibold">{children}</h3>,
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-primary underline underline-offset-2"
            >
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-2 border-l-2 border-primary/60 pl-3 text-muted-foreground">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-3 border-border" />,
          table: ({ children }) => (
            <div className="my-2 overflow-x-auto rounded-xl border border-border">
              <table className="w-full border-collapse text-[13px]">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-white/5">{children}</thead>,
          th: ({ children }) => (
            <th className="border-b border-border px-3 py-1.5 text-left font-semibold">{children}</th>
          ),
          td: ({ children }) => <td className="border-b border-border/60 px-3 py-1.5">{children}</td>,
          code: ({ className: cls, children, ...rest }) => {
            const text = toText(children);
            const isBlock = /language-/.test(cls ?? "") || text.includes("\n");
            if (!isBlock)
              return (
                <code
                  className="rounded-md border border-border bg-black/40 px-1.5 py-0.5 text-[12.5px]"
                  {...rest}
                >
                  {children}
                </code>
              );
            return <CodeBlock code={text.replace(/\n$/, "")} lang={(cls ?? "").replace("language-", "")} />;
          },
          pre: ({ children }) => <>{children}</>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
