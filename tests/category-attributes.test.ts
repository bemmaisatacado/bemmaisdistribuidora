import test from "node:test";
import assert from "node:assert/strict";
import {
  categoryAttributeCode,
  categoryAttributeIsUsed,
  categoryAttributeRole,
  categoryAttributeRequiresOptions,
  moveCategoryAttribute,
  normalizeCategoryAttributeOptions,
  validateCategoryAttributeDraft,
} from "../src/lib/catalog/category-attributes.ts";

test("normalizes category attribute names and prevents duplicate codes", () => {
  assert.equal(categoryAttributeCode("  Cor  Principal "), "cor_principal");
  const result = validateCategoryAttributeDraft(
    { name: " COR ", type: "text", options: [], is_required: false, is_variant: false },
    ["cor"],
  );
  assert.deepEqual(result, { error: "Já existe um atributo com esse nome nesta categoria." });
});

test("normalizes options and requires them for selectable attributes", () => {
  assert.deepEqual(normalizeCategoryAttributeOptions([" Preto ", "preto", "", "Branco"]), [
    "Preto",
    "Branco",
  ]);
  assert.equal(categoryAttributeRequiresOptions("select"), true);
  assert.equal(categoryAttributeRequiresOptions("multi_select"), true);
  assert.equal(categoryAttributeRequiresOptions("color"), true);
  assert.equal(categoryAttributeRequiresOptions("text"), false);
  assert.deepEqual(
    validateCategoryAttributeDraft(
      { name: "Cor", type: "color", options: [" "], is_required: true, is_variant: true },
      [],
    ),
    { error: "Este tipo de atributo exige ao menos uma opção." },
  );
});

test("keeps descriptive and variant attributes distinct", () => {
  assert.equal(categoryAttributeRole(false), "descriptive");
  assert.equal(categoryAttributeRole(true), "variant");
  assert.equal(categoryAttributeIsUsed({ cor: "Preto" }, "cor"), true);
  assert.equal(categoryAttributeIsUsed({ material: "Couro" }, "cor"), false);
  assert.equal(categoryAttributeIsUsed(null, "cor"), false);
});

test("reorders category attributes by swapping persisted sort orders", () => {
  const attributes = [
    { id: "material", sort_order: 0 },
    { id: "cor", sort_order: 1 },
    { id: "tamanho", sort_order: 2 },
  ];
  assert.deepEqual(moveCategoryAttribute(attributes, "cor", "up"), [
    { id: "cor", sort_order: 0 },
    { id: "material", sort_order: 1 },
  ]);
  assert.deepEqual(moveCategoryAttribute(attributes, "cor", "down"), [
    { id: "cor", sort_order: 2 },
    { id: "tamanho", sort_order: 1 },
  ]);
  assert.equal(moveCategoryAttribute(attributes, "material", "up"), null);
  assert.equal(moveCategoryAttribute(attributes, "tamanho", "down"), null);
});
