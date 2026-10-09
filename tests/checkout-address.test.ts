import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { deliveryAddressComplete, normalizeDeliveryAddress } from "../src/lib/orders/address.ts";
import { shippingAddressComplete } from "../src/lib/orders/logistics.ts";
import { checkoutIntentError } from "../src/lib/orders/checkout.ts";
const address = {
  recipient: "Destinatário",
  postal_code: "01001-000",
  street: "Praça da Sé",
  number: "1",
  district: "Sé",
  city: "São Paulo",
  state: "sp",
  country: "br",
};
const sql = readFileSync(
  new URL("../supabase/migrations/20261009001556_complete_checkout_addresses.sql", import.meta.url),
  "utf8",
);
test("endereço completo normaliza CEP e UF sem modificar formulário", () => {
  assert.equal(deliveryAddressComplete(address), true);
  assert.equal(normalizeDeliveryAddress(address).postal_code, "01001000");
  assert.equal(address.postal_code, "01001-000");
});
test("endereço exige todos os campos e rejeita CEP/UF inexistentes", () => {
  for (const key of [
    "recipient",
    "postal_code",
    "street",
    "number",
    "district",
    "city",
    "state",
    "country",
  ])
    assert.equal(deliveryAddressComplete({ ...address, [key]: "" }), false, key);
  for (const postal_code of ["00000000", "123", "abcdefgh"])
    assert.equal(deliveryAddressComplete({ ...address, postal_code }), false);
  assert.equal(deliveryAddressComplete({ ...address, state: "ZZ" }), false);
});
test("sem número exige confirmação explícita e não aceita número contraditório", () => {
  assert.equal(deliveryAddressComplete({ ...address, number: "S/N" }), false);
  assert.equal(deliveryAddressComplete({ ...address, number: "", no_number: "true" }), true);
  assert.equal(deliveryAddressComplete({ ...address, no_number: "true" }), false);
  assert.equal(deliveryAddressComplete({ ...address, number: "", no_number: "false" }), false);
});
test("retirada não exige entrega; backend exige autorização da loja", () => {
  const id = "00000000-0000-4000-8000-000000000001";
  assert.equal(
    checkoutIntentError({
      storeSlug: "loja",
      idempotencyKey: "key",
      items: [{ listingId: id, variantId: id, quantity: 1 }],
      shippingAddress: { delivery_method: "pickup" },
    }),
    null,
  );
  assert.match(sql, /NOT _store.allow_pickup/);
});
test("remessas usam mesma validação e legado permanece incompleto", () => {
  assert.equal(shippingAddressComplete(address), true);
  assert.equal(shippingAddressComplete({ recipient: "Nome", city: "São Paulo" }), false);
});
test("limites e allowlist evitam persistência de campos pessoais extras", () => {
  assert.equal(deliveryAddressComplete({ ...address, reference: "x".repeat(201) }), false);
  assert.equal("token" in normalizeDeliveryAddress({ ...address, ...{ token: "secret" } }), false);
});
test("contrato migration preserva snapshot e separa correções auditáveis", () => {
  assert.match(sql, /ADDRESS_SNAPSHOT_IMMUTABLE/);
  assert.match(sql, /CREATE TABLE public.order_delivery_address_corrections/);
  assert.match(sql, /_expected_revision IS DISTINCT FROM/);
  assert.match(sql, /audit_address_correction/);
  assert.doesNotMatch(sql, /UPDATE public.orders SET shipping_address/);
});
test("contrato backend idempotente verifica intenção e mantém reservas e preços", () => {
  assert.match(sql, /checkout_intent_fingerprint=_fingerprint/);
  assert.match(sql, /IDEMPOTENCY_CONFLICT/);
  assert.match(sql, /INSERT INTO public.inventory_movements/);
  assert.match(sql, /_listing.retail_price/);
  assert.match(sql, /public.order_effective_delivery_address\(_oid\)/);
});
test("contrato privacidade restringe atores e remove PII de auditoria futura", () => {
  assert.match(sql, /buyer_user_id=auth.uid\(\)/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public.order_effective_delivery_address/);
  assert.match(sql, /_before-_private,_after-_private/);
});
