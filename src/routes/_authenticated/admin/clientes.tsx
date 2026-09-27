import { createFileRoute } from "@tanstack/react-router";
import { OrgsPage } from "@/components/admin/OrgsPage";

export const Route = createFileRoute("/_authenticated/admin/clientes")({ component: () => <OrgsPage kind="clients" /> });
