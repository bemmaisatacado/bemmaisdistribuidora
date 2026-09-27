import { createFileRoute } from "@tanstack/react-router";
import { AuthForm } from "@/components/auth/AuthForm";

export const Route = createFileRoute("/entrar")({
  head: () => ({
    meta: [
      { title: "Entrar — BemMais Distribuidora" },
      { name: "description", content: "Acesse sua conta no ecossistema BemMais." },
      { property: "og:title", content: "Entrar — BemMais Distribuidora" },
      { property: "og:description", content: "Acesse sua conta no ecossistema BemMais." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <AuthForm mode="signin" />,
});
