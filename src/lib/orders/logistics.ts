import type { OrderCancellationRpc } from "./cancellation";
import { deliveryAddressComplete } from "./address.ts";

export type ShipmentStatus = "draft" | "ready_for_quote";
export const shipmentLabels: Record<ShipmentStatus, string> = {
  draft: "Rascunho",
  ready_for_quote: "Dados preparados para cotação",
};
export const shippingAddressFields = [
  "recipient",
  "postal_code",
  "street",
  "number",
  "complement",
  "district",
  "city",
  "state",
  "country",
  "no_number",
  "reference",
] as const;
export type ShippingAddress = Partial<Record<(typeof shippingAddressFields)[number], string>>;
export const addressLabels: Record<(typeof shippingAddressFields)[number], string> = {
  recipient: "Nome / responsável",
  postal_code: "CEP (8 dígitos)",
  street: "Rua",
  number: "Número",
  complement: "Complemento",
  district: "Bairro",
  city: "Cidade",
  state: "UF",
  country: "País (BR)",
  no_number: "Sem número (true/false)",
  reference: "Referência",
};
export function shippingAddressComplete(address: ShippingAddress | null) {
  return deliveryAddressComplete(address);
}
export const shippingTransitionAllowed = (from: ShipmentStatus, to: string) =>
  (from === "draft" || from === "ready_for_quote") && (to === "draft" || to === "ready_for_quote");
export type PackageIntent = {
  quantity: number;
  weight: string;
  length: string;
  width: string;
  height: string;
  weight_unit: "kg";
  dimension_unit: "cm";
  measured: boolean;
  items: { order_item_id: string; quantity: number }[];
};
export type Shipment = {
  id: string;
  fulfillmentId: string;
  owner: string;
  supplier: string | null;
  seller: string | null;
  stockOwner: string | null;
  recipient: ShippingAddress | null;
  origin: ShippingAddress | null;
  method: string | null;
  status: ShipmentStatus;
  version: number;
  updatedAt: string;
  items: { id: string; name: string; sku: string; quantity: number }[];
  packages: PackageIntent[];
  pending: string[];
};
export type LogisticsContext = {
  block: string | null;
  providerConfigured: false;
  eligible: { id: string; owner: string }[];
  methods: { code: string; label: string }[];
  shipments: Shipment[];
  activity: { id: string; action: string; actor: string | null; at: string }[];
};
const record = (raw: unknown): raw is Record<string, unknown> =>
  typeof raw === "object" && raw !== null && !Array.isArray(raw);
const text = (value: unknown) => (typeof value === "string" ? value : null);
const address = (raw: unknown): ShippingAddress | null =>
  record(raw)
    ? Object.fromEntries(
        shippingAddressFields.flatMap((key) =>
          typeof raw[key] === "string" ? [[key, raw[key]]] : [],
        ),
      )
    : null;
export function validPackage(pack: PackageIntent) {
  const dimension = (value: string) =>
    /^[0-9]{1,4}(\.[0-9]{1,2})?$/.test(value) && Number(value) > 0 && Number(value) <= 1000;
  return (
    pack.measured &&
    pack.weight_unit === "kg" &&
    pack.dimension_unit === "cm" &&
    /^[0-9]{1,4}(\.[0-9]{1,3})?$/.test(pack.weight) &&
    Number(pack.weight) > 0 &&
    Number(pack.weight) <= 1000 &&
    [pack.length, pack.width, pack.height].every(dimension) &&
    Number.isInteger(pack.quantity) &&
    pack.quantity > 0 &&
    pack.quantity <= 100 &&
    pack.items.length > 0 &&
    new Set(pack.items.map((item) => item.order_item_id)).size === pack.items.length &&
    pack.items.every(
      (item) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          item.order_item_id,
        ) &&
        Number.isInteger(item.quantity) &&
        item.quantity > 0 &&
        item.quantity <= 999999,
    )
  );
}
export function allocationsComplete(
  packages: readonly PackageIntent[],
  items: readonly { id: string; quantity: number }[],
) {
  if (!packages.length || !packages.every(validPackage)) return false;
  const allocated = new Map<string, number>();
  for (const pack of packages)
    for (const item of pack.items)
      allocated.set(
        item.order_item_id,
        (allocated.get(item.order_item_id) ?? 0) + item.quantity * pack.quantity,
      );
  return (
    allocated.size === items.length &&
    items.every((item) => allocated.get(item.id) === item.quantity)
  );
}
export const logisticsMessage = (code: string) =>
  (
    ({
      FORBIDDEN: "Você não tem permissão para preparar remessas.",
      ORDER_NOT_PAID: "Pedido não pago ou cancelado. Logística bloqueada.",
      PAYMENT_UNCERTAIN: "Há pagamento incerto. Logística bloqueada.",
      PAYMENT_UNVERIFIED: "Falta confirmação autoritativa do pagamento.",
      FULFILLMENT_NOT_READY: "Confirme a baixa física do fulfillment antes de preparar a remessa.",
      ORIGIN_MISSING: "Origem operacional não configurada.",
      RECIPIENT_INCOMPLETE:
        "Endereço histórico incompleto para frete. Não será substituído pelo cadastro atual.",
      METHOD_MISSING: "Selecione a modalidade de entrega.",
      PACKAGES_MISSING: "Informe os volumes e medidas reais.",
      PROVIDER_NOT_CONFIGURED:
        "Provider não integrado: cotação, etiqueta e tracking indisponíveis.",
      SHIPPING_ORIGIN_INVALID: "Confirme a origem operacional real e preencha todos os campos.",
      PACKAGES_INVALID: "Revise medidas, unidades e confirmação dos volumes.",
      PACKAGE_ITEM_INVALID: "Há item inválido ou de outro fulfillment no volume.",
      PACKAGE_ALLOCATION_INVALID:
        "A soma dos volumes deve corresponder exatamente aos itens desta remessa.",
      SHIPMENT_VERSION_CONFLICT: "A remessa mudou. Atualize antes de salvar.",
      SHIPPING_METHOD_INVALID: "Modalidade indisponível.",
    }) as Record<string, string>
  )[code] ?? "Não foi possível preparar a logística. Atualize e revise a operação.";

