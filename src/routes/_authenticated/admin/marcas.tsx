import { createFileRoute } from "@tanstack/react-router";
import { SimpleRefPage } from "@/components/admin/SimpleRefPage";

export const Route = createFileRoute("/_authenticated/admin/marcas")({
  component: () => <SimpleRefPage table="brands" title="Marcas" description="Marcas usadas no catálogo mestre." />,
});
