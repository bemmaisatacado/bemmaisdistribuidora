import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { readOrder360 } from "../src/lib/orders/order-360.ts";
import { checkoutErrorMessage } from "../src/lib/orders/checkout.ts";
import {
  changeStorePublication,
  isStorePublicationStatus,
} from "../src/lib/admin/store-publication.ts";

// Contract assertions are not PostgreSQL execution or concurrency proof.
const sql = readFileSync(
  new URL(
    "../supabase/migrations/20261009003858_super_admin_critical_hardening.sql",
    import.meta.url,
  ),
  "utf8",
);
const functionBody = (name: string) => {
  const start = sql.search(new RegExp(`CREATE(?: OR REPLACE)? FUNCTION public\\.${name}\\(`));
  assert.notEqual(start, -1);
  return sql.slice(start, sql.indexOf("$$;", start) + 3);
};

test("snapshot tem autorização interna, capacidade e implementação privada sem grants públicos", () => {
  const body = functionBody("store_draft_snapshot");
  assert.match(body, /auth.uid\(\) IS NULL/);
  assert.match(body, /has_org_permission\(auth.uid\(\),_org,'stores.manage'\)/);
  assert.match(body, /capability='operate_store' AND enabled/);
  assert.match(
    sql,
    /REVOKE ALL ON SCHEMA bemmais_private FROM PUBLIC, anon, authenticated, service_role/,
  );
  assert.match(
    sql,
    /ALTER FUNCTION public.store_draft_snapshot_base\(uuid\) SET SCHEMA bemmais_private/,
  );
  assert.match(
    sql,
    /GRANT EXECUTE ON FUNCTION public.store_draft_snapshot\(uuid\) TO authenticated/,
  );
});

test("publicação protege campos sem flag controlável pelo cliente", () => {
  const body = functionBody("guard_store_protected_write");
  assert.match(body, /SECURITY INVOKER/);
  assert.match(body, /current_user=_owner/);
  for (const field of [
    "status",
    "published_snapshot",
    "published_at",
    "published_by",
    "published_revision",
    "draft_revision",
    "organization_id",
  ]) {
    assert.ok(body.includes(`NEW.${field}`));
  }
  assert.doesNotMatch(body, /current_setting|set_config/);
});

test("operações de status autorizam organização e reutilizam publish_store", () => {
  const body = functionBody("change_store_status");
  assert.match(body, /FOR UPDATE/);
  assert.match(body, /has_org_permission/);
  assert.match(body, /RETURN public.publish_store\(_store_id\)/);
  assert.match(body, /'draft','suspended','archived'/);
  assert.doesNotMatch(body, /SET published_snapshot/);
});

test("trigger de revisão separa stores de filhos sem NEW.store_id", () => {
  const body = functionBody("mark_store_draft_revision");
  assert.match(body, /TG_TABLE_NAME='stores'/);
  assert.match(body, /NEW.draft_revision := OLD.draft_revision\+1/);
  assert.match(body, /to_jsonb\(OLD\)->>'store_id'/);
  assert.doesNotMatch(body, /NEW.store_id|OLD.store_id/);
  assert.match(sql, /t_store_draft_revision BEFORE UPDATE/);
});

test("slug gerenciado só muda via identidade confiável; domínio personalizado permanece protegido", () => {
  const body = functionBody("guard_store_domain");
  assert.match(body, /SECURITY INVOKER/);
  assert.match(body, /DOMAIN_IDENTITY_IMMUTABLE/);
  assert.match(body, /NEW.type='platform_subdomain'/);
  assert.match(body, /current_user=\(SELECT pg_get_userbyid/);
  assert.match(functionBody("change_store_slug"), /ORDER BY id FOR UPDATE/);
});

test("checkout congela referências comerciais ordenadas antes dos locks de estoque", () => {
  const body = functionBody("create_storefront_order");
  const names = [
    "store_listings l",
    "products p",
    "product_variants v",
    "supplier_offers o",
    "supplier_offer_variants ov",
  ];
  let last = -1;
  for (const name of names) {
    const position = body.indexOf(`FROM public.${name}`);
    assert.ok(position > last);
    last = position;
  }
  assert.equal((body.match(/FOR SHARE NOWAIT/g) ?? []).length, 6);
  assert.ok(body.indexOf("ORDER BY ov.id FOR SHARE NOWAIT") < body.indexOf("FOR _raw"));
  assert.match(body, /CHECKOUT_CONCURRENT_CHANGE/);
  assert.match(body, /checkout_intent_fingerprint=_fingerprint/);
  assert.match(body, /_qty < _offer.moq/);
  assert.match(body, /on_hand - reserved/);
});

test("reserva manual e referência forjada são rejeitadas pelo papel SQL, não pelo frontend", () => {
  const body = functionBody("guard_inventory_operational_movement");
  assert.match(body, /SECURITY INVOKER/);
  assert.match(body, /current_user<>_owner/);
  assert.match(body, /INVENTORY_OPERATIONAL_RPC_REQUIRED/);
  assert.match(body, /NEW.quantity IS DISTINCT FROM _i.quantity/);
  assert.match(body, /NEW.quantity IS DISTINCT FROM _r.quantity/);
  assert.match(body, /STOCK_RESERVATION_CONSUMED/);
  assert.doesNotMatch(body, /DELETE FROM|UPDATE public.inventory_movements/);
});

test("estoque mantém índices persistentes existentes e saldo sem novas colunas", () => {
  assert.doesNotMatch(
    sql,
    /ADD COLUMN.*(?:reserved|on_hand)|DROP INDEX|DELETE FROM public.inventory_movements/,
  );
  const historical = readFileSync(
    new URL(
      "../supabase/migrations/20261006112528_transactional_stock_reservations.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(historical, /inventory_reserve_once_per_order_item_idx/);
  assert.match(historical, /inventory_release_once_per_reservation_idx/);
});

test("DTO rejeita arrays e campos obrigatórios malformados sem coerção", () => {
  assert.equal(readOrder360([]), null);
  assert.equal(readOrder360({ order: { id: 12 } }), null);
  assert.equal(
    readOrder360({
      order: {
        id: "order",
        order_number: "BM-1",
        status: "paid",
        payment_status: ["paid"],
        fulfillment_status: "pending",
        currency: "BRL",
        created_at: "date",
        updated_at: "date",
      },
    }),
    null,
  );
});

test("status público de loja tem validação explícita", () => {
  assert.ok(isStorePublicationStatus("published"));
  assert.ok(isStorePublicationStatus("suspended"));
  assert.equal(isStorePublicationStatus("unknown"), false);
});

test("chamador de publicação usa RPC e preserva erro seguro", async () => {
  await changeStorePublication(
    {
      rpc: async (name, args) => {
        assert.equal(name, "change_store_status");
        assert.deepEqual(args, { _store_id: "store", _status: "published" });
        return { data: {}, error: null };
      },
    },
    "store",
    "published",
  );
  await assert.rejects(
    changeStorePublication(
      { rpc: async () => ({ data: null, error: { message: "private SQL" } }) },
      "store",
      "draft",
    ),
    /Confira permissões/,
  );
});

test("erro concorrente orienta retry da mesma intenção sem SQL interno", () => {
  assert.match(checkoutErrorMessage("CHECKOUT_CONCURRENT_CHANGE"), /mesma tentativa/);
  assert.doesNotMatch(checkoutErrorMessage("CHECKOUT_CONCURRENT_CHANGE"), /pg_|SQL/);
});
