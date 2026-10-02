import assert from "node:assert/strict";
import test from "node:test";
import {
  archivedProductPreservesReferences,
  availableProductLifecycleActions,
  isValidProductLifecycleTransition,
  lifecycleTransitionRequest,
  productActivationRequirements,
} from "../src/lib/catalog/product-lifecycle.ts";

test("permite somente transições válidas do lifecycle real", () => {
  assert.equal(isValidProductLifecycleTransition("draft", "pending_review"), true);
  assert.equal(isValidProductLifecycleTransition("pending_review", "approved"), true);
  assert.equal(isValidProductLifecycleTransition("pending_review", "rejected"), true);
  assert.equal(isValidProductLifecycleTransition("approved", "active"), true);
  assert.equal(isValidProductLifecycleTransition("active", "paused"), true);
  assert.equal(isValidProductLifecycleTransition("paused", "active"), true);
  assert.equal(isValidProductLifecycleTransition("active", "draft"), false);
  assert.equal(isValidProductLifecycleTransition("archived", "active"), false);
});

test("expõe somente ações contextuais para o estado atual", () => {
  assert.deepEqual(
    availableProductLifecycleActions("pending_review").map((action) => action.target),
    ["approved", "rejected"],
  );
  assert.equal(
    availableProductLifecycleActions("pending_review").find(
      (action) => action.target === "rejected",
    )?.requiresReason,
    true,
  );
  assert.deepEqual(availableProductLifecycleActions("archived"), []);
});

test("a requisição carrega o status esperado para evitar transição baseada em estado antigo", () => {
  assert.deepEqual(lifecycleTransitionRequest("product-1", "active", "paused"), {
    _product_id: "product-1",
    _expected_status: "active",
    _target_status: "paused",
    _reason: undefined,
  });
  assert.throws(() => lifecycleTransitionRequest("product-1", "draft", "active"));
  assert.deepEqual(
    lifecycleTransitionRequest("product-1", "pending_review", "rejected", " Incompleto "),
    {
      _product_id: "product-1",
      _expected_status: "pending_review",
      _target_status: "rejected",
      _reason: "Incompleto",
    },
  );
});

test("valida os requisitos mínimos reais antes de ativar", () => {
  assert.deepEqual(
    productActivationRequirements({
      name: "Tênis",
      categoryId: "category-1",
      variants: [{ isActive: true, sku: "BM-1", internalCode: "BMI1" }],
    }),
    [],
  );
  assert.deepEqual(productActivationRequirements({ name: "", categoryId: null, variants: [] }), [
    "Informe o nome do produto.",
    "Selecione uma categoria antes de ativar.",
    "Mantenha pelo menos uma variante/SKU ativa.",
  ]);
});

test("arquivar preserva referências e não elimina o Product Master", () => {
  const product = {
    id: "product-1",
    status: "active" as const,
    offerIds: ["offer-1"],
    listingIds: ["listing-1"],
    inventoryVariantIds: ["variant-1"],
  };
  assert.deepEqual(archivedProductPreservesReferences(product), {
    ...product,
    status: "archived",
  });
});
