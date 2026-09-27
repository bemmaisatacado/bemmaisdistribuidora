import { createFileRoute } from "@tanstack/react-router";
import { SimpleRefPage } from "@/components/admin/SimpleRefPage";

export const Route = createFileRoute("/_authenticated/admin/categorias")({
  component: () => <SimpleRefPage table="categories" title="Categorias" description="Árvore de categorias do catálogo mestre BemMais." />,
});
