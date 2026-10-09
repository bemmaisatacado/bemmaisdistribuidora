import assert from "node:assert/strict";
import test from "node:test";
import { checkoutErrorMessage, checkoutIntentError } from "../src/lib/orders/checkout.ts";

const id = "00000000-0000-4000-8000-000000000001";
const address = {
  recipient: "Cliente",
  city: "São Paulo",
  postal_code: "01001000",
  street: "Praça da Sé",
  number: "1",
  district: "Sé",
  state: "SP",
  country: "BR",
};
test("checkout aceita somente intenção sem preço autoritativo", () =>
  assert.equal(
    checkoutIntentError({
      storeSlug: "loja",
      idempotencyKey: "attempt",
      shippingAddress: address,
      items: [{ listingId: id, variantId: id, quantity: 2 }],
    }),
    null,
  ));
test("checkout rejeita carrinho vazio, itens inválidos e duplicados", () => {
  assert.equal(
    checkoutIntentError({
      storeSlug: "loja",
      idempotencyKey: "a",
      shippingAddress: address,
      items: [],
    }),
    "EMPTY_CART",
  );
  assert.equal(
    checkoutIntentError({
      storeSlug: "loja",
      idempotencyKey: "a",
      shippingAddress: address,
      items: [{ listingId: "x", variantId: id, quantity: 1 }],
    }),
    "INVALID_ITEM",
  );
  assert.equal(
    checkoutIntentError({
      storeSlug: "loja",
      idempotencyKey: "a",
      shippingAddress: address,
      items: [
        { listingId: id, variantId: id, quantity: 1 },
        { listingId: id, variantId: id, quantity: 1 },
      ],
    }),
    "INVALID_ITEM",
  );
});
test("checkout exige endereço mínimo e chave persistente", () => {
  assert.equal(
    checkoutIntentError({
      storeSlug: "loja",
      idempotencyKey: "a",
      shippingAddress: { city: "SP" },
      items: [{ listingId: id, variantId: id, quantity: 1 }],
    }),
    "ADDRESS_INCOMPLETE",
  );
  assert.equal(
    checkoutIntentError({
      storeSlug: "loja",
      idempotencyKey: "",
      shippingAddress: address,
      items: [{ listingId: id, variantId: id, quantity: 1 }],
    }),
    "INVALID_ITEM",
  );
});
test("checkout aceita vários itens distintos e limita a quantidade", () => {
  assert.equal(
    checkoutIntentError({
      storeSlug: "loja",
      idempotencyKey: "attempt",
      shippingAddress: address,
      items: [
        { listingId: id, variantId: id, quantity: 999 },
        { listingId: "00000000-0000-4000-8000-000000000002", variantId: id, quantity: 1 },
      ],
    }),
    null,
  );
  assert.equal(
    checkoutIntentError({
      storeSlug: "loja",
      idempotencyKey: "attempt",
      shippingAddress: address,
      items: [{ listingId: id, variantId: id, quantity: 1000 }],
    }),
    "INVALID_ITEM",
  );
});
test("erros de domínio são seguros para o comprador", () => {
  assert.equal(
    checkoutErrorMessage("MOQ_NOT_MET"),
    "A quantidade mínima da oferta não foi atendida.",
  );
  assert.equal(
    checkoutErrorMessage("ADDRESS_INCOMPLETE"),
    "Preencha o endereço completo, com CEP e UF válidos.",
  );
  assert.equal(checkoutErrorMessage("internal"), "Não foi possível concluir o pedido agora.");
});
