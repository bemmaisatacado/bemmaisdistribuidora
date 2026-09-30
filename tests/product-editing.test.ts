import test from "node:test";
import assert from "node:assert/strict";
import {
  editableVariantAttributes,
  isCategoryChangeBlocked,
  isDuplicateVariantCombination,
  mergeVariantAttributes,
  productMasterUpdate,
  validateVariantEdit,
  variantUpdateTarget,
  type EditableProductVariant,
  type VariantAttributeDefinition,
} from "../src/lib/catalog/product-editing.ts";

const definitions: VariantAttributeDefinition[] = [
  {
    code: "cor",
    name: "Cor",
    type: "color",
    options: ["Preto", "Branco"],
    is_required: true,
    is_variant: true,
  },
  {
    code: "material",
    name: "Material",
    type: "text",
    options: [],
    is_required: false,
    is_variant: false,
  },
];

const variants: EditableProductVariant[] = [
  {
    id: "variant-black",
    product_id: "product-1",
    sku: "BM-PRODUCT-1-000001",
    internal_code: "BMI0000000001",
    gtin: null,
    attributes: { cor: "Preto", material: "Couro" },
    is_active: true,
  },
  {
    id: "variant-white",
    product_id: "product-1",
    sku: "BM-PRODUCT-1-000002",
    internal_code: "BMI0000000002",
    gtin: null,
    attributes: { cor: "Branco", material: "Couro" },
    is_active: true,
  },
];

test("prepares Product Master updates without replacing identity fields", () => {
  const update = productMasterUpdate({
    name: "  Tênis  ",
    shortDescription: " Confortável ",
    description: " Descrição ",
    reference: " REF-1 ",
    audience: " Adulto ",
    tags: " Casual, casual, Corrida ",
    categoryId: "category-1",
    brandId: "brand-1",
  });
  assert.deepEqual(update, {
    name: "Tênis",
    short_description: "Confortável",
    description: "Descrição",
    reference: "REF-1",
    audience: "Adulto",
    tags: ["Casual", "Corrida"],
    category_id: "category-1",
    brand_id: "brand-1",
  });
  assert.equal("id" in update, false);
  assert.equal("slug" in update, false);
  assert.equal("status" in update, false);
});

test("accepts valid or empty GTIN and rejects invalid official codes", () => {
  assert.equal(validateVariantEdit("7891234567895", { cor: "Preto" }, definitions), null);
  assert.equal(validateVariantEdit("", { cor: "Preto" }, definitions), null);
  assert.match(
    validateVariantEdit("BMI0000000001", { cor: "Preto" }, definitions) ?? "",
    /GTIN\/EAN/,
  );
});

test("edits only configured variant attributes and preserves variant identity", () => {
  assert.deepEqual(editableVariantAttributes(variants[0].attributes, definitions), {
    cor: "Preto",
  });
  assert.deepEqual(mergeVariantAttributes(variants[0].attributes, { cor: "Branco" }, definitions), {
    cor: "Branco",
    material: "Couro",
  });
  assert.deepEqual(variantUpdateTarget(variants[0]), {
    id: "variant-black",
    productId: "product-1",
  });
  assert.equal(variants[0].sku, "BM-PRODUCT-1-000001");
  assert.equal(variants[0].internal_code, "BMI0000000001");
});

test("rejects duplicate combinations after normalizing configured attributes", () => {
  assert.equal(
    isDuplicateVariantCombination(variants, "variant-white", { cor: " preto " }, definitions),
    true,
  );
  assert.equal(
    isDuplicateVariantCombination(variants, "variant-white", { cor: "Branco" }, definitions),
    false,
  );
});

test("keeps the base variant editable and blocks unsafe category changes", () => {
  const base: EditableProductVariant = {
    id: "base",
    product_id: "product-base",
    sku: "BM-BASE-000001",
    internal_code: "BMI0000000003",
    gtin: null,
    attributes: {},
    is_active: true,
  };
  assert.equal(isCategoryChangeBlocked("category-1", "category-2", [base]), false);
  assert.equal(isCategoryChangeBlocked("category-1", "category-2", variants), true);
  assert.deepEqual(editableVariantAttributes(base.attributes, []), {});
  assert.deepEqual(variantUpdateTarget(base), { id: "base", productId: "product-base" });
});
