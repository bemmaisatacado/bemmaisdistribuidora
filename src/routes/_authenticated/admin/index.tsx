import { createFileRoute, Link, type LinkProps } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  ArrowRight,
  Building2,
  CircleDollarSign,
  Factory,
  Handshake,
  Package,
  Receipt,
  RefreshCw,
  ShoppingCart,
  Store,
  Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  MetricCard,
  Panel,
  DarkPanel,
  Empty,
  QuickAction,
  Timeline,
  PageHeader,
  Btn,
} from "@/components/admin/ui";
import { ExecutiveStatuses, ExecutiveTrend } from "@/components/admin/ExecutiveCharts";
import { dateTime, num } from "@/lib/admin/format";
import { useOps } from "@/lib/admin/useOps";
import {
  dashboardDefinitions,
  dashboardMoney,
  dashboardPeriods,
  dashboardQueryState,
  dashboardRange,
  readDashboardQueue,
  readExecutiveDashboard,
  type DashboardPeriod,
  type DashboardQueueKey,
} from "@/lib/admin/dashboard";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/")({ component: Dashboard });
const queueItems: {
  key: DashboardQueueKey;
  label: string;
  hint: string;
  to: NonNullable<LinkProps["to"]>;
}[] = [
  {
    key: "orders_payment_review",
    label: "Pagamentos a conferir",
    hint: "Processamento ou inconsistência; sem aprovação manual",
    to: "/admin/pedidos",
  },
  {
    key: "orders_unassigned",
    label: "Pedidos para separar",
    hint: "Pagos e elegíveis, com itens sem grupo",
    to: "/admin/pedidos",
  },
  {
    key: "fulfillment_pending",
    label: "Grupos em separação",
    hint: "Preparação, picking ou embalagem",
    to: "/admin/pedidos",
  },
  {
    key: "logistics_pending",
    label: "Remessas a preparar",
    hint: "Baixa concluída; remessa ausente ou rascunho",
    to: "/admin/pedidos",
  },
  {
    key: "logistics_ready",
    label: "Preparadas para cotação",
    hint: "Sem contratação; provider ainda depende de integração",
    to: "/admin/pedidos",
  },
  {
    key: "orders_pending_payment",
    label: "Aguardando pagamento",
    hint: "Pedidos em pending_payment; não são pagamentos aprovados",
    to: "/admin/pedidos",
  },
  {
    key: "offers_pending",
    label: "Ofertas para revisar",
    hint: "Aguardando análise da plataforma",
    to: "/admin/ofertas",
  },
  {
    key: "stock_critical",
    label: "Posições sem disponível",
    hint: "Saldo zerado ou divergência; por owner e SKU",
    to: "/admin/estoque",
  },
];
const reasonLabels: Record<string, string> = {
  payment_review: "Conferir pagamento",
  unassigned: "Organizar separação",
  fulfillment: "Continuar preparação",
  logistics: "Preparar logística",
};

function Feedback({
  loading,
  retry,
  subject,
  dark = false,
}: {
  loading: boolean;
  retry: () => void;
  subject: string;
  dark?: boolean;
}) {
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 p-5"
      role={loading ? "status" : "alert"}
    >
      <p className={cn("text-sm", dark ? "text-ink-muted" : "text-muted-foreground")}>
        {loading
          ? `Carregando ${subject}…`
          : `Não foi possível carregar ${subject}. Nenhum saldo ou resultado foi presumido.`}
      </p>
      {!loading && <Btn onClick={retry}>Tentar novamente</Btn>}
    </div>
  );
}

