import { createFileRoute } from "@tanstack/react-router";
import { Receivables } from "@/components/admin/FinanceTables";

export const Route = createFileRoute("/_authenticated/admin/financeiro/recebiveis")({ component: Receivables });
