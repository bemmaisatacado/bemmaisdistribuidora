import { createFileRoute } from "@tanstack/react-router";
import { Allocations } from "@/components/admin/FinanceTables";

export const Route = createFileRoute("/_authenticated/admin/financeiro/allocations")({ component: Allocations });
