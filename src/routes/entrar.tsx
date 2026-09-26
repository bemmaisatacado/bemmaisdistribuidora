import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/landing/ComingSoon";

export const Route = createFileRoute("/entrar")({
  head: () => ({
    meta: [
      { title: "Entrar — BemMais Distribuidora" },
      { name: "description", content: "Acesse sua conta no ecossistema BemMais." },
      { property: "og:title", content: "Entrar — BemMais Distribuidora" },
      { property: "og:description", content: "Acesse sua conta no ecossistema BemMais." },
    ],
  }),
  component: () => <ComingSoon title="Entrar" text="O acesso à sua conta BemMais estará disponível em breve." />,
});
