import test from "node:test";
import assert from "node:assert/strict";
import {
  catalogReferenceSlug,
  categoryPath,
  categorySlugForParent,
  equivalentBrand,
  equivalentCategory,
  isCategoryParentAllowed,
  normalizeCatalogReferenceName,
  selectCatalogReference,
  type CatalogReference,
} from "../src/lib/catalog/quick-references.ts";

const categories: CatalogReference[] = [
  { id: "men", name: "Masculino", slug: "masculino", parent_id: null },
  { id: "women", name: "Feminino", slug: "feminino", parent_id: null },
  { id: "men-accessories", name: "Acessórios", slug: "masculino-acessorios", parent_id: "men" },
  {
    id: "women-accessories",
    name: "Acessórios",
    slug: "feminino-acessorios",
    parent_id: "women",
  },
  { id: "shoes", name: "Calçados", slug: "calcados", parent_id: null },
  { id: "sneakers", name: "Tênis", slug: "calcados-tenis", parent_id: "shoes" },
];

test("normalizes brands and detects equivalent names before creation", () => {
  assert.equal(normalizeCatalogReferenceName(" New   Balance "), "New Balance");
  assert.equal(catalogReferenceSlug(" New Balance "), "new-balance");
  const existing = equivalentBrand([{ id: "nb", name: "New Balance" }], " new   balance ");
  assert.equal(existing?.id, "nb");
});

test("detects duplicate categories only in the same hierarchy context", () => {
  assert.equal(equivalentCategory(categories, " acessórios ", "men")?.id, "men-accessories");
  assert.equal(equivalentCategory(categories, "Acessórios", "women")?.id, "women-accessories");
  assert.equal(equivalentCategory(categories, "Acessórios", "shoes"), null);
  assert.equal(categoryPath(categories[5], categories), "Calçados › Tênis");
  assert.equal(categorySlugForParent("Acessórios", "shoes", categories), "calcados-acessorios");
});

test("keeps category hierarchy cycle-safe", () => {
  assert.equal(isCategoryParentAllowed(categories, "men", "men"), false);
  assert.equal(isCategoryParentAllowed(categories, "men", "men-accessories"), false);
  assert.equal(isCategoryParentAllowed(categories, "men-accessories", "women"), true);
});

test("selecting a new reference preserves the rest of the product draft", () => {
  const productDraft = {
    name: "New Balance 9060",
    reference: "U9060",
    categoryId: "shoes",
    brandId: "",
    tags: "casual, corrida",
  };
  assert.deepEqual(selectCatalogReference(productDraft, "brandId", "nb"), {
    ...productDraft,
    brandId: "nb",
  });
  assert.deepEqual(selectCatalogReference(productDraft, "categoryId", "sneakers"), {
    ...productDraft,
    categoryId: "sneakers",
  });
});
