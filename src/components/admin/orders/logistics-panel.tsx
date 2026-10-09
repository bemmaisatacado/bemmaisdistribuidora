import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Panel, Badge } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  prepareShipment,
  configureShipment,
  readLogistics,
  logisticsMessage,
  shipmentLabels,
  shippingAddressFields,
  addressLabels,
  type ShippingAddress,
  type Shipment,
  type PackageIntent,
} from "@/lib/orders/logistics";

function Address({ value }: { value: ShippingAddress | null }) {
  return value ? (
    <dl className="space-y-1 text-sm">
      {shippingAddressFields
        .filter((key) => value[key])
        .map((key) => (
          <div key={key}>
            <dt className="inline text-muted-foreground">{addressLabels[key]}: </dt>
            <dd className="inline">{value[key]}</dd>
          </div>
        ))}
    </dl>
  ) : (
    <p className="text-sm text-muted-foreground">Não informado.</p>
  );
}
export function LogisticsPanel({
  client,
  orderId,
}: {
  client: OrderCancellationRpc;
  orderId: string;
}) {
  const cache = useQueryClient();
  const query = useQuery({
    queryKey: ["admin-order-logistics", orderId],
    queryFn: async () => {
      const { data, error } = await client.rpc("admin_order_logistics", { _order_id: orderId });
      if (error) throw new Error("LOGISTICS_UNAVAILABLE");
      const decoded = readLogistics(data);
      if (!decoded) throw new Error("LOGISTICS_UNAVAILABLE");
      return decoded;
    },
  });
  const [editing, setEditing] = useState<Shipment | null>(null);
  const [method, setMethod] = useState("");
  const [origin, setOrigin] = useState<ShippingAddress>({});
  const [includeOrigin, setIncludeOrigin] = useState(false);
  const [originConfirmed, setOriginConfirmed] = useState(false);
  const [packages, setPackages] = useState<PackageIntent[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const refresh = async () => {
    await Promise.all([
      cache.invalidateQueries({ queryKey: ["admin-order-logistics", orderId] }),
      cache.invalidateQueries({ queryKey: ["admin-order-360", orderId] }),
    ]);
  };
  const prepare = async (id: string) => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      await prepareShipment(client, id);
      setNotice("Rascunho preparado. Nenhum frete contratado.");
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : logisticsMessage("UNKNOWN"));
    } finally {
      setBusy(false);
    }
  };
  const edit = (shipment: Shipment) => {
    setEditing(shipment);
    setMethod(shipment.method ?? "");
    setOrigin({ ...shipment.origin });
    setIncludeOrigin(shipment.origin !== null);
    setOriginConfirmed(false);
    setPackages(
      shipment.packages.map((pack) => ({
        ...pack,
        items: shipment.items.map((item) => ({
          order_item_id: item.id,
          quantity: pack.items.find((i) => i.order_item_id === item.id)?.quantity ?? 0,
        })),
      })),
    );
    setNotice(null);
  };
  const updatePackage = (index: number, change: Partial<PackageIntent>) =>
    setPackages((old) => old.map((p, i) => (i === index ? { ...p, ...change } : p)));
  const save = async () => {
    if (!editing || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      await configureShipment(client, editing, {
        method: method || null,
        origin: includeOrigin ? origin : null,
        originConfirmed,
        packages: packages.map((p) => ({
          ...p,
          items: p.items.filter((item) => item.quantity > 0),
        })),
      });
      setEditing(null);
      setNotice("Preparação salva. Sem cotação externa, etiqueta ou tracking.");
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : logisticsMessage("UNKNOWN"));
      await query.refetch();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel
      title="Logística"
      description="Preparação de remessas e volumes por fulfillment. Sem contratação de frete."
    >
      {query.isLoading ? (
        <p className="py-4 text-sm">Carregando logística…</p>
      ) : query.isError ? (
        <p className="py-4 text-sm text-muted-foreground">
          Logística indisponível. Verifique a ativação da migration.
        </p>
      ) : (
        <>
          <p className="py-3 text-sm text-muted-foreground">
            {logisticsMessage("PROVIDER_NOT_CONFIGURED")}
          </p>
          {query.data?.block && (
            <p className="text-sm text-warning">{logisticsMessage(query.data.block)}</p>
          )}
          <div className="flex flex-wrap gap-2">
            {query.data?.eligible.map((group) => (
              <Button key={group.id} disabled={busy} onClick={() => void prepare(group.id)}>
                Preparar remessa · {group.owner}
              </Button>
            ))}
          </div>
          {!query.data?.shipments.length && (
            <p className="py-4 text-sm text-muted-foreground">
              Nenhuma remessa preparada. O fulfillment precisa ter baixa física confirmada.
            </p>
          )}
          <div className="divide-y">
            {query.data?.shipments.map((shipment) => (
              <section key={shipment.id} className="space-y-4 py-5">
                <div className="flex flex-wrap justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">{shipment.owner}</h3>
                    <Badge value={shipment.status} label={shipmentLabels[shipment.status]} />
                  </div>
                  {!query.data?.block && (
                    <Button disabled={busy} onClick={() => edit(shipment)}>
                      Configurar preparação
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Fornecedor: {shipment.supplier ?? "Não informado"} · Seller:{" "}
                  {shipment.seller ?? "Não informado"} · Stock owner:{" "}
                  {shipment.stockOwner ?? "Não informado"}
                </p>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <h4 className="mb-2 text-sm font-semibold">Destino autorizado</h4>
                    <p className="mb-2 text-xs text-muted-foreground">
                      Snapshot do pedido ou correção operacional registrada separadamente.
                    </p>
                    <Address value={shipment.recipient} />
                  </div>
                  <div>
                    <h4 className="mb-2 text-sm font-semibold">Origem operacional confirmada</h4>
                    <Address value={shipment.origin} />
                  </div>
                </div>
                <p className="text-sm">
                  Método:{" "}
                  {query.data?.methods.find((m) => m.code === shipment.method)?.label ??
                    shipment.method ??
                    "Não configurado"}
                </p>
                {shipment.packages.length ? (
                  <ul className="space-y-2 text-sm">
                    {shipment.packages.map((pack, i) => (
                      <li key={i}>
                        Volume {i + 1}: {pack.quantity} unidade(s) · {pack.weight} kg ·{" "}
                        {pack.length} × {pack.width} × {pack.height} cm
                        <p className="text-xs text-muted-foreground">
                          {pack.items
                            .map(
                              (item) =>
                                `${item.quantity} × ${shipment.items.find((i) => i.id === item.order_item_id)?.sku ?? "Item"} por volume`,
                            )
                            .join(" · ")}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">Volumes ainda não informados.</p>
                )}
                <ul className="space-y-1 text-sm text-warning">
                  {shipment.pending.map((code) => (
                    <li key={code}>{logisticsMessage(code)}</li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">
                  Atualizado: {dateTime(shipment.updatedAt)}
                </p>
              </section>
            ))}
          </div>
          {query.data?.activity.map((event) => (
            <p key={event.id} className="py-2 text-xs text-muted-foreground">
              {event.action} · {dateTime(event.at)}
              {event.actor ? ` · Ator: ${event.actor}` : ""}
            </p>
          ))}
        </>
      )}
      {notice && (
        <p role="status" className="py-3 text-sm">
          {notice}
        </p>
      )}
      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setEditing(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Preparar remessa · {editing?.owner}</DialogTitle>
            <DialogDescription>
              Informe apenas dados operacionais reais. Destinatário e responsáveis vêm do
              pedido/fulfillment. Nenhuma etiqueta será emitida.
            </DialogDescription>
          </DialogHeader>
          <label className="text-sm">
            Modalidade
            <select
              className="mt-1 w-full rounded-md bg-secondary p-2"
              value={method}
              disabled={busy}
              onChange={(e) => setMethod(e.target.value)}
            >
              <option value="">Não configurada</option>
              {query.data?.methods.map((m) => (
                <option key={m.code} value={m.code}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={includeOrigin}
              disabled={busy}
              onChange={(e) => {
                setIncludeOrigin(e.target.checked);
                setOriginConfirmed(false);
              }}
            />
            Informar origem operacional real
          </label>
          {includeOrigin && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                {shippingAddressFields.map((key) => (
                  <label key={key} className="text-sm">
                    {addressLabels[key]}
                    <Input
                      value={origin[key] ?? ""}
                      maxLength={200}
                      disabled={busy}
                      onChange={(e) => {
                        setOrigin({ ...origin, [key]: e.target.value });
                        setOriginConfirmed(false);
                      }}
                    />
                  </label>
                ))}
              </div>
              <label className="flex gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={originConfirmed}
                  disabled={busy}
                  onChange={(e) => setOriginConfirmed(e.target.checked)}
                />
                Confirmo que esta é a origem operacional autorizada de {editing?.owner}, não apenas
                seu endereço comercial.
              </label>
            </>
          )}
          <h4 className="font-semibold">Volumes medidos</h4>
          {packages.map((pack, index) => (
            <fieldset key={index} className="space-y-3 rounded-lg bg-secondary/50 p-3">
              <legend className="px-1 text-sm">Volume {index + 1}</legend>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {(["quantity", "weight", "length", "width", "height"] as const).map((field) => (
                  <label key={field} className="text-xs">
                    {
                      {
                        quantity: "Volumes idênticos",
                        weight: "Peso (kg)",
                        length: "Comprimento (cm)",
                        width: "Largura (cm)",
                        height: "Altura (cm)",
                      }[field]
                    }
                    <Input
                      inputMode={field === "quantity" ? "numeric" : "decimal"}
                      value={pack[field]}
                      disabled={busy}
                      onChange={(e) =>
                        updatePackage(index, {
                          [field]:
                            field === "quantity"
                              ? Number(e.target.value)
                              : e.target.value.replace(",", "."),
                          measured: false,
                        })
                      }
                    />
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Quantidade de cada item por volume idêntico:
              </p>
              {editing?.items.map((item) => (
                <label key={item.id} className="flex items-center justify-between gap-3 text-sm">
                  <span>
                    {item.name} · {item.sku} (total: {item.quantity})
                  </span>
                  <Input
                    className="w-20"
                    type="number"
                    min={0}
                    step={1}
                    disabled={busy}
                    value={pack.items.find((i) => i.order_item_id === item.id)?.quantity ?? 0}
                    onChange={(e) =>
                      updatePackage(index, {
                        items: pack.items.map((i) =>
                          i.order_item_id === item.id
                            ? { ...i, quantity: Number(e.target.value) }
                            : i,
                        ),
                        measured: false,
                      })
                    }
                  />
                </label>
              ))}
              <label className="flex gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={pack.measured}
                  disabled={busy}
                  onChange={(e) => updatePackage(index, { measured: e.target.checked })}
                />
                Medidas e composição conferidas fisicamente.
              </label>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => setPackages(packages.filter((_, i) => i !== index))}
              >
                Remover deste rascunho
              </Button>
            </fieldset>
          ))}
          <Button
            variant="outline"
            disabled={busy || packages.length >= 100}
            onClick={() =>
              setPackages([
                ...packages,
                {
                  quantity: 1,
                  weight: "",
                  length: "",
                  width: "",
                  height: "",
                  weight_unit: "kg",
                  dimension_unit: "cm",
                  measured: false,
                  items: (editing?.items ?? []).map((item) => ({
                    order_item_id: item.id,
                    quantity: 0,
                  })),
                },
              ])
            }
          >
            Adicionar volume sem medidas preenchidas
          </Button>
          {notice && (
            <p role="alert" className="text-sm text-danger">
              {notice}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={busy} onClick={() => setEditing(null)}>
              Voltar
            </Button>
            <Button disabled={busy} onClick={() => void save()}>
              {busy ? "Salvando…" : "Salvar preparação"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}
