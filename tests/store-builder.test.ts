import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeTheme } from "../src/lib/storefront.ts";
import {
  ordered,
  sanitizePageContent,
  validateMediaMeta,
  visible,
} from "../src/lib/store-builder-core.ts";
test("sanitiza theme e mantém tokens seguros", () => {
  const t = sanitizeTheme({ primary: "javascript:bad", accent: "#112233", radius: "large" });
  assert.equal(t.primary, "#111111");
  assert.equal(t.accent, "#112233");
  assert.equal(t.radius, "large");
});
test("ordena e filtra navegação ou seções", () => {
  const items = [
    { position: 2, is_enabled: true },
    { position: 0, is_enabled: true },
    { position: 1, is_enabled: false },
  ];
  assert.deepEqual(
    ordered(items).map((x) => x.position),
    [0, 1, 2],
  );
  assert.deepEqual(
    visible(items).map((x) => x.position),
    [0, 2],
  );
});
test("bloqueia mídia inválida e conteúdo inseguro", () => {
  assert.equal(validateMediaMeta("image/webp", 5 * 1024 * 1024), true);
  assert.equal(validateMediaMeta("application/javascript", 1), false);
  assert.equal(
    sanitizePageContent("<script>x</script>javascript:alert(1) Sobre"),
    "xalert(1) Sobre",
  );
});
