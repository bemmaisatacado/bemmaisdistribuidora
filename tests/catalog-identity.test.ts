import test from "node:test";
import assert from "node:assert/strict";
import { isOfficialGtin, variantLabel, variantMatrix } from "../src/lib/catalog/identity.ts";

test("creates a commercial variant matrix without inventing GTIN", () => {
  const rows = variantMatrix([
    { code: "cor", values: ["Preto", "Branco"] },
    { code: "tamanho", values: ["38", "39"] },
  ]);
  assert.equal(rows.length, 4);
  assert.equal(rows[0].gtin, undefined);
  assert.equal(variantLabel(rows[0]), "Preto / 38");
});
test("official GTIN is optional and validation does not accept an internal code", () => {
  assert.equal(isOfficialGtin(""), true);
  assert.equal(isOfficialGtin("7891234567895"), true);
  assert.equal(isOfficialGtin("BMI00000001"), false);
});
