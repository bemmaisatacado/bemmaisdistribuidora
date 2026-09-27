import { createFileRoute } from "@tanstack/react-router";
import { AuthForm } from "@/components/auth/AuthForm";

export const Route = createFileRoute("/criar-conta")({
  head: () => ({
    meta: [
      { title: "Criar conta — BemMais Distribuidora" },
      { name: "description", content: "Crie sua conta e acesse o ecossistema BemMais." },
      { property: "og:title", content: "Criar conta — BemMais Distribuidora" },
      { property: "og:description", content: "Crie sua conta e acesse o ecossistema BemMais." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <AuthForm mode="signup" />,
});
