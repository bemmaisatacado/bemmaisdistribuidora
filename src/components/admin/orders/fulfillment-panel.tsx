import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Panel, Badge } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { dateTime } from "@/lib/admin/format";
import type { OrderCancellationRpc } from "@/lib/orders/cancellation";
import {
  fulfillmentLabels,
  fulfillmentActionLabels,
  fulfillmentError,
  nextFulfillmentState,
  operateFulfillment,
  fulfillmentReservationLabels,
  type FulfillmentGroup,
} from "@/lib/orders/fulfillment";
import { useOrderFulfillments } from "@/lib/orders/fulfillment-query";

export function FulfillmentPanel({
  client,
  orderId,
}: {
  client: OrderCancellationRpc;
  orderId: string;
}) {
  const query = useOrderFulfillments(client, orderId);
  const cache = useQueryClient();
  const [confirmation, setConfirmation] = useState<FulfillmentGroup | "start" | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const execute = async () => {
    if (!confirmation || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      if (confirmation === "start") await operateFulfillment(client, { orderId });
      else {
        const targetStatus = nextFulfillmentState(confirmation.status);
        if (!targetStatus) return;
        await operateFulfillment(client, {
          fulfillmentId: confirmation.id,
          expectedStatus: confirmation.status,
          targetStatus,
        });
      }
      setConfirmation(null);
      setNotice("Operação confirmada. Histórico e estoque atualizados.");
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["admin-order-fulfillments", orderId] }),
        cache.invalidateQueries({ queryKey: ["admin-order-360", orderId] }),
        cache.invalidateQueries({ queryKey: ["admin-order-cancellation", orderId] }),
        cache.invalidateQueries({ queryKey: ["admin-orders"] }),
        cache.invalidateQueries({ queryKey: ["admin-order-stats"] }),
      ]);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : fulfillmentError("UNKNOWN"));
      await query.refetch();
    } finally {
      setBusy(false);
    }
  };
  const physical =
    confirmation !== null && confirmation !== "start" && confirmation.status === "packed";
  return (
    <Panel
      title="Fulfillment operacional"
      description="Separação e baixa física por responsável. Sem transportadora, envio ou entrega registrados."
    >
      {query.isLoading ? (
        <p className="p-5 text-sm">Carregando operação…</p>
      ) : query.isError ? (
        <p className="p-5 text-sm text-muted-foreground">
          Fulfillment indisponível. Verifique a ativação da migration.
        </p>
      ) : (
        <>
          {query.data?.block && (
            <p className="py-3 text-sm text-warning">{fulfillmentError(query.data.block)}</p>
          )}
          {query.data?.canStart && (
            <Button
              disabled={busy}
              onClick={() => {
                setNotice(null);
                setConfirmation("start");
              }}
            >
              Preparar grupos de separação
            </Button>
          )}
          {!query.data?.groups.length && (
            <p className="py-3 text-sm text-muted-foreground">
              Nenhum fulfillment iniciado. Pedidos pendentes não geram execução física.
            </p>
          )}
          <div className="divide-y">
            {query.data?.groups.map((group) => (
              <section key={group.id} className="space-y-3 py-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">{group.owner}</h3>
                    <Badge value={group.status} label={fulfillmentLabels[group.status]} />
                  </div>
                  {!query.data?.block && fulfillmentActionLabels[group.status] && (
                    <Button
                      disabled={busy}
                      onClick={() => {
                        setNotice(null);
                        setConfirmation(group);
                      }}
                    >
                      {fulfillmentActionLabels[group.status]}
                    </Button>
                  )}
                </div>
                <dl className="grid gap-2 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-muted-foreground">Stock owner</dt>
                    <dd>{group.stockOwner ?? "Não informado"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Fornecedor</dt>
                    <dd>{group.supplier ?? "Não informado"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Seller</dt>
                    <dd>{group.seller ?? "Não informado"}</dd>
                  </div>
                </dl>
                <ul className="space-y-2">
                  {group.items.map((item) => (
                    <li key={item.id} className="flex flex-wrap justify-between gap-2 text-sm">
                      <span>
                        {item.quantity} × {item.name} · {item.sku}
                      </span>
                      <span className="text-muted-foreground">
                        {fulfillmentReservationLabels[item.reservation]}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">
                  Atualizado: {dateTime(group.updatedAt)}
                  {group.consumedAt ? ` · Baixa física: ${dateTime(group.consumedAt)}` : ""}
                </p>
              </section>
            ))}
          </div>
          <div className="divide-y">
            {query.data?.activity.map((event) => (
              <p key={event.id} className="py-2 text-xs text-muted-foreground">
                {event.action} · {dateTime(event.at)}
                {event.actor ? ` · Ator: ${event.actor}` : ""}
              </p>
            ))}
          </div>
        </>
      )}
      {notice && (
        <p role="status" className="py-3 text-sm">
          {notice}
        </p>
      )}
      <Dialog
        open={confirmation !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setConfirmation(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {physical ? "Confirmar baixa física?" : "Confirmar operação?"}
            </DialogTitle>
            <DialogDescription>
              {physical
                ? "Confirme somente após a retirada física de todos os itens deste grupo. As reservas controladas serão consumidas integralmente, reduzindo on_hand e reserved na mesma transação. Esta ação não registra envio ou entrega e não pode ser desfeita por cancelamento."
                : "A operação será registrada com seu usuário e data. Iniciar ou confirmar a separação não baixa estoque."}
            </DialogDescription>
          </DialogHeader>
          {notice && (
            <p role="alert" className="text-sm text-danger">
              {notice}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={busy} onClick={() => setConfirmation(null)}>
              Voltar
            </Button>
            <Button disabled={busy} onClick={() => void execute()}>
              {busy ? "Confirmando…" : physical ? "Confirmar baixa integral" : "Confirmar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}
