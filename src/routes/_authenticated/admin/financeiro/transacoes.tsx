import { createFileRoute } from "@tanstack/react-router";
import { Transactions } from "@/components/admin/FinanceTables";

export const Route = createFileRoute("/_authenticated/admin/financeiro/transacoes")({ component: Transactions });
