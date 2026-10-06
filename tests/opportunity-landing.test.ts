import assert from "node:assert/strict";
import test from "node:test";
import {
  OPPORTUNITY_CTA_REVEAL_AFTER_SECONDS,
  OPPORTUNITY_LINKS,
  OPPORTUNITY_ROUTE,
  isOpportunityVideoConfigured,
  mergeOpportunityAttribution,
  readOpportunityAttribution,
  shouldRevealOpportunityCtas,
  withOpportunityAttribution,
} from "../src/lib/opportunity/landing.ts";
import { dispatchOpportunityEvent, trackOpportunityEvent } from "../src/lib/opportunity/events.ts";

test("a rota comercial pública é memorável e não depende de autenticação", () => {
  assert.equal(OPPORTUNITY_ROUTE, "/oportunidade");
});

test("o vídeo tem fallback seguro até o asset oficial ser configurado", () => {
  assert.equal(isOpportunityVideoConfigured(undefined), false);
  assert.equal(isOpportunityVideoConfigured("   "), false);
  assert.equal(isOpportunityVideoConfigured("/campanha.mp4"), true);
});

test("os CTAs ficam ocultos antes de dez segundos e são revelados pelo tempo ou progresso real", () => {
  assert.equal(
    shouldRevealOpportunityCtas({ elapsedSeconds: OPPORTUNITY_CTA_REVEAL_AFTER_SECONDS - 0.01 }),
    false,
  );
  assert.equal(
    shouldRevealOpportunityCtas({ elapsedSeconds: OPPORTUNITY_CTA_REVEAL_AFTER_SECONDS }),
    true,
  );
  assert.equal(
    shouldRevealOpportunityCtas({
      elapsedSeconds: 1,
      videoProgressSeconds: OPPORTUNITY_CTA_REVEAL_AFTER_SECONDS,
    }),
    true,
  );
});

test("os CTAs usam os grupos oficiais de atacado, drop e suporte", () => {
  assert.equal(OPPORTUNITY_LINKS.atacado, "https://chat.whatsapp.com/CJ69jmgBIPILSJ3oTEmnuN");
  assert.equal(OPPORTUNITY_LINKS.drop, "https://chat.whatsapp.com/CwkFawv7e4h1pOYsh2QFJA");
  assert.equal(OPPORTUNITY_LINKS.support, "https://wa.me/553897233065");
});

test("UTMs são lidas, preservadas na sessão e enviadas aos links sem dados pessoais", () => {
  const saved = readOpportunityAttribution(
    new URLSearchParams("utm_source=instagram&utm_campaign=outubro"),
  );
  const current = readOpportunityAttribution(
    new URLSearchParams("utm_medium=paid_social&fbclid=abc123&email=nao-usar"),
  );
  const merged = mergeOpportunityAttribution(saved, current);
  const destination = new URL(withOpportunityAttribution(OPPORTUNITY_LINKS.atacado, merged));

  assert.equal(destination.searchParams.get("utm_source"), "instagram");
  assert.equal(destination.searchParams.get("utm_medium"), "paid_social");
  assert.equal(destination.searchParams.get("utm_campaign"), "outubro");
  assert.equal(destination.searchParams.get("fbclid"), "abc123");
  assert.equal(destination.searchParams.has("email"), false);
});

test("eventos de conversão são seguros sem analytics e integram dataLayer quando disponível", () => {
  const events: Array<Record<string, string | number | boolean | undefined>> = [];
  assert.doesNotThrow(() => trackOpportunityEvent("landing_view"));
  dispatchOpportunityEvent(
    "click_atacado",
    { placement: "hero" },
    { push: (event) => events.push(event) },
  );
  assert.deepEqual(events, [{ event: "click_atacado", placement: "hero" }]);
});
