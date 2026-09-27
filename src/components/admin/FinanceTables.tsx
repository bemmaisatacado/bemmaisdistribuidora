import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Panel, DataTable, Pager, Badge } from "./ui";
import { brl, dateTime, pageRange } from "@/lib/admin/format";

function usePaged<T>(key: string, page: number, fetcher: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown; count: number | null }>) {
  return useQuery({
    queryKey: [key, page],
    queryFn: async () => {
      const [from, to] = pageRange(page);
      const { data, error, count } = await fetcher(from, to);
      if (error) throw error;
      return { rows: data ?? [], count };
    },
  });
}

const DESC = "Registros aparecem quando o módulo de pedidos/pagamentos entrar em operação.";

export function Transactions() {
  const [page, setPage] = useState(0);
  const q = usePaged("fin-payments", page, (a, b) => supabase.from("payments").select("id,amount,status,method,provider,paid_at,created_at,organizations(name)", { count: "exact" }).order("created_at", { ascending: false }).range(a, b));
  type R = NonNullable<typeof q.data>["rows"][number];
  return (<>
    <PageHeader eyebrow="Financeiro" title="Transações" description={`Pagamentos recebidos dos compradores. ${DESC}`} />
    <Panel><DataTable<R> rowKey={(r) => r.id} rows={q.data?.rows} loading={q.isLoading} empty="Nenhum pagamento." columns={[
      { key: "d", label: "Data", render: (r) => dateTime(r.paid_at ?? r.created_at) },
      { key: "o", label: "Vendedor", render: (r) => r.organizations?.name ?? "—" },
      { key: "m", label: "Meio", render: (r) => r.method ?? "—" },
      { key: "p", label: "Provedor", render: (r) => r.provider ?? "—" },
      { key: "v", label: "Valor", render: (r) => brl(r.amount) },
      { key: "s", label: "Status", render: (r) => <Badge value={r.status} /> },
    ]} /><Pager page={page} setPage={setPage} total={q.data?.count} /></Panel>
  </>);
}

export function Allocations() {
  const [page, setPage] = useState(0);
  const q = usePaged("fin-alloc", page, (a, b) => supabase.from("payment_allocations").select("id,amount,beneficiary_role,via_provider_split,created_at,organizations(name)", { count: "exact" }).order("created_at", { ascending: false }).range(a, b));
  type R = NonNullable<typeof q.data>["rows"][number];
  return (<>
    <PageHeader eyebrow="Financeiro" title="Allocations" description="Direito econômico de cada participante em cada pagamento. Participantes são dinâmicos — não há composição fixa." />
    <Panel><DataTable<R> rowKey={(r) => r.id} rows={q.data?.rows} loading={q.isLoading} empty="Nenhuma divisão registrada." columns={[
      { key: "d", label: "Data", render: (r) => dateTime(r.created_at) },
      { key: "b", label: "Beneficiário", render: (r) => r.organizations?.name ?? "—" },
      { key: "r", label: "Papel", render: (r) => r.beneficiary_role },
      { key: "v", label: "Valor", render: (r) => brl(r.amount) },
      { key: "s", label: "Via split", render: (r) => (r.via_provider_split ? "Sim" : "Não — gera repasse") },
    ]} /><Pager page={page} setPage={setPage} total={q.data?.count} /></Panel>
  </>);
}

export function Receivables() {
  const [page, setPage] = useState(0);
  const q = usePaged("fin-recv", page, (a, b) => supabase.from("receivables").select("id,amount,status,due_at,organizations(name)", { count: "exact" }).order("due_at", { ascending: true, nullsFirst: false }).range(a, b));
  type R = NonNullable<typeof q.data>["rows"][number];
  return (<>
    <PageHeader eyebrow="Financeiro" title="Recebíveis" description={`Valores a receber por empresa. ${DESC}`} />
    <Panel><DataTable<R> rowKey={(r) => r.id} rows={q.data?.rows} loading={q.isLoading} empty="Nenhum recebível." columns={[
      { key: "o", label: "Empresa", render: (r) => r.organizations?.name },
      { key: "d", label: "Vencimento", render: (r) => dateTime(r.due_at) },
      { key: "v", label: "Valor", render: (r) => brl(r.amount) },
      { key: "s", label: "Status", render: (r) => <Badge value={r.status} /> },
    ]} /><Pager page={page} setPage={setPage} total={q.data?.count} /></Panel>
  </>);
}

export function Payouts() {
  const [page, setPage] = useState(0);
  const q = usePaged("fin-payouts", page, (a, b) => supabase.from("payouts").select("id,amount,status,method,paid_at,created_at,organizations(name)", { count: "exact" }).order("created_at", { ascending: false }).range(a, b));
  type R = NonNullable<typeof q.data>["rows"][number];
  return (<>
    <PageHeader eyebrow="Financeiro" title="Repasses" description="Liquidações efetivas. Fornecedores sem conta integrada ao gateway recebem repasse pendente (ex.: Pix manual)." />
    <Panel><DataTable<R> rowKey={(r) => r.id} rows={q.data?.rows} loading={q.isLoading} empty="Nenhum repasse." columns={[
      { key: "d", label: "Criado", render: (r) => dateTime(r.created_at) },
      { key: "o", label: "Empresa", render: (r) => r.organizations?.name },
      { key: "m", label: "Meio", render: (r) => r.method ?? "—" },
      { key: "v", label: "Valor", render: (r) => brl(r.amount) },
      { key: "s", label: "Status", render: (r) => <Badge value={r.status} /> },
      { key: "p", label: "Pago em", render: (r) => dateTime(r.paid_at) },
    ]} /><Pager page={page} setPage={setPage} total={q.data?.count} /></Panel>
  </>);
}

export function Ledger() {
  const [page, setPage] = useState(0);
  const q = usePaged("fin-ledger", page, (a, b) => supabase.from("ledger_entries").select("id,entry_type,account,direction,amount,memo,created_at,reverses_entry_id,organizations(name)", { count: "exact" }).order("created_at", { ascending: false }).range(a, b));
  type R = NonNullable<typeof q.data>["rows"][number];
  return (<>
    <PageHeader eyebrow="Financeiro" title="Livro-razão" description="Registro contábil/gerencial imutável. Estornos e chargebacks entram como lançamentos compensatórios." />
    <Panel><DataTable<R> rowKey={(r) => String(r.id)} rows={q.data?.rows} loading={q.isLoading} empty="Nenhum lançamento." columns={[
      { key: "d", label: "Data", render: (r) => dateTime(r.created_at) },
      { key: "t", label: "Tipo", render: (r) => r.entry_type },
      { key: "a", label: "Conta", render: (r) => r.account },
      { key: "o", label: "Empresa", render: (r) => r.organizations?.name ?? "Plataforma" },
      { key: "dc", label: "D/C", render: (r) => (r.direction === "debit" ? "Débito" : "Crédito") },
      { key: "v", label: "Valor", render: (r) => brl(r.amount) },
      { key: "r", label: "Estorna", render: (r) => (r.reverses_entry_id ? `#${r.reverses_entry_id}` : "—") },
    ]} /><Pager page={page} setPage={setPage} total={q.data?.count} /></Panel>
  </>);
}
