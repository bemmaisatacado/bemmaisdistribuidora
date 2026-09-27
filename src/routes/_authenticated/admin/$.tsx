import { createFileRoute } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { ADMIN_NAV } from "@/components/admin/nav";

export const Route = createFileRoute("/_authenticated/admin/$")({ component: Soon });

function Soon() {
  const { _splat } = Route.useParams();
  const item = ADMIN_NAV.flatMap((s) => s.items).find((i) => "soon" in i && i.soon === _splat);
  return (
    <div className="admin-card admin-in mx-auto max-w-xl px-6 py-16 text-center">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-surface-dark text-primary shadow-float"><Lock className="h-6 w-6" /></span>
      <h1 className="mt-4 font-display text-xl font-bold">{item?.label ?? "Módulo"} — próxima fase</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Este módulo faz parte da arquitetura da plataforma e será construído em uma fase futura. Nenhum dado é exibido aqui até lá.
      </p>
    </div>
  );
}