function Dashboard() {
  const [days, setDays] = useState<DashboardPeriod>(30);
  const [range, setRange] = useState(() => dashboardRange(30));
  const metrics = useQuery({
    queryKey: ["admin-metrics", range.from, range.to],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_dashboard_metrics", {
        _from: range.from,
        _to: range.to,
      });
      if (error) throw error;
      const parsed = readExecutiveDashboard(data);
      if (!parsed) throw new Error("DASHBOARD_DATA_UNAVAILABLE");
      return parsed;
    },
  });
  const ops = useOps();
  const activity = useQuery({
    queryKey: ["admin-activity"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("id,occurred_at,action,entity_type")
        .order("occurred_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return data;
    },
  });
  const m = metrics.isError ? undefined : metrics.data;
  const queues = ops.isError ? null : readDashboardQueue(ops.data);
  const state = dashboardQueryState(metrics.isPending, metrics.isError, Boolean(m));
  const opsState = dashboardQueryState(ops.isPending, ops.isError, Boolean(queues));
  const refresh = () => {
    setRange(dashboardRange(days));
    void ops.refetch();
    void activity.refetch();
  };
  const value = (amount: string) => (
    <span className="whitespace-normal text-[clamp(1.25rem,2vw,2rem)] [overflow-wrap:anywhere]">
      {dashboardMoney(amount)}
    </span>
  );
  return (
    <div className="min-w-0 space-y-6">
      <PageHeader
        eyebrow="Commerce OS · visão executiva"
        title="Central BemMais"
        description="Compra, pagamento e operação: cada número com sua fonte e seu significado."
        actions={
          <Btn onClick={refresh} disabled={metrics.isFetching || ops.isFetching}>
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </Btn>
        }
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="flex flex-wrap gap-1 rounded-xl bg-surface-elevated p-1 shadow-card"
          role="group"
          aria-label="Período das métricas"
        >
          {dashboardPeriods.map((period) => (
            <button
              type="button"
              key={period}
              aria-pressed={days === period}
              onClick={() => {
                setDays(period);
                setRange(dashboardRange(period));
              }}
              className={cn(
                "min-h-10 rounded-lg px-4 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-primary motion-reduce:transition-none",
                days === period
                  ? "bg-surface-dark text-ink-foreground"
                  : "text-muted-foreground hover:bg-secondary",
              )}
            >
              {period === 365 ? "12 meses" : `${period} dias`}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {m
            ? `Consulta: ${dateTime(m.generatedAt)}`
            : "Consulta agregada · atualização por acesso"}
        </p>
      </div>
      <p className="text-xs text-muted-foreground">
        Janela: {dateTime(range.from)} até {dateTime(range.to)} · início incluído, fim excluído.
      </p>
      {state !== "ready" && (
        <Panel>
          <Feedback
            loading={state === "loading"}
            retry={() => void metrics.refetch()}
            subject="os indicadores executivos"
          />
        </Panel>
      )}
      <div
        className="grid min-w-0 gap-4 sm:grid-cols-2 2xl:grid-cols-4"
        aria-busy={metrics.isFetching}
      >
        <MetricCard
          size="lg"
          tone="brand"
          icon={ShoppingCart}
          label="Pedidos criados"
          value={m ? num(m.orders) : "—"}
          hint={dashboardDefinitions.orders}
        />
        <MetricCard
          size="lg"
          icon={CircleDollarSign}
          label="Valor dos pedidos válidos"
          value={m ? value(m.orderValue) : "—"}
          hint={dashboardDefinitions.value}
        />
        <MetricCard
          size="lg"
          icon={Receipt}
          label="Pagamentos confirmados · BRL"
          value={m ? value(m.confirmedValue) : "—"}
          hint={
            m
              ? `${num(m.confirmedOrders)} pedido(s) distintos · por data do pagamento`
              : dashboardDefinitions.payments
          }
        />
        <MetricCard
          size="lg"
          icon={Users}
          label="Ticket médio confirmado"
          value={m ? value(m.ticket) : "—"}
          hint={dashboardDefinitions.ticket}
        />
      </div>
      <p className="max-w-4xl text-xs leading-relaxed text-muted-foreground">
        {dashboardDefinitions.payments}
        {m &&
          m.otherCurrency > 0 &&
          ` ${num(m.otherCurrency)} pedido(s) em outras moedas estão fora dos valores BRL.`}
      </p>
      {m && (
        <div className="grid min-w-0 gap-4 xl:grid-cols-[1.65fr_1fr]">
          <ExecutiveTrend data={m} />
          <ExecutiveStatuses data={m} />
        </div>
      )}
      <DarkPanel className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
              Central de atenção
            </p>
            <h2 className="mt-2 font-display text-xl font-semibold sm:text-2xl">
              Sua próxima ação começa aqui.
            </h2>
            <p className="mt-2 max-w-3xl text-xs leading-relaxed text-ink-muted">
              {dashboardDefinitions.queues}
            </p>
          </div>
          <Link
            to="/admin/operacional"
            className="inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-xs font-semibold text-primary focus-visible:outline-2 focus-visible:outline-primary"
          >
            Central operacional <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        {opsState !== "ready" ? (
          <Feedback
            loading={opsState === "loading"}
            retry={() => void ops.refetch()}
            subject="as filas operacionais"
            dark
          />
        ) : (
          <div className="relative mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {queueItems.map((q) => (
              <Link
                key={q.key}
                to={q.to}
                className="min-w-0 rounded-xl bg-surface-dark-2 p-4 ring-1 ring-ink-border transition-colors hover:ring-primary/50 focus-visible:outline-2 focus-visible:outline-primary motion-reduce:transition-none"
              >
                <p
                  className={cn(
                    "metric text-3xl font-bold",
                    queues && queues[q.key] > 0 ? "text-primary" : "text-ink-foreground",
                  )}
                >
                  {queues ? num(queues[q.key]) : "—"}
                </p>
                <p className="mt-2 text-sm font-semibold text-ink-foreground">{q.label}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">{q.hint}</p>
              </Link>
            ))}
          </div>
        )}
      </DarkPanel>
      {queues && (
        <Panel
          title="Pedidos com próxima ação"
          description="Até 12 pedidos, priorizados por necessidade operacional; grupos e responsáveis aparecem no Order 360"
        >
          {!queues.samples.length ? (
            <Empty text="Nenhum pedido nas filas operacionais exibidas." />
          ) : (
            <ul className="divide-y divide-border-subtle">
              {queues.samples.map((s) => (
                <li key={s.id}>
                  <Link
                    to="/admin/pedidos/$orderId"
                    params={{ orderId: s.id }}
                    className="flex min-h-16 flex-wrap items-center justify-between gap-2 px-5 py-3 hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    <span className="font-semibold">{s.number}</span>
                    <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                      {reasonLabels[s.reason]}
                      <ArrowRight className="h-4 w-4" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Ecossistema · situação atual, independente do período
        </p>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <MetricCard
            icon={Building2}
            label="Organizações ativas"
            value={m ? num(m.organizations) : "—"}
            hint="Organizações não plataforma com status active"
          />
          <MetricCard
            icon={Users}
            label="Clientes ativos no CRM"
            value={m ? num(m.crmActive) : "—"}
            hint="Relacionamento ativo e organização ativa"
          />
          <MetricCard
            icon={Factory}
            label="Fornecedores ativos"
            value={m ? num(m.suppliers) : "—"}
            hint="Organização ativa e capacidade supply_products habilitada"
          />
          <MetricCard
            icon={Store}
            label="Lojas publicadas"
            value={m ? num(m.publishedStores) : "—"}
            hint="Status published; não inclui apenas rascunhos"
          />
          <MetricCard
            icon={Package}
            label="Produtos no catálogo"
            value={m ? num(m.products) : "—"}
            hint="Product Masters não arquivados"
          />
          <MetricCard
            icon={Package}
            label="SKUs ativos"
            value={m ? num(m.skus) : "—"}
            hint="Variantes com is_active"
          />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel
          title="Atividade recente"
          description="Auditoria real · últimos oito registros, sem payloads pessoais"
          className="lg:col-span-2"
          actions={
            <Link to="/admin/auditoria" className="text-xs font-semibold text-primary">
              Ver auditoria
            </Link>
          }
        >
          {activity.isPending || activity.isError ? (
            <Feedback
              loading={activity.isPending}
              retry={() => void activity.refetch()}
              subject="a atividade recente"
            />
          ) : !activity.data?.length ? (
            <Empty text="Nenhuma atividade registrada." />
          ) : (
            <Timeline
              items={activity.data.map((a) => ({
                id: String(a.id),
                title: (
                  <>
                    <strong className="font-semibold">{a.action}</strong> em {a.entity_type}
                  </>
                ),
                time: dateTime(a.occurred_at),
              }))}
            />
          )}
        </Panel>
        <Panel title="Acessos rápidos">
          <div className="grid gap-2 p-4">
            <Link to="/admin/pedidos">
              <QuickAction icon={ShoppingCart} label="Central de Pedidos" />
            </Link>
            <Link to="/admin/clientes">
              <QuickAction icon={Users} label="Clientes e relacionamento" />
            </Link>
            <Link to="/admin/fornecedores">
              <QuickAction icon={Handshake} label="Fornecedores" />
            </Link>
            <Link to="/admin/lojas">
              <QuickAction icon={Store} label="Lojas e publicação" />
            </Link>
          </div>
        </Panel>
      </div>
    </div>
  );
}
