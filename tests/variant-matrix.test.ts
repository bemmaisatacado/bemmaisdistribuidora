import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_VARIANT_COMBINATIONS,
  buildVariantMatrix,
  newVariantCombinations,
  variantAttributesKey,
  variantCombinationCount,
} from "../src/lib/catalog/identity.ts";

test("builds a generic matrix with one, two, and three axes", () => {
  assert.equal(variantCombinationCount([{ code: "volume", values: ["500 ml", "1 L", "2 L"] }]), 3);
  assert.equal(
    variantCombinationCount([
      { code: "cor", values: ["Preto", "Branco"] },
      { code: "tamanho", values: ["P", "M", "G"] },
    ]),
    6,
  );
  assert.equal(
    variantCombinationCount([
      { code: "cor", values: ["Preto", "Branco"] },
      { code: "tamanho", values: ["P", "M", "G"] },
      { code: "voltagem", values: ["110 V", "220 V"] },
    ]),
    12,
  );
});

test("creates one base variant when no variant axis is configured", () => {
  assert.deepEqual(buildVariantMatrix([]), {
    count: 1,
    exceedsLimit: false,
    variants: [{ attributes: {} }],
  });
});

test("does not let descriptive attributes multiply the matrix", () => {
  const result = buildVariantMatrix([
    { code: "material", values: ["Couro", "Lona"], is_variant: false },
    { code: "cor", values: ["Preto", "Branco"] },
  ]);
  assert.equal(result.count, 2);
  assert.deepEqual(
    result.variants.map((variant) => variant.attributes),
    [{ cor: "Preto" }, { cor: "Branco" }],
  );
});

test("normalizes duplicate combinations and respects the central limit", () => {
  const normalized = buildVariantMatrix([{ code: "cor", values: [" Preto ", "PRETO", "Branco"] }]);
  assert.equal(normalized.count, 2);
  assert.equal(
    new Set(normalized.variants.map((variant) => variantAttributesKey(variant.attributes))).size,
    2,
  );
  const limited = buildVariantMatrix([
    {
      code: "a",
      values: Array.from({ length: MAX_VARIANT_COMBINATIONS + 1 }, (_, index) => String(index)),
    },
  ]);
  assert.equal(limited.exceedsLimit, true);
  assert.equal(limited.variants.length, 0);
});

test("recognizes existing combinations without changing their identifiers or GTIN defaults", () => {
  const existing = [
    { attributes: { cor: "Preto", tamanho: "M" }, value: { id: "variant-1", gtin: "" } },
  ];
  const candidates = buildVariantMatrix([
    { code: "cor", values: ["preto", "Branco"] },
    { code: "tamanho", values: ["M"] },
  ]).variants;
  const additions = newVariantCombinations(existing, candidates);
  assert.deepEqual(
    additions.map((variant) => variant.attributes),
    [{ cor: "Branco", tamanho: "M" }],
  );
  assert.equal(existing[0].value.id, "variant-1");
  assert.equal(existing[0].value.gtin, "");
});
