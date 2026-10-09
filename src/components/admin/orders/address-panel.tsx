import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Panel } from "@/components/admin/ui";
import { DeliveryAddressForm } from "@/components/delivery-address-form";
import {
  deliveryAddressComplete,
  emptyDeliveryAddress,
  normalizeDeliveryAddress,
  type DeliveryAddress,
} from "@/lib/orders/address";
import type { OrderCancellationRpc } from "@/lib/orders/cancellation";
type Context = {
  method: string;
  original: DeliveryAddress | null;
  effective: DeliveryAddress | null;
  revision: number;
  correctable: boolean;
  history: { revision: number; reason: string; at: string }[];
};
export function OrderAddressPanel({
  client,
  orderId,
}: {
  client: OrderCancellationRpc;
  orderId: string;
}) {
  const cache = useQueryClient();
  const [address, setAddress] = useState<DeliveryAddress>(emptyDeliveryAddress);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const query = useQuery({
    queryKey: ["admin-order-address", orderId],
    queryFn: async () => {
      const { data, error } = await client.rpc("admin_order_address", { _order_id: orderId });
      if (error) throw new Error("Endereço indisponível ou sem permissão.");
      return data as Context | null;
    },
  });
  const context = query.data;
  const save = async () => {
    if (!context || busy) return;
    if (!deliveryAddressComplete(address)) {
      setNotice("Revise o endereço completo, CEP e UF.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await client.rpc("correct_legacy_order_address", {
        _order_id: orderId,
        _expected_revision: context.revision,
        _address: normalizeDeliveryAddress(address),
        _reason: "legacy_incomplete",
      });
      if (error) {
        setNotice("Não foi possível salvar. Atualize o pedido e confira sua permissão.");
        return;
      }
      setNotice("Correção registrada separadamente. Snapshot original preservado.");
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["admin-order-address", orderId] }),
        cache.invalidateQueries({ queryKey: ["admin-order-logistics", orderId] }),
      ]);
    } catch {
      setNotice("Não foi possível salvar agora. Seu formulário foi preservado.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel title="Endereço histórico e pendências logísticas">
      {query.isPending ? (
        <p>Carregando…</p>
      ) : query.isError ? (
        <p role="alert">Endereço indisponível ou sem permissão.</p>
      ) : context ? (
        <div className="space-y-4 p-4">
          <p>
            {context.method === "pickup"
              ? "Retirada: endereço de entrega não exigido."
              : deliveryAddressComplete(context.effective)
                ? "Destino completo para preparação logística."
                : "Destino incompleto: cotação e etiqueta bloqueadas."}
          </p>
          {context.revision > 0 && (
            <div>
              <h3 className="font-semibold">Correção operacional (não substitui o histórico)</h3>
              <p>{Object.values(context.effective ?? {}).join(" · ")}</p>
              {context.history.map((item) => (
                <p key={item.revision} className="text-sm">
                  Revisão {item.revision} · {new Date(item.at).toLocaleString("pt-BR")} ·{" "}
                  {item.reason}
                </p>
              ))}
            </div>
          )}
          {context.correctable && (
            <div className="space-y-3">
              <p className="text-sm">
                Informe somente endereço confirmado pelo comprador. Registro separado e auditável;
                não consulte automaticamente o cadastro atual.
              </p>
              <DeliveryAddressForm value={address} onChange={setAddress} />
              <button
                type="button"
                disabled={busy}
                onClick={() => void save()}
                className="rounded-lg bg-primary px-4 py-3 font-semibold text-primary-foreground disabled:opacity-50"
              >
                {busy ? "Registrando…" : "Confirmar correção do endereço legado"}
              </button>
            </div>
          )}
        </div>
      ) : (
        <p>Pedido não encontrado.</p>
      )}
      {notice && (
        <p role="status" className="p-4 text-sm">
          {notice}
        </p>
      )}
    </Panel>
  );
}
