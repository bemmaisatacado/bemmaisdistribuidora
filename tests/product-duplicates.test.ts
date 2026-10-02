import assert from "node:assert/strict";
import test from "node:test";
import {
  canContinueProductCreation,
  duplicateCandidateSummary,
  isPossibleProductDuplicate,
  normalizeProductDuplicateName,
  type ProductDuplicateCandidate,
  type ProductDuplicateInput,
} from "../src/lib/catalog/product-duplicates.ts";

const input = (overrides: Partial<ProductDuplicateInput> = {}): ProductDuplicateInput => ({
  name: "New Balance 9060",
  brandId: "brand-new-balance",
  reference: "9060",
  categoryId: "category-tenis",
  gtin: null,
  ...overrides,
});

const candidate = (
  overrides: Partial<ProductDuplicateCandidate> = {},
): ProductDuplicateCandidate => ({
  id: "product-9060",
  name: "New Balance 9060",
  status: "draft",
  brand_id: "brand-new-balance",
  brand_name: "New Balance",
  category_id: "category-tenis",
  category_name: "Tênis",
  reference: "9060",
  image_path: null,
  matching_gtin: null,
  score: 80,
  gtin_match: false,
  ...overrides,
});

test("normaliza caixa e espaços triviais na identidade de Product Master", () => {
  assert.equal(normalizeProductDuplicateName(" NB   9060 "), "nb-9060");
  assert.equal(normalizeProductDuplicateName("nb 9060"), "nb-9060");
});

test("reconhece o mesmo nome e marca como possível duplicidade", () => {
  assert.equal(isPossibleProductDuplicate(input(), candidate()), true);
});

test("reconhece a mesma referência/modelo como sinal de possível duplicidade", () => {
  assert.equal(
    isPossibleProductDuplicate(
      input({ name: "Tênis esportivo 9060", categoryId: null }),
      candidate({ name: "New Balance 9060", category_id: null }),
    ),
    true,
  );
});

test("trata GTIN/EAN idêntico como sinal forte", () => {
  const gtinInput = input({ gtin: "7891234567895" });
  const gtinCandidate = candidate({
    matching_gtin: "7891234567895",
    gtin_match: true,
    score: 100,
  });
  assert.equal(isPossibleProductDuplicate(gtinInput, gtinCandidate), true);
  assert.equal(duplicateCandidateSummary(gtinInput, gtinCandidate), "GTIN/EAN oficial idêntico");
});

test("não confunde produtos semelhantes, mas distintos", () => {
  assert.equal(
    isPossibleProductDuplicate(
      input({ name: "Nike Air Max 90", reference: null }),
      candidate({
        name: "Nike Air Max 95",
        reference: null,
        brand_id: "brand-nike",
        category_id: null,
      }),
    ),
    false,
  );
});

test("fornecedores distintos continuam compartilhando o mesmo Product Master candidato", () => {
  const candidateSoldByAnotherSupplier = {
    ...candidate(),
    supplier_id: "supplier-b",
  };
  assert.equal(isPossibleProductDuplicate(input(), candidateSoldByAnotherSupplier), true);
});

test("candidatos são aviso e o operador ainda pode continuar criando", () => {
  assert.equal(canContinueProductCreation(), true);
});
