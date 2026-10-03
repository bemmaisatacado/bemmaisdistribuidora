import assert from "node:assert/strict";
import test from "node:test";
import {
  APPAREL_SIZES,
  COMMON_COLORS,
  FOOTWEAR_SIZES,
  INITIAL_BRANDS,
  INITIAL_CATEGORY_TREE,
  idempotentMasterNames,
  initialAttribute,
} from "../src/lib/catalog/initial-master-data.ts";

test("base inicial normaliza marcas sem duplicá-las", () => {
  assert.equal(
    idempotentMasterNames([...INITIAL_BRANDS, " nike ", "NEW   BALANCE"]).length,
    INITIAL_BRANDS.length,
  );
});
test("hierarquia inicial mantém categorias extensíveis e Tênis tem eixos de variante", () => {
  assert.ok(INITIAL_CATEGORY_TREE.Calçados.includes("Tênis"));
  assert.ok(INITIAL_CATEGORY_TREE.Vestuário.includes("Camisetas"));
  assert.deepEqual(initialAttribute("Tamanho", FOOTWEAR_SIZES, true), {
    code: "tamanho",
    options: [...FOOTWEAR_SIZES],
    isVariant: true,
  });
  assert.equal(initialAttribute("Material", [], false).isVariant, false);
});
test("vestuário usa escala alfabética e cores reutilizáveis", () => {
  assert.deepEqual(initialAttribute("Tamanho", APPAREL_SIZES, true).options, [...APPAREL_SIZES]);
  assert.equal(initialAttribute("Cor", COMMON_COLORS, true).options.includes("Azul-marinho"), true);
});
