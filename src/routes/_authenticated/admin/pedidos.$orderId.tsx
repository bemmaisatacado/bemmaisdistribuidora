import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Badge, DataTable, EntityHeader, Panel } from "@/components/admin/ui";
import { brl, dateTime, MODALITY_LABEL } from "@/lib/admin/format";
import { supabase } from "@/integrations/supabase/client";
import { orderStatusPresentation } from "@/lib/orders/foundation";
import { fulfillmentSummary, orderParticipants, readOrder360 } from "@/lib/orders/order-360";
import {
  cancelOrder,
  cancellationErrorMessage,
  readCancellationContext,
  validCancellationReason,
  type OrderCancellationRpc,
} from "@/lib/orders/cancellation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FulfillmentPanel } from "@/components/admin/orders/fulfillment-panel";
import { LogisticsPanel } from "@/components/admin/orders/logistics-panel";
import { fulfillmentReservationLabels } from "@/lib/orders/fulfillment";
import { useOrderFulfillments } from "@/lib/orders/fulfillment-query";

const orderRpc = supabase as unknown as OrderCancellationRpc;

const reservationLabel = {
  reserved: "Reservado",
  released: "Liberado",
  not_controlled: "Não controlado",
} as const;

export const Route = createFileRoute("/_authenticated/admin/pedidos/$orderId")({
  component: Order360,
});
function Address({ address }: { address: Record<string, string> | null }) {
  return address ? (
    <dl className="grid gap-1 text-sm">
      {Object.entries(address).map(([key, value]) => (
        <div key={key} className="flex gap-2">
          <dt className="capitalize text-muted-foreground">{key.replaceAll("_", " ")}:</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  ) : (
    <p className="text-sm text-muted-foreground">Endereço não informado no pedido.</p>
  );
}
function Order360() {
  const { orderId } = Route.useParams();
  const cache = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const operational = useOrderFulfillments(orderRpc, orderId);
  const cancellation = useQuery({
    queryKey: ["admin-order-cancellation", orderId],
    queryFn: async () => {
      const { data, error } = await orderRpc.rpc("admin_order_cancellation_context", {
        _order_id: orderId,
      });
      if (error) throw error;
      return readCancellationContext(data);
    },
  });
  const performCancellation = async () => {
    if (!query.data || cancelling) return;
    setCancelling(true);
    setNotice(null);
    try {
      await cancelOrder(orderRpc, orderId, query.data.status, reason);
      setConfirming(false);
      setReason("");
      setNotice("Pedido cancelado. Reservas controladas liberadas na mesma operação.");
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["admin-order-360", orderId] }),
        cache.invalidateQueries({ queryKey: ["admin-order-cancellation", orderId] }),
        cache.invalidateQueries({ queryKey: ["admin-orders"] }),
        cache.invalidateQueries({ queryKey: ["admin-order-stats"] }),
      ]);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : cancellationErrorMessage("UNKNOWN"));
      await Promise.all([query.refetch(), cancellation.refetch()]);
    } finally {
      setCancelling(false);
    }
  };
  const query = useQuery({
    queryKey: ["admin-order-360", orderId],
    queryFn: async () => {
      const { data, error } = await orderRpc.rpc("admin_order_360", { _order_id: orderId });
      if (error) throw error;
      return readOrder360(data);
    },
  });
  const order = query.data;
  if (query.isLoading) return <main className="p-8">Carregando pedido…</main>;
  if (!order || query.isError)
    return <main className="p-8">Pedido não encontrado ou indisponível.</main>;
  const participants = orderParticipants(order.items);
  const fulfillment = fulfillmentSummary(order.items);
  return (
    <main className="space-y-5">
      <EntityHeader
        name={order.number}
        status={orderStatusPresentation(order.status).label}
        meta={
          <>
            <span>{dateTime(order.createdAt)}</span>
            <span>{order.buyerName ?? "Comprador não informado"}</span>
            <span>{brl(order.total)}</span>
            <Badge
              value={order.paymentStatus}
              label={orderStatusPresentation(order.paymentStatus).label}
            />
            <Badge value={fulfillment} label={orderStatusPresentation(fulfillment).label} />
          </>
        }
        actions={
          <>
            {cancellation.data?.canCancel && (
              <Button
                variant="destructive"
                onClick={() => {
                  setNotice(null);
                  setConfirming(true);
                }}
              >
                Cancelar pedido
              </Button>
            )}
            <Link to="/admin/pedidos" className="text-sm font-semibold text-primary">
              Voltar aos pedidos
            </Link>
          </>
        }
      />
      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
      {cancellation.isError && (
        <p className="text-sm text-muted-foreground">
          Ação de cancelamento indisponível. Verifique a ativação da RPC.
        </p>
      )}
      {cancellation.data?.block && order.status !== "cancelled" && (
        <p className="text-sm text-warning">{cancellationErrorMessage(cancellation.data.block)}</p>
      )}
      {cancellation.data?.cancelledAt && (
        <Panel title="Cancelamento registrado">
          <p className="p-5 text-sm">
            {dateTime(cancellation.data.cancelledAt)} · {cancellation.data.reason}
          </p>
        </Panel>
      )}
      <Dialog
        open={confirming}
        onOpenChange={(open) => {
          if (!cancelling) setConfirming(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar {order.number}?</DialogTitle>
            <DialogDescription>
              Esta ação preserva o pedido histórico e libera as reservas controladas. Não realiza
              estorno financeiro.
            </DialogDescription>
          </DialogHeader>
          <label htmlFor="cancel-reason" className="text-sm font-semibold">
            Motivo obrigatório
          </label>
          <Textarea
            id="cancel-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={1000}
            disabled={cancelling}
          />
          {notice && (
            <p role="alert" className="text-sm text-danger">
              {notice}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={cancelling} onClick={() => setConfirming(false)}>
              Voltar
            </Button>
            <Button
              variant="destructive"
              disabled={cancelling || !validCancellationReason(reason)}
              onClick={() => void performCancellation()}
            >
              {cancelling ? "Cancelando…" : "Confirmar cancelamento"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <div className="grid gap-5 lg:grid-cols-3">
        <Panel title="Resumo">
          <dl className="grid gap-2 text-sm">
            <div>
              <dt className="text-muted-foreground">Comprador</dt>
              <dd>
                {order.buyerName ?? "—"}
                {order.buyerEmail ? ` · ${order.buyerEmail}` : ""}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Origem</dt>
              <dd>{order.storeName ?? order.organizationName ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Atualizado</dt>
              <dd>{dateTime(order.updatedAt)}</dd>
            </div>
          </dl>
        </Panel>
        <Panel title="Valores">
          <dl className="grid gap-2 text-sm">
            <div>
              Subtotal <b className="float-right">{brl(order.subtotal)}</b>
            </div>
            <div>
              Desconto <b className="float-right">{brl(order.discount)}</b>
            </div>
            <div>
              Frete <b className="float-right">{brl(order.shipping)}</b>
            </div>
            <div className="border-t pt-2">
              Total <b className="float-right">{brl(order.total)}</b>
            </div>
          </dl>
        </Panel>
        <Panel title="Endereço de entrega">
          <Address address={order.address} />
        </Panel>
      </div>
      <FulfillmentPanel client={orderRpc} orderId={orderId} />
      <LogisticsPanel client={orderRpc} orderId={orderId} />
      <Panel title="Itens" description="Snapshots históricos preservados no momento da compra.">
        <DataTable
          rowKey={(item) => item.id}
          rows={order.items}
          empty="Este pedido ainda não possui itens."
          columns={[
            {
              key: "item",
              label: "Item",
              render: (item) => (
                <div className="flex items-center gap-3">
                  {item.imagePath ? (
                    <img
                      className="h-10 w-10 rounded-lg object-cover"
                      src={item.imagePath}
                      alt=""
                    />
                  ) : (
                    <span className="grid h-10 w-10 place-items-center rounded-lg bg-secondary text-xs text-muted-foreground">
                      Sem imagem
                    </span>
                  )}
                  <div>
                    <b>{item.productName}</b>
                    <p className="text-xs text-muted-foreground">{item.sku}</p>
                  </div>
                </div>
              ),
            },
            {
              key: "attributes",
              label: "Atributos",
              render: (item) =>
                Object.entries(item.attributes)
                  .map(([key, value]) => `${key}: ${value}`)
                  .join(" · ") || "—",
            },
            { key: "quantity", label: "Qtd.", render: (item) => item.quantity },
            { key: "unit", label: "Unitário", render: (item) => brl(item.unitPrice) },
            { key: "subtotal", label: "Subtotal", render: (item) => brl(item.subtotal) },
            {
              key: "modality",
              label: "Modalidade",
              render: (item) =>
                item.modality ? (MODALITY_LABEL[item.modality] ?? item.modality) : "—",
            },
            {
              key: "stock",
              label: "Estoque",
              render: (item) => {
                const position = operational.data?.groups
                  .flatMap((group) => group.items)
                  .find((row) => row.id === item.id);
                if (position) return fulfillmentReservationLabels[position.reservation];
                // A consumption includes a release entry: never mislabel it as a cancellation release while loading.
                if (item.fulfillmentStatus === "pending" && !operational.data)
                  return "Consulte Fulfillment";
                return reservationLabel[item.stockReservationStatus];
              },
            },
            {
              key: "fulfillment",
              label: "Fulfillment",
              render: (item) => (
                <Badge
                  value={item.fulfillmentStatus}
                  label={orderStatusPresentation(item.fulfillmentStatus).label}
                />
              ),
            },
          ]}
        />
      </Panel>
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel
          title="Participantes"
          description="Contexto por fornecedor, owner de estoque ou fulfillment."
        >
          {participants.size ? (
            <div className="divide-y">
              {[...participants].map(([name, items]) => (
                <div key={name} className="py-3 text-sm">
                  <b>{name}</b>
                  <p className="mt-1 text-muted-foreground">
                    {items.length} item(ns) · {items.map((item) => item.sku).join(", ")}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="p-5 text-sm text-muted-foreground">Nenhum participante informado.</p>
          )}
        </Panel>
        <Panel title="Pagamento">
          {order.payments.length ? (
            <DataTable
              rowKey={(payment) => payment.id}
              rows={order.payments}
              columns={[
                {
                  key: "status",
                  label: "Status",
                  render: (payment) => (
                    <Badge
                      value={payment.status}
                      label={orderStatusPresentation(payment.status).label}
                    />
                  ),
                },
                { key: "method", label: "Método", render: (payment) => payment.method ?? "—" },
                {
                  key: "provider",
                  label: "Provider",
                  render: (payment) => payment.provider ?? "—",
                },
                { key: "amount", label: "Valor", render: (payment) => brl(payment.amount) },
                {
                  key: "date",
                  label: "Data",
                  render: (payment) =>
                    dateTime(payment.paidAt ?? payment.updatedAt ?? payment.createdAt),
                },
                {
                  key: "failure",
                  label: "Retorno",
                  render: (payment) => payment.failureMessage ?? "—",
                },
              ]}
            />
          ) : (
            <p className="p-5 text-sm text-muted-foreground">Pagamento ainda não registrado.</p>
          )}
        </Panel>
      </div>
      <Panel title="Atividade">
        {order.activity.length ? (
          <div className="divide-y">
            {order.activity.map((event) => (
              <div key={event.id} className="flex justify-between gap-4 py-3 text-sm">
                <span>
                  <b>{event.action}</b> em {event.entityType}
                  {event.actorName ? ` · ${event.actorName}` : ""}
                </span>
                <span className="text-muted-foreground">{dateTime(event.occurredAt)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="p-5 text-sm text-muted-foreground">
            Nenhuma atividade adicional registrada.
          </p>
        )}
      </Panel>
    </main>
  );
}
