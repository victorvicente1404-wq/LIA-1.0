import { createFileRoute } from "@tanstack/react-router";
import { LiaProvider } from "@/lib/lia/LiaProvider";
import { LiaWorkspace } from "@/components/lia/LiaWorkspace";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Lia — Assistente pessoal de IA portátil e privada" },
      {
        name: "description",
        content:
          "Lia é uma assistente pessoal de IA feminina, modular e portátil: memória, personalidade e perfis viajam com você no Lia Card.",
      },
      { property: "og:title", content: "Lia — Assistente pessoal de IA portátil" },
      {
        property: "og:description",
        content:
          "IA pessoal feminina com voz, visão, memória persistente e identidade portátil no Lia Card.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <LiaProvider>
      <LiaWorkspace />
    </LiaProvider>
  );
}
