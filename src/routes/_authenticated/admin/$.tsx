import { createFileRoute } from "@tanstack/react-router";
import { Clock } from "lucide-react";
import { ADMIN_NAV } from "@/components/admin/nav";

export const Route = createFileRoute("/_authenticated/admin/$")({ component: Soon });

function Soon() {
  const { _splat } = Route.useParams();
  const item = ADMIN_NAV.flatMap((s) => s.items).find((i) => "soon" in i && i.soon === _splat);
  return (
    <div className="mx-auto max-w-xl rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center">
      <Clock className="mx-auto h-8 w-8 text-primary" />
      <h1 className="mt-4 font-display text-xl font-bold">{item?.label ?? "Módulo"} — próxima fase</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Este módulo faz parte da arquitetura da plataforma e será construído em uma fase futura. Nenhum dado é exibido aqui até lá.
      </p>
    </div>
  );
}