export function readLogistics(raw: unknown): LogisticsContext | null {
  if (
    !record(raw) ||
    raw.provider_configured !== false ||
    !Array.isArray(raw.shipments) ||
    !Array.isArray(raw.eligible) ||
    !Array.isArray(raw.methods)
  )
    return null;
  const shipments: Shipment[] = [];
  for (const s of raw.shipments) {
    if (
      !record(s) ||
      typeof s.id !== "string" ||
      typeof s.fulfillment_id !== "string" ||
      typeof s.owner !== "string" ||
      !["draft", "ready_for_quote"].includes(String(s.status)) ||
      typeof s.version !== "number" ||
      !Number.isInteger(s.version) ||
      typeof s.updated_at !== "string" ||
      !Array.isArray(s.items) ||
      !Array.isArray(s.packages)
    )
      return null;
    const items: Shipment["items"] = [];
    for (const i of s.items) {
      if (
        !record(i) ||
        typeof i.id !== "string" ||
        typeof i.name !== "string" ||
        typeof i.sku !== "string" ||
        typeof i.quantity !== "number"
      )
        return null;
      items.push({ id: i.id, name: i.name, sku: i.sku, quantity: i.quantity });
    }
    const packages: PackageIntent[] = [];
    for (const p of s.packages) {
      if (
        !record(p) ||
        typeof p.quantity !== "number" ||
        !Array.isArray(p.items) ||
        typeof p.weight !== "string" ||
        typeof p.length !== "string" ||
        typeof p.width !== "string" ||
        typeof p.height !== "string" ||
        p.weight_unit !== "kg" ||
        p.dimension_unit !== "cm"
      )
        return null;
      const packageItems: PackageIntent["items"] = [];
      for (const item of p.items) {
        if (
          !record(item) ||
          typeof item.order_item_id !== "string" ||
          typeof item.quantity !== "number"
        )
          return null;
        packageItems.push({ order_item_id: item.order_item_id, quantity: item.quantity });
      }
      packages.push({
        quantity: p.quantity,
        weight: p.weight,
        length: p.length,
        width: p.width,
        height: p.height,
        weight_unit: "kg",
        dimension_unit: "cm",
        measured: true,
        items: packageItems,
      });
    }
    shipments.push({
      id: s.id,
      fulfillmentId: s.fulfillment_id,
      owner: s.owner,
      supplier: text(s.supplier),
      seller: text(s.seller),
      stockOwner: text(s.stock_owner),
      recipient: address(s.recipient),
      origin: address(s.origin),
      method: text(s.method),
      status: s.status as ShipmentStatus,
      version: s.version,
      updatedAt: s.updated_at,
      items,
      packages,
      pending: Array.isArray(s.pending)
        ? s.pending.filter((v): v is string => typeof v === "string")
        : [],
    });
  }
  return {
    block: text(raw.block),
    providerConfigured: false,
    shipments,
    methods: raw.methods.flatMap((v) =>
      record(v) && typeof v.code === "string" && typeof v.label === "string"
        ? [{ code: v.code, label: v.label }]
        : [],
    ),
    eligible: raw.eligible.flatMap((v) =>
      record(v) && typeof v.id === "string" && typeof v.owner === "string"
        ? [{ id: v.id, owner: v.owner }]
        : [],
    ),
    activity: Array.isArray(raw.activity)
      ? raw.activity.flatMap((v) =>
          record(v) &&
          typeof v.id === "string" &&
          typeof v.action === "string" &&
          typeof v.at === "string"
            ? [{ id: v.id, action: v.action, actor: text(v.actor), at: v.at }]
            : [],
        )
      : [],
  };
}
export async function prepareShipment(client: OrderCancellationRpc, fulfillmentId: string) {
  const { data, error } = await client.rpc("prepare_fulfillment_shipment", {
    _fulfillment_id: fulfillmentId,
  });
  if (error) throw new Error(logisticsMessage(error.message));
  if (!record(data) || typeof data.shipment_id !== "string")
    throw new Error(logisticsMessage("UNKNOWN"));
  return data;
}
export async function configureShipment(
  client: OrderCancellationRpc,
  shipment: Shipment,
  intent: {
    method: string | null;
    origin: ShippingAddress | null;
    originConfirmed: boolean;
    packages: PackageIntent[];
  },
) {
  if (intent.origin && (!intent.originConfirmed || !shippingAddressComplete(intent.origin)))
    throw new Error(logisticsMessage("SHIPPING_ORIGIN_INVALID"));
  if (intent.packages.length && !allocationsComplete(intent.packages, shipment.items))
    throw new Error(logisticsMessage("PACKAGE_ALLOCATION_INVALID"));
  const { data, error } = await client.rpc("configure_shipment", {
    _shipment_id: shipment.id,
    _expected_version: shipment.version,
    _method: intent.method,
    _origin: intent.origin,
    _origin_confirmed: intent.originConfirmed,
    _packages: intent.packages,
  });
  if (error) throw new Error(logisticsMessage(error.message));
  if (!record(data) || data.shipment_id !== shipment.id)
    throw new Error(logisticsMessage("UNKNOWN"));
  return data;
}
