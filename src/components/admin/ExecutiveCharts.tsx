import { Empty, Panel } from "./ui";
import { dashboardChartPoints, type ExecutiveDashboard } from "@/lib/admin/dashboard";
import { num } from "@/lib/admin/format";
import { orderStatusPresentation } from "@/lib/orders/foundation";

const bucketLabel = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" }).format(
    new Date(`${value}T00:00:00Z`),
  );

export function ExecutiveTrend({ data }: { data: ExecutiveDashboard }) {
  const series = data.series;
  const hasData = series.some((p) => p.orders || p.confirmations);
  const maximum = Math.max(1, ...series.flatMap((p) => [p.orders, p.confirmations]));
  return (
    <Panel
      title="Ritmo da operação"
      description={`Pedidos por criação e confirmações por pagamento · agrupamento ${data.grain === "day" ? "diário" : data.grain === "week" ? "semanal" : "mensal"} · horário de Brasília`}
    >
      {!hasData ? (
        <Empty text="Nenhum pedido ou pagamento confirmado neste período." />
      ) : (
        <div className="min-w-0 px-4 pb-5 sm:px-5">
          <div className="mb-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
            <span>
              <span className="mr-2 inline-block h-2 w-2 rounded-full bg-primary" />
              Pedidos criados
            </span>
            <span>
              <span className="mr-2 inline-block h-2 w-2 rounded-full bg-success" />
              Pedidos com pagamento confirmado
            </span>
          </div>
          <div className="flex min-w-0 gap-2">
            <div
              aria-hidden
              className="flex w-8 shrink-0 flex-col justify-between pb-5 pt-4 text-right text-[10px] text-muted-foreground"
            >
              <span>{num(maximum)}</span>
              <span>{num(Math.floor(maximum / 2))}</span>
              <span>0</span>
            </div>
            <svg
              role="img"
              aria-label="Evolução agregada dos pedidos e pagamentos; valores disponíveis na tabela abaixo"
              viewBox="0 0 600 180"
              className="h-48 min-w-0 flex-1 sm:h-56"
              preserveAspectRatio="none"
            >
              <path
                d="M20 20H580 M20 90H580 M20 160H580"
                fill="none"
                stroke="var(--border-subtle)"
                strokeDasharray="3 5"
              />
              <polyline
                points={dashboardChartPoints(series, "orders")}
                fill="none"
                stroke="var(--primary)"
                strokeWidth="3"
                vectorEffect="non-scaling-stroke"
              />
              <polyline
                points={dashboardChartPoints(series, "confirmations")}
                fill="none"
                stroke="var(--success)"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          </div>
          <div
            aria-hidden
            className="ml-10 flex justify-between gap-2 text-[10px] text-muted-foreground"
          >
            {[series[0], series[Math.floor(series.length / 2)], series[series.length - 1]].map(
              (p, index) => (
                <span key={index}>{p && bucketLabel(p.bucket)}</span>
              ),
            )}
          </div>
          <details className="mt-4 text-xs">
            <summary className="cursor-pointer rounded-md py-2 font-semibold text-primary focus-visible:outline-2 focus-visible:outline-primary">
              Consultar valores do gráfico
            </summary>
            <div className="mt-2 max-h-56 overflow-auto">
              <table className="w-full text-left">
                <caption className="sr-only">Quantidades reais por intervalo</caption>
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="p-2">Período</th>
                    <th className="p-2">Pedidos</th>
                    <th className="p-2">Confirmados</th>
                  </tr>
                </thead>
                <tbody>
                  {series.map((p) => (
                    <tr key={p.bucket} className="border-t border-border-subtle">
                      <th className="p-2 font-normal">{bucketLabel(p.bucket)}</th>
                      <td className="p-2 tabular-nums">{num(p.orders)}</td>
                      <td className="p-2 tabular-nums">{num(p.confirmations)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      )}
    </Panel>
  );
}

export function ExecutiveStatuses({ data }: { data: ExecutiveDashboard }) {
  const rows = [
    { status: "pending_payment" as const, n: data.pending, color: "bg-warning" },
    { status: "paid" as const, n: data.paid, color: "bg-success" },
    { status: "draft" as const, n: data.draft, color: "bg-info" },
    { status: "cancelled" as const, n: data.cancelled, color: "bg-danger" },
  ];
  return (
    <Panel title="Pedidos por status" description="Status atual dos pedidos criados no período">
      {!data.orders ? (
        <Empty text="Nenhum pedido registrado no período." />
      ) : (
        <div className="space-y-5 p-5 pt-3">
          {rows.map((r) => (
            <div key={r.status}>
              <div className="mb-2 flex justify-between gap-3 text-sm">
                <span>{orderStatusPresentation(r.status).label}</span>
                <strong className="tabular-nums">{num(r.n)}</strong>
              </div>
              <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-secondary">
                <div
                  className={`h-full rounded-full ${r.color}`}
                  style={{ width: `${(r.n * 100) / data.orders}%` }}
                />
              </div>
            </div>
          ))}
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Status do pedido não substitui a confirmação autoritativa de pagamento.
          </p>
        </div>
      )}
    </Panel>
  );
}
