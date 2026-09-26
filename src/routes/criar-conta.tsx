import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/landing/ComingSoon";

export const Route = createFileRoute("/criar-conta")({
  head: () => ({
    meta: [
      { title: "Criar minha conta — BemMais Distribuidora" },
      { name: "description", content: "Cadastre-se e entre para o ecossistema BemMais." },
      { property: "og:title", content: "Criar minha conta — BemMais Distribuidora" },
      { property: "og:description", content: "Cadastre-se e entre para o ecossistema BemMais." },
    ],
  }),
  component: () => <ComingSoon title="Criar minha conta" text="O cadastro no ecossistema BemMais estará disponível em breve." />,
});
