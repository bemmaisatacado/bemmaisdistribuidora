import { createFileRoute } from "@tanstack/react-router";
import { OpportunityLanding } from "@/components/opportunity/OpportunityLanding";

const TITLE = "BemMais | Venda mais com a gente";
const DESCRIPTION =
  "Conheça a BemMais e escolha a comunidade certa para comprar, revender e crescer no mercado.";

export const Route = createFileRoute("/oportunidade")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OpportunityLanding,
});
