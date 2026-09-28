import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeTheme } from "../src/lib/storefront.ts";
import { publishedSeo } from "../src/lib/store-seo.ts";
import { publishedNavigation, storeNavigationHref } from "../src/lib/store-navigation.ts";
import {
  hasUnpublishedChanges,
  ordered,
  publicSnapshot,
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
test("identifica rascunho não publicado sem substituir o snapshot público", () => {
  assert.equal(hasUnpublishedChanges(4, 3), true);
  assert.equal(hasUnpublishedChanges(3, 3), false);
  assert.deepEqual(publicSnapshot({ version: 3 }, { version: 4 }), { version: 3 });
  assert.deepEqual(publicSnapshot(null, { version: 4 }), { version: 4 });
});
test("SEO usa somente a configuração publicada e aplica fallbacks seguros", () => {
  const seo = publishedSeo({
    name: "Loja A",
    description: "Descrição publicada",
    logo_url: "https://img/logo.png",
    canonical_url: "https://loja.example.com",
    seo: { title: "Título publicado", noindex: true },
  });
  assert.equal(seo.title, "Título publicado");
  assert.equal(seo.description, "Descrição publicada");
  assert.equal(seo.canonical, "https://loja.example.com");
  assert.equal(seo.noindex, true);
});
test("menu publicado respeita ordem, visibilidade e rotas da própria Store", () => {
  const menu = publishedNavigation([
    { id: "late", label: "Catálogo", kind: "catalog", target: "", position: 2 },
    {
      id: "hidden",
      label: "Privado",
      kind: "page",
      target: "interno",
      position: 0,
      is_enabled: false,
    },
    { id: "first", label: "Sobre", kind: "page", target: "sobre", position: 1 },
  ]);
  assert.deepEqual(
    menu.map((item) => item.id),
    ["first", "late"],
  );
  assert.equal(storeNavigationHref(menu[0], "loja-a"), "/s/loja-a/paginas/sobre");
  assert.equal(
    storeNavigationHref(
      { id: "bad", label: "x", kind: "external", target: "javascript:alert(1)" },
      "loja-a",
    ),
    null,
  );
});
