import { createFileRoute } from "@tanstack/react-router";
import { Ledger } from "@/components/admin/FinanceTables";

export const Route = createFileRoute("/_authenticated/admin/financeiro/ledger")({ component: Ledger });
