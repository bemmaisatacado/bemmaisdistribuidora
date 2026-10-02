import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  Badge,
  DataTable,
  Field,
  FilterBar,
  MetricCard,
  PageHeader,
  Pager,
  Panel,
  SelectInput,
  TextInput,
} from "@/components/admin/ui";
import { dateTime, brl, PAGE_SIZE } from "@/lib/admin/format";
import { supabase } from "@/integrations/supabase/client";
import {
  orderStatusPresentation,
  readAdminOrderSummaries,
  type OrderPaymentStatus,
  type OrderStatus,
} from "@/lib/orders/foundation";

type Stats = {
  totalOrders: number;
  pendingPayment: number;
  paid: number;
  cancelled: number;
  totalAmount: string;
};
const readStats = (value: unknown): Stats => {
  if (typeof value !== "object" || value === null)
    return { totalOrders: 0, pendingPayment: 0, paid: 0, cancelled: 0, totalAmount: "0.00" };
  const item = value as Record<string, unknown>;
  return {
    totalOrders: typeof item.total_orders === "number" ? item.total_orders : 0,
    pendingPayment: typeof item.pending_payment === "number" ? item.pending_payment : 0,
    paid: typeof item.paid === "number" ? item.paid : 0,
    cancelled: typeof item.cancelled === "number" ? item.cancelled : 0,
    totalAmount: typeof item.total_amount === "string" ? item.total_amount : "0.00",
  };
};
export const Route = createFileRoute("/_authenticated/admin/pedidos")({ component: Orders });
function Orders() {
  const [query, setQuery] = useState("");
  const [orderStatus, setOrderStatus] = useState<"" | OrderStatus>("");
  const [paymentStatus, setPaymentStatus] = useState<"" | OrderPaymentStatus>("");
  const [period, setPeriod] = useState("");
  const [page, setPage] = useState(0);
  const filters = {
    _query: query || null,
    _order_status: orderStatus || null,
    _payment_status: paymentStatus || null,
    _store_id: null,
    _from: period ? `${period}T00:00:00.000Z` : null,
    _to: null,
  };
  const list = useQuery({
    queryKey: ["admin-orders", filters, page],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_order_list", {
        ...filters,
        _offset: page * PAGE_SIZE,
        _limit: PAGE_SIZE,
      });
      if (error) throw error;
      return readAdminOrderSummaries(data);
    },
  });
  const stats = useQuery({
    queryKey: ["admin-order-stats", filters],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_order_stats", filters);
      if (error) throw error;
      return readStats(data);
    },
  });
  const active =
    Number(Boolean(query)) +
    Number(Boolean(orderStatus)) +
    Number(Boolean(paymentStatus)) +
    Number(Boolean(period));
  const reset = () => {
    setQuery("");
    setOrderStatus("");
    setPaymentStatus("");
    setPeriod("");
    setPage(0);
  };
  return (
    <main className="space-y-5">
      <PageHeader
        eyebrow="Operação"
        title="Pedidos"
        description="Leitura operacional de pedidos, valores históricos e status. Esta Central não altera pedidos."
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Pedidos" value={stats.data?.totalOrders ?? "—"} />
        <MetricCard label="Aguardando pagamento" value={stats.data?.pendingPayment ?? "—"} />
        <MetricCard label="Pagos" value={stats.data?.paid ?? "—"} />
        <MetricCard label="Cancelados" value={stats.data?.cancelled ?? "—"} />
        <MetricCard
          label="Valor dos pedidos"
          value={stats.data ? brl(stats.data.totalAmount) : "—"}
        />
      </div>
      <Panel
        title="Central de Pedidos"
        description="Busca, filtros e paginação são processados no banco."
      >
        <FilterBar active={active} onClear={reset}>
          <Field label="Buscar">
            <TextInput
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(0);
              }}
              placeholder="Número, comprador, e-mail ou loja"
            />
          </Field>
          <Field label="Pedido">
            <SelectInput
              value={orderStatus}
              onChange={(event) => {
                setOrderStatus(event.target.value as "" | OrderStatus);
                setPage(0);
              }}
            >
              <option value="">Todos</option>
              <option value="draft">Rascunho</option>
              <option value="pending_payment">Aguardando pagamento</option>
              <option value="paid">Pago</option>
              <option value="cancelled">Cancelado</option>
            </SelectInput>
          </Field>
          <Field label="Pagamento">
            <SelectInput
              value={paymentStatus}
              onChange={(event) => {
                setPaymentStatus(event.target.value as "" | OrderPaymentStatus);
                setPage(0);
              }}
            >
              <option value="">Todos</option>
              <option value="pending">Pendente</option>
              <option value="authorized">Autorizado</option>
              <option value="paid">Pago</option>
              <option value="failed">Falhou</option>
              <option value="refunded">Estornado</option>
              <option value="cancelled">Cancelado</option>
            </SelectInput>
          </Field>
          <Field label="A partir de">
            <TextInput
              type="date"
              value={period}
              onChange={(event) => {
                setPeriod(event.target.value);
                setPage(0);
              }}
            />
          </Field>
        </FilterBar>
        {list.isError ? (
          <p className="p-5 text-sm text-danger">
            A Central de Pedidos ainda não está disponível neste ambiente. Verifique as migrations
            locais.
          </p>
        ) : (
          <>
            <DataTable
              rowKey={(order) => order.id}
              rows={list.data}
              loading={list.isLoading}
              empty="Nenhum pedido corresponde aos filtros selecionados."
              columns={[
                {
                  key: "number",
                  label: "Pedido",
                  render: (order) => (
                    <Link
                      className="font-semibold text-primary hover:underline"
                      to="/admin/pedidos/$orderId"
                      params={{ orderId: order.id }}
                    >
                      {order.orderNumber}
                    </Link>
                  ),
                },
                { key: "buyer", label: "Comprador", render: (order) => order.buyerName ?? "—" },
                { key: "store", label: "Loja", render: (order) => order.storeName ?? "—" },
                { key: "items", label: "Itens", render: (order) => order.itemCount },
                { key: "total", label: "Total", render: (order) => brl(order.totalAmount) },
                {
                  key: "order",
                  label: "Pedido",
                  render: (order) => (
                    <Badge
                      value={order.status}
                      label={orderStatusPresentation(order.status).label}
                    />
                  ),
                },
                {
                  key: "payment",
                  label: "Pagamento",
                  render: (order) => (
                    <Badge
                      value={order.paymentStatus}
                      label={orderStatusPresentation(order.paymentStatus).label}
                    />
                  ),
                },
                {
                  key: "fulfillment",
                  label: "Fulfillment",
                  render: (order) => (
                    <Badge
                      value={order.fulfillmentStatus}
                      label={orderStatusPresentation(order.fulfillmentStatus).label}
                    />
                  ),
                },
                { key: "date", label: "Criado", render: (order) => dateTime(order.createdAt) },
              ]}
            />
            <Pager page={page} setPage={setPage} total={list.data?.[0]?.totalCount ?? 0} />
          </>
        )}
      </Panel>
    </main>
  );
}
