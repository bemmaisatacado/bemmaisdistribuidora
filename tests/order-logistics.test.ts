import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  validPackage,
  allocationsComplete,
  shippingAddressComplete,
  shippingTransitionAllowed,
  readLogistics,
  prepareShipment,
  configureShipment,
  logisticsMessage,
  type PackageIntent,
} from "../src/lib/orders/logistics.ts";
import { requireShippingProvider } from "../src/lib/orders/shipping-provider.ts";
const itemId = "11111111-1111-4111-8111-111111111111";
const pack: PackageIntent = {
  quantity: 1,
  weight: "1.200",
  length: "30",
  width: "20",
  height: "15",
  weight_unit: "kg",
  dimension_unit: "cm",
  measured: true,
  items: [{ order_item_id: itemId, quantity: 2 }],
};
const address = {
  recipient: "Responsável",
  postal_code: "39400000",
  street: "Rua real",
  number: "10",
  district: "Centro",
  city: "Montes Claros",
  state: "MG",
  country: "BR",
};
const raw = {
  block: null,
  provider_configured: false,
  eligible: [],
  methods: [{ code: "pickup", label: "Retirada" }],
  activity: [],
  shipments: [
    {
      id: "shipment",
      fulfillment_id: "fulfillment",
      owner: "Expedidor",
      stock_owner: "Stock",
      supplier: "Fornecedor",
      seller: "Seller",
      recipient: { recipient: "Nome histórico", city: "Cidade histórica" },
      origin: null,
      method: null,
      status: "draft",
      version: 0,
      updated_at: "2026-10-08T12:00:00Z",
      items: [{ id: itemId, name: "Produto histórico", sku: "BM-1", quantity: 2 }],
      packages: [],
      pending: ["ORIGIN_MISSING", "RECIPIENT_INCOMPLETE", "PROVIDER_NOT_CONFIGURED"],
    },
  ],
};
test("volume válido usa unidades explícitas e confirmação operacional", () => {
  assert.equal(validPackage(pack), true);
});
test("volumes rejeitam medidas zero, negativas, ausentes e confirmação faltante", () => {
  for (const change of [
    { weight: "" },
    { weight: "0" },
    { length: "-1" },
    { height: "0" },
    { measured: false },
    { quantity: 0 },
    { weight: "Infinity" },
  ])
    assert.equal(validPackage({ ...pack, ...change }), false);
});
test("composição de múltiplos volumes respeita quantidade por volume e não duplica itens", () => {
  assert.equal(
    allocationsComplete([{ ...pack, quantity: 2 }], [{ id: itemId, quantity: 4 }]),
    true,
  );
  assert.equal(allocationsComplete([pack, pack], [{ id: itemId, quantity: 4 }]), true);
  assert.equal(allocationsComplete([pack], [{ id: itemId, quantity: 4 }]), false);
  assert.equal(
    allocationsComplete(
      [{ ...pack, items: [{ order_item_id: "other", quantity: 2 }] }],
      [{ id: itemId, quantity: 2 }],
    ),
    false,
  );
});
test("endereço incompleto permanece pendente, sem inferir origem ou país", () => {
  assert.equal(shippingAddressComplete(address), true);
  assert.equal(shippingAddressComplete(null), false);
  assert.equal(shippingAddressComplete({ recipient: "Pessoa", city: "Cidade" }), false);
  assert.equal(shippingAddressComplete({ ...address, country: undefined }), false);
});
test("DTO mantém destinatário histórico e separa participantes", () => {
  const decoded = readLogistics(raw)!;
  assert.deepEqual(decoded.shipments[0].recipient, {
    recipient: "Nome histórico",
    city: "Cidade histórica",
  });
  assert.equal(decoded.shipments[0].owner, "Expedidor");
  assert.equal(decoded.shipments[0].stockOwner, "Stock");
  assert.equal(decoded.shipments[0].origin, null);
  assert.deepEqual(decoded.shipments[0].packages, []);
});
test("DTO comporta múltiplas remessas sem consolidar owners", () => {
  const decoded = readLogistics({
    ...raw,
    shipments: [
      ...raw.shipments,
      { ...raw.shipments[0], id: "shipment2", owner: "Outro expedidor" },
    ],
  })!;
  assert.equal(decoded.shipments.length, 2);
  assert.notEqual(decoded.shipments[0].owner, decoded.shipments[1].owner);
});
test("lifecycle de preparação não permite simular etiqueta, trânsito ou entrega", () => {
  assert.equal(shippingTransitionAllowed("draft", "ready_for_quote"), true);
  assert.equal(shippingTransitionAllowed("ready_for_quote", "draft"), true);
  for (const status of [
    "quoted",
    "label_created",
    "dispatched",
    "in_transit",
    "delivered",
    "cancelled",
  ])
    assert.equal(shippingTransitionAllowed("draft", status), false);
  assert.equal(
    readLogistics({ ...raw, shipments: [{ ...raw.shipments[0], status: "delivered" }] }),
    null,
  );
});
test("sem adapter não há cotação, etiqueta ou tracking falsos", () => {
  assert.throws(() => requireShippingProvider(), /PROVIDER_NOT_CONFIGURED/);
  assert.equal(readLogistics(raw)?.providerConfigured, false);
});
test("prepare envia apenas fulfillment e aceita resposta idempotente", async () => {
  let calls = 0;
  const client = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      assert.equal(name, "prepare_fulfillment_shipment");
      assert.deepEqual(args, { _fulfillment_id: "fulfillment" });
      return { data: { shipment_id: "shipment", idempotent: ++calls > 1 }, error: null };
    },
  };
  await prepareShipment(client, "fulfillment");
  assert.equal((await prepareShipment(client, "fulfillment")).idempotent, true);
});
test("configuração não envia destinatário, owners, status, preço ou estoque", async () => {
  const shipment = readLogistics(raw)!.shipments[0];
  await configureShipment(
    {
      rpc: async (name, args) => {
        assert.equal(name, "configure_shipment");
        assert.deepEqual(
          Object.keys(args).sort(),
          [
            "_shipment_id",
            "_expected_version",
            "_method",
            "_origin",
            "_origin_confirmed",
            "_packages",
          ].sort(),
        );
        return { data: { shipment_id: "shipment" }, error: null };
      },
    },
    shipment,
    { method: "pickup", origin: address, originConfirmed: true, packages: [pack] },
  );
});
test("origem não confirmada e autorização negada bloqueiam com mensagem segura", async () => {
  const client = { rpc: async () => ({ data: null, error: { message: "FORBIDDEN" } }) };
  await assert.rejects(
    configureShipment(client, readLogistics(raw)!.shipments[0], {
      method: null,
      origin: address,
      originConfirmed: false,
      packages: [],
    }),
    /origem/,
  );
  await assert.rejects(prepareShipment(client, "fulfillment"), /permissão/);
  assert.equal(logisticsMessage("SQL_INTERNAL"), logisticsMessage("UNKNOWN"));
});
const sql = readFileSync(
  new URL("../supabase/migrations/20261008231457_logistics_foundation.sql", import.meta.url),
  "utf8",
);
test("contrato SQL protege pagamento, fulfillment, snapshot, idempotência e RLS; não comprova execução", () => {
  assert.match(sql, /order_fulfillment_block\(_oid\)/);
  assert.match(sql, /_f.status<>'ready_to_ship'/);
  assert.match(sql, /fulfillment_id uuid NOT NULL UNIQUE/);
  assert.match(sql, /_f.seller_organization_id,_address/);
  assert.match(sql, /SHIPPING_RPC_REQUIRED/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /SHIPMENT_VERSION_CONFLICT/);
  assert.match(sql, /PACKAGE_ALLOCATION_INVALID/);
  assert.doesNotMatch(
    sql,
    /INSERT INTO public.inventory_movements|UPDATE public.inventory_movements|DELETE FROM/,
  );
  assert.doesNotMatch(sql, /CREATE TABLE.*(tracking|shipping_labels)/);
});
test("Order 360 permite dados medidos sem defaults falsos e mostra pendências reais", () => {
  const ui = readFileSync(
    new URL("../src/components/admin/orders/logistics-panel.tsx", import.meta.url),
    "utf8",
  );
  assert.match(ui, /weight: ""/);
  assert.match(ui, /originConfirmed/);
  assert.match(ui, /shipment.pending.map/);
  assert.match(ui, /query.data\?\.block/);
  assert.match(ui, /PROVIDER_NOT_CONFIGURED/);
  assert.doesNotMatch(ui, /service_role|purchaseLabel\(/);
});
