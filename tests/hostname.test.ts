import test from "node:test";
import assert from "node:assert/strict";
import {
  canonicalStoreUrl,
  normalizeHostname,
  normalizeStoreSlug,
  platformHostname,
} from "../src/lib/domains/hostname-core.ts";
test("normaliza hostname de forma case-insensitive", () => {
  assert.equal(
    normalizeHostname("HTTPS://WWW.MinhaLoja.COM.br./catalogo?x=1"),
    "www.minhaloja.com.br",
  );
  assert.equal(normalizeHostname("loja.com.br:4173"), "loja.com.br");
  assert.equal(normalizeHostname("loja.com.br@evil.test"), null);
});
test("protege slugs reservados", () => {
  assert.equal(normalizeStoreSlug(" Minha Loja "), "minha-loja");
  assert.equal(normalizeStoreSlug("ADMIN"), null);
  assert.equal(platformHostname("minha-loja"), "minha-loja.bemmaisdistribuidora.com.br");
});
test("prioriza domínio principal ativo e mantém fallback", () => {
  assert.equal(
    canonicalStoreUrl({ slug: "a" }, [
      {
        hostname: "a.com.br",
        status: "pending_configuration",
        is_primary: true,
        type: "custom_domain",
      },
      {
        hostname: "a.bemmaisdistribuidora.com.br",
        status: "active",
        is_primary: false,
        type: "platform_subdomain",
      },
    ]),
    "https://a.bemmaisdistribuidora.com.br",
  );
  assert.equal(canonicalStoreUrl({ slug: "a" }, [], true), "/s/a");
});
