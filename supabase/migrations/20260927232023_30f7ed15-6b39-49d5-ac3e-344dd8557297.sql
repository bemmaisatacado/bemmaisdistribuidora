
-- ENUMS
CREATE TYPE public.store_mode AS ENUM ('retail','wholesale','hybrid');
CREATE TYPE public.store_status AS ENUM ('draft','active','suspended','archived');
CREATE TYPE public.catalog_status AS ENUM ('draft','pending_review','approved','rejected','active','paused','archived');
CREATE TYPE public.commercial_modality AS ENUM ('drop','mixed_wholesale','closed_grade','retail','wholesale');
CREATE TYPE public.pricing_scope AS ENUM ('global','supplier','category','brand','product','variant','modality','organization','promotion');
CREATE TYPE public.pricing_rule_type AS ENUM ('percent','fixed','tiered');
CREATE TYPE public.inventory_movement_type AS ENUM ('in','out','reserve','release','adjust','return');
CREATE TYPE public.payment_account_kind AS ENUM ('gateway_recipient','pix');
CREATE TYPE public.payment_account_status AS ENUM ('pending','active','disabled');
CREATE TYPE public.payment_status AS ENUM ('pending','authorized','paid','failed','refunded','partially_refunded','chargeback','cancelled');
CREATE TYPE public.receivable_status AS ENUM ('pending','available','settled','cancelled');
CREATE TYPE public.payout_status AS ENUM ('pending','processing','paid','failed','cancelled');
CREATE TYPE public.ledger_entry_type AS ENUM ('sale','allocation','fee','payout','refund','partial_refund','chargeback','reversal','adjustment');

-- PERMISSIONS
INSERT INTO permissions(key, description) VALUES
 ('offers.review','Aprovar/rejeitar ofertas'),
 ('pricing.manage','Gerenciar regras de preço BemMais'),
 ('inventory.manage','Movimentar estoque'),
 ('ai.manage','Configurar Central de IA'),
 ('settings.manage','Configurações da plataforma')
ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(role_key, permission_key) VALUES
 ('org_owner','inventory.manage'),('org_manager','inventory.manage'),('org_operator','inventory.manage')
ON CONFLICT DO NOTHING;

-- STORES
CREATE TABLE public.stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  logo_url text, primary_color text, secondary_color text,
  whatsapp text, instagram text, email text, document text,
  mode store_mode NOT NULL DEFAULT 'retail',
  status store_status NOT NULL DEFAULT 'draft',
  features jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.stores(organization_id);
CREATE INDEX ON public.stores(status);
GRANT SELECT, INSERT, UPDATE ON public.stores TO authenticated;
GRANT ALL ON public.stores TO service_role;
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stores read" ON public.stores FOR SELECT TO authenticated USING (is_org_member(auth.uid(), organization_id) OR is_platform_admin(auth.uid()));
CREATE POLICY "stores insert" ON public.stores FOR INSERT TO authenticated WITH CHECK (has_org_permission(auth.uid(), organization_id, 'stores.manage'));
CREATE POLICY "stores update" ON public.stores FOR UPDATE TO authenticated USING (has_org_permission(auth.uid(), organization_id, 'stores.manage')) WITH CHECK (has_org_permission(auth.uid(), organization_id, 'stores.manage'));

-- CATALOG
CREATE TABLE public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid REFERENCES categories(id),
  name text NOT NULL, slug text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true, sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, slug text NOT NULL UNIQUE, logo_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_organization_id uuid REFERENCES organizations(id),
  category_id uuid REFERENCES categories(id),
  brand_id uuid REFERENCES brands(id),
  name text NOT NULL, slug text NOT NULL UNIQUE, description text,
  images jsonb NOT NULL DEFAULT '[]'::jsonb,
  status catalog_status NOT NULL DEFAULT 'draft',
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.products(category_id); CREATE INDEX ON public.products(brand_id);
CREATE INDEX ON public.products(status); CREATE INDEX ON public.products(owner_organization_id);
CREATE TABLE public.product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku text NOT NULL UNIQUE, barcode text,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.product_variants(product_id);
GRANT SELECT, INSERT, UPDATE ON public.categories, public.brands, public.products, public.product_variants TO authenticated;
GRANT ALL ON public.categories, public.brands, public.products, public.product_variants TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "categories read" ON public.categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "categories admin" ON public.categories FOR ALL TO authenticated USING (is_platform_admin(auth.uid())) WITH CHECK (is_platform_admin(auth.uid()));
CREATE POLICY "brands read" ON public.brands FOR SELECT TO authenticated USING (true);
CREATE POLICY "brands admin" ON public.brands FOR ALL TO authenticated USING (is_platform_admin(auth.uid())) WITH CHECK (is_platform_admin(auth.uid()));
CREATE POLICY "products read" ON public.products FOR SELECT TO authenticated USING (
  status IN ('approved','active') OR is_platform_admin(auth.uid())
  OR (owner_organization_id IS NOT NULL AND is_org_member(auth.uid(), owner_organization_id)));
CREATE POLICY "products insert" ON public.products FOR INSERT TO authenticated WITH CHECK (
  is_platform_admin(auth.uid()) OR (owner_organization_id IS NOT NULL AND has_org_permission(auth.uid(), owner_organization_id, 'catalog.manage')));
CREATE POLICY "products update" ON public.products FOR UPDATE TO authenticated USING (
  is_platform_admin(auth.uid()) OR (owner_organization_id IS NOT NULL AND has_org_permission(auth.uid(), owner_organization_id, 'catalog.manage')))
  WITH CHECK (is_platform_admin(auth.uid()) OR (owner_organization_id IS NOT NULL AND has_org_permission(auth.uid(), owner_organization_id, 'catalog.manage')));
CREATE POLICY "variants read" ON public.product_variants FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM products p WHERE p.id = product_id));
CREATE POLICY "variants write" ON public.product_variants FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM products p WHERE p.id = product_id AND (is_platform_admin(auth.uid()) OR (p.owner_organization_id IS NOT NULL AND has_org_permission(auth.uid(), p.owner_organization_id, 'catalog.manage')))))
  WITH CHECK (EXISTS (SELECT 1 FROM products p WHERE p.id = product_id AND (is_platform_admin(auth.uid()) OR (p.owner_organization_id IS NOT NULL AND has_org_permission(auth.uid(), p.owner_organization_id, 'catalog.manage')))));

-- SUPPLIER OFFERS
CREATE TABLE public.supplier_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  product_id uuid NOT NULL REFERENCES products(id),
  status catalog_status NOT NULL DEFAULT 'draft',
  modalities commercial_modality[] NOT NULL DEFAULT '{}',
  moq int NOT NULL DEFAULT 1,
  lead_time_days int,
  review_notes text, reviewed_by uuid, reviewed_at timestamptz,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.supplier_offers(organization_id); CREATE INDEX ON public.supplier_offers(product_id); CREATE INDEX ON public.supplier_offers(status);
CREATE TABLE public.supplier_offer_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES supplier_offers(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES product_variants(id),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  supply_cost numeric(12,2) NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(offer_id, variant_id)
);
CREATE INDEX ON public.supplier_offer_variants(variant_id);
CREATE TABLE public.grade_compositions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES supplier_offers(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  name text NOT NULL,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_units int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.supplier_offers, public.supplier_offer_variants, public.grade_compositions TO authenticated;
GRANT ALL ON public.supplier_offers, public.supplier_offer_variants, public.grade_compositions TO service_role;
ALTER TABLE public.supplier_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_offer_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grade_compositions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "offers read" ON public.supplier_offers FOR SELECT TO authenticated USING (is_org_member(auth.uid(), organization_id) OR is_platform_admin(auth.uid()));
CREATE POLICY "offers write" ON public.supplier_offers FOR ALL TO authenticated USING (has_org_permission(auth.uid(), organization_id, 'catalog.manage')) WITH CHECK (has_org_permission(auth.uid(), organization_id, 'catalog.manage'));
CREATE POLICY "offer variants read" ON public.supplier_offer_variants FOR SELECT TO authenticated USING (is_org_member(auth.uid(), organization_id) OR is_platform_admin(auth.uid()));
CREATE POLICY "offer variants write" ON public.supplier_offer_variants FOR ALL TO authenticated USING (has_org_permission(auth.uid(), organization_id, 'catalog.manage')) WITH CHECK (has_org_permission(auth.uid(), organization_id, 'catalog.manage'));
CREATE POLICY "grades read" ON public.grade_compositions FOR SELECT TO authenticated USING (is_org_member(auth.uid(), organization_id) OR is_platform_admin(auth.uid()));
CREATE POLICY "grades write" ON public.grade_compositions FOR ALL TO authenticated USING (has_org_permission(auth.uid(), organization_id, 'catalog.manage')) WITH CHECK (has_org_permission(auth.uid(), organization_id, 'catalog.manage'));

-- only platform can approve/publish/reject
CREATE OR REPLACE FUNCTION public.guard_review_status() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('approved','rejected','active') AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status)
     AND auth.uid() IS NOT NULL AND NOT is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Somente a plataforma pode aprovar, rejeitar ou publicar';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('approved','rejected') THEN
    IF TG_TABLE_NAME = 'supplier_offers' THEN NEW.reviewed_by := auth.uid(); NEW.reviewed_at := now(); END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER t_offers_guard BEFORE INSERT OR UPDATE ON public.supplier_offers FOR EACH ROW EXECUTE FUNCTION guard_review_status();
CREATE TRIGGER t_products_guard BEFORE INSERT OR UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION guard_review_status();

-- keep denormalized org on offer variants/grades consistent
CREATE OR REPLACE FUNCTION public.sync_offer_org() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN SELECT organization_id INTO NEW.organization_id FROM supplier_offers WHERE id = NEW.offer_id; RETURN NEW; END; $$;
CREATE TRIGGER t_sov_org BEFORE INSERT OR UPDATE ON public.supplier_offer_variants FOR EACH ROW EXECUTE FUNCTION sync_offer_org();
CREATE TRIGGER t_grade_org BEFORE INSERT OR UPDATE ON public.grade_compositions FOR EACH ROW EXECUTE FUNCTION sync_offer_org();

-- PRICING (platform only)
CREATE TABLE public.pricing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  scope pricing_scope NOT NULL DEFAULT 'global',
  scope_id uuid,
  modality commercial_modality,
  rule_type pricing_rule_type NOT NULL,
  value numeric(12,4) NOT NULL DEFAULT 0,
  tiers jsonb NOT NULL DEFAULT '[]'::jsonb,
  priority int NOT NULL DEFAULT 0,
  starts_at timestamptz, ends_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.pricing_rules(scope, scope_id) WHERE is_active;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pricing_rules TO authenticated;
GRANT ALL ON public.pricing_rules TO service_role;
ALTER TABLE public.pricing_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pricing admin" ON public.pricing_rules FOR ALL TO authenticated USING (is_platform_admin(auth.uid())) WITH CHECK (is_platform_admin(auth.uid()));

-- resolve price: most specific scope wins, then priority. tiers: [{"min":0,"max":100,"type":"percent","value":30}]
CREATE OR REPLACE FUNCTION public.resolve_platform_price(_offer_variant_id uuid, _modality commercial_modality, _buyer_org uuid DEFAULT NULL)
RETURNS TABLE(supply_cost numeric, platform_amount numeric, reseller_cost numeric, rule_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _cost numeric; _sup uuid; _prod uuid; _cat uuid; _brand uuid; _var uuid; _r pricing_rules; _amt numeric := 0; _t jsonb;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT sov.supply_cost, sov.organization_id, sov.variant_id, p.id, p.category_id, p.brand_id
    INTO _cost, _sup, _var, _prod, _cat, _brand
    FROM supplier_offer_variants sov JOIN product_variants v ON v.id = sov.variant_id JOIN products p ON p.id = v.product_id
    WHERE sov.id = _offer_variant_id;
  IF _cost IS NULL THEN RETURN; END IF;
  SELECT * INTO _r FROM pricing_rules r
   WHERE r.is_active AND (r.starts_at IS NULL OR r.starts_at <= now()) AND (r.ends_at IS NULL OR r.ends_at > now())
     AND (r.modality IS NULL OR r.modality = _modality)
     AND ( r.scope = 'global' OR r.scope = 'modality'
        OR (r.scope = 'promotion')
        OR (r.scope = 'variant' AND r.scope_id = _var) OR (r.scope = 'product' AND r.scope_id = _prod)
        OR (r.scope = 'brand' AND r.scope_id = _brand) OR (r.scope = 'category' AND r.scope_id = _cat)
        OR (r.scope = 'supplier' AND r.scope_id = _sup) OR (r.scope = 'organization' AND r.scope_id = _buyer_org))
   ORDER BY CASE r.scope WHEN 'promotion' THEN 0 WHEN 'variant' THEN 1 WHEN 'product' THEN 2 WHEN 'organization' THEN 3
     WHEN 'brand' THEN 4 WHEN 'category' THEN 5 WHEN 'supplier' THEN 6 WHEN 'modality' THEN 7 ELSE 8 END, r.priority DESC, r.created_at DESC
   LIMIT 1;
  IF _r.id IS NOT NULL THEN
    IF _r.rule_type = 'percent' THEN _amt := round(_cost * _r.value / 100, 2);
    ELSIF _r.rule_type = 'fixed' THEN _amt := _r.value;
    ELSE
      SELECT t INTO _t FROM jsonb_array_elements(_r.tiers) t
       WHERE _cost >= COALESCE((t->>'min')::numeric, 0) AND (t->>'max' IS NULL OR _cost < (t->>'max')::numeric) LIMIT 1;
      IF _t IS NOT NULL THEN
        _amt := CASE WHEN _t->>'type' = 'fixed' THEN (_t->>'value')::numeric ELSE round(_cost * (_t->>'value')::numeric / 100, 2) END;
      END IF;
    END IF;
  END IF;
  RETURN QUERY SELECT _cost, _amt, _cost + _amt, _r.id;
END; $$;
REVOKE EXECUTE ON FUNCTION public.resolve_platform_price(uuid, commercial_modality, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.resolve_platform_price(uuid, commercial_modality, uuid) TO authenticated, service_role;

-- STORE LISTINGS
CREATE TABLE public.store_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  product_id uuid NOT NULL REFERENCES products(id),
  offer_id uuid REFERENCES supplier_offers(id),
  modality commercial_modality NOT NULL DEFAULT 'drop',
  retail_price numeric(12,2),
  is_published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(store_id, product_id, offer_id, modality)
);
CREATE INDEX ON public.store_listings(organization_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_listings TO authenticated;
GRANT ALL ON public.store_listings TO service_role;
ALTER TABLE public.store_listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "listings read" ON public.store_listings FOR SELECT TO authenticated USING (is_org_member(auth.uid(), organization_id) OR is_platform_admin(auth.uid()));
CREATE POLICY "listings write" ON public.store_listings FOR ALL TO authenticated USING (has_org_permission(auth.uid(), organization_id, 'stores.manage')) WITH CHECK (has_org_permission(auth.uid(), organization_id, 'stores.manage') AND EXISTS (SELECT 1 FROM stores s WHERE s.id = store_id AND s.organization_id = store_listings.organization_id));

-- INVENTORY LEDGER
CREATE TABLE public.inventory_movements (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  variant_id uuid NOT NULL REFERENCES product_variants(id),
  offer_variant_id uuid REFERENCES supplier_offer_variants(id),
  movement_type inventory_movement_type NOT NULL,
  quantity int NOT NULL,
  reason text, reference_type text, reference_id text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.inventory_movements(organization_id, variant_id);
GRANT SELECT, INSERT ON public.inventory_movements TO authenticated;
GRANT ALL ON public.inventory_movements TO service_role;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inv read" ON public.inventory_movements FOR SELECT TO authenticated USING (is_org_member(auth.uid(), organization_id) OR is_platform_admin(auth.uid()));
CREATE POLICY "inv insert" ON public.inventory_movements FOR INSERT TO authenticated WITH CHECK (has_org_permission(auth.uid(), organization_id, 'inventory.manage'));
CREATE VIEW public.inventory_balances WITH (security_invoker = true) AS
SELECT organization_id, variant_id,
  SUM(CASE movement_type WHEN 'in' THEN quantity WHEN 'return' THEN quantity WHEN 'out' THEN -quantity WHEN 'adjust' THEN quantity ELSE 0 END)::int AS on_hand,
  SUM(CASE movement_type WHEN 'reserve' THEN quantity WHEN 'release' THEN -quantity WHEN 'out' THEN 0 ELSE 0 END)::int AS reserved
FROM public.inventory_movements GROUP BY organization_id, variant_id;
GRANT SELECT ON public.inventory_balances TO authenticated, service_role;

-- FINANCE
CREATE TABLE public.payment_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  kind payment_account_kind NOT NULL,
  provider text, provider_account_id text,
  pix_key_type text, pix_key text, holder_name text, holder_document text,
  status payment_account_status NOT NULL DEFAULT 'pending',
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id),
  provider text, provider_payment_id text, method text,
  amount numeric(12,2) NOT NULL, currency text NOT NULL DEFAULT 'BRL',
  status payment_status NOT NULL DEFAULT 'pending',
  paid_at timestamptz,
  reference_type text, reference_id text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES payments(id),
  beneficiary_organization_id uuid REFERENCES organizations(id),
  beneficiary_role text NOT NULL,
  amount numeric(12,2) NOT NULL,
  via_provider_split boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.receivables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  allocation_id uuid REFERENCES payment_allocations(id),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  amount numeric(12,2) NOT NULL, due_at timestamptz,
  status receivable_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  payment_account_id uuid REFERENCES payment_accounts(id),
  amount numeric(12,2) NOT NULL, method text,
  status payout_status NOT NULL DEFAULT 'pending',
  provider_reference text, paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ledger_entries (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id uuid REFERENCES organizations(id),
  entry_type ledger_entry_type NOT NULL,
  account text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('debit','credit')),
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  reference_type text, reference_id text,
  reverses_entry_id bigint REFERENCES ledger_entries(id),
  memo text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.payment_accounts(organization_id);
CREATE INDEX ON public.payments(organization_id, created_at DESC); CREATE INDEX ON public.payments(status);
CREATE INDEX ON public.payment_allocations(payment_id); CREATE INDEX ON public.payment_allocations(beneficiary_organization_id);
CREATE INDEX ON public.receivables(organization_id, status);
CREATE INDEX ON public.payouts(organization_id, status);
CREATE INDEX ON public.ledger_entries(organization_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.payment_accounts, public.payments, public.receivables, public.payouts TO authenticated;
GRANT SELECT, INSERT ON public.payment_allocations, public.ledger_entries TO authenticated;
GRANT ALL ON public.payment_accounts, public.payments, public.payment_allocations, public.receivables, public.payouts, public.ledger_entries TO service_role;
ALTER TABLE public.payment_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receivables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pa read" ON public.payment_accounts FOR SELECT TO authenticated USING (has_org_permission(auth.uid(), organization_id, 'finance.read'));
CREATE POLICY "pa write" ON public.payment_accounts FOR INSERT TO authenticated WITH CHECK (has_org_permission(auth.uid(), organization_id, 'finance.manage'));
CREATE POLICY "pa update" ON public.payment_accounts FOR UPDATE TO authenticated USING (has_org_permission(auth.uid(), organization_id, 'finance.manage')) WITH CHECK (has_org_permission(auth.uid(), organization_id, 'finance.manage'));
CREATE POLICY "payments read" ON public.payments FOR SELECT TO authenticated USING (is_platform_admin(auth.uid()) OR (organization_id IS NOT NULL AND has_org_permission(auth.uid(), organization_id, 'finance.read')));
CREATE POLICY "payments admin" ON public.payments FOR INSERT TO authenticated WITH CHECK (is_platform_admin(auth.uid()));
CREATE POLICY "payments admin upd" ON public.payments FOR UPDATE TO authenticated USING (is_platform_admin(auth.uid())) WITH CHECK (is_platform_admin(auth.uid()));
CREATE POLICY "alloc read" ON public.payment_allocations FOR SELECT TO authenticated USING (is_platform_admin(auth.uid()) OR (beneficiary_organization_id IS NOT NULL AND has_org_permission(auth.uid(), beneficiary_organization_id, 'finance.read')));
CREATE POLICY "alloc admin" ON public.payment_allocations FOR INSERT TO authenticated WITH CHECK (is_platform_admin(auth.uid()));
CREATE POLICY "recv read" ON public.receivables FOR SELECT TO authenticated USING (has_org_permission(auth.uid(), organization_id, 'finance.read'));
CREATE POLICY "recv admin" ON public.receivables FOR INSERT TO authenticated WITH CHECK (is_platform_admin(auth.uid()));
CREATE POLICY "recv admin upd" ON public.receivables FOR UPDATE TO authenticated USING (is_platform_admin(auth.uid())) WITH CHECK (is_platform_admin(auth.uid()));
CREATE POLICY "payout read" ON public.payouts FOR SELECT TO authenticated USING (has_org_permission(auth.uid(), organization_id, 'finance.read'));
CREATE POLICY "payout admin" ON public.payouts FOR INSERT TO authenticated WITH CHECK (is_platform_admin(auth.uid()));
CREATE POLICY "payout admin upd" ON public.payouts FOR UPDATE TO authenticated USING (is_platform_admin(auth.uid())) WITH CHECK (is_platform_admin(auth.uid()));
CREATE POLICY "ledger read" ON public.ledger_entries FOR SELECT TO authenticated USING (is_platform_admin(auth.uid()) OR (organization_id IS NOT NULL AND has_org_permission(auth.uid(), organization_id, 'finance.read')));
CREATE POLICY "ledger admin insert" ON public.ledger_entries FOR INSERT TO authenticated WITH CHECK (is_platform_admin(auth.uid()));

-- AI CENTER (no keys, no content)
CREATE TABLE public.ai_providers (
  key text PRIMARY KEY, name text NOT NULL,
  secret_name text NOT NULL, default_model text,
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ai_features (
  key text PRIMARY KEY, name text NOT NULL, description text,
  provider_key text REFERENCES ai_providers(key), model text,
  enabled boolean NOT NULL DEFAULT false,
  monthly_quota_per_org int,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ai_usage_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id uuid REFERENCES organizations(id),
  user_id uuid, feature_key text, provider_key text, model text,
  input_tokens int, output_tokens int, estimated_cost numeric(12,6),
  latency_ms int, status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.ai_usage_logs(organization_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.ai_providers, public.ai_features TO authenticated;
GRANT SELECT ON public.ai_usage_logs TO authenticated;
GRANT ALL ON public.ai_providers, public.ai_features, public.ai_usage_logs TO service_role;
ALTER TABLE public.ai_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai prov admin" ON public.ai_providers FOR ALL TO authenticated USING (is_platform_admin(auth.uid())) WITH CHECK (is_platform_admin(auth.uid()));
CREATE POLICY "ai feat admin" ON public.ai_features FOR ALL TO authenticated USING (is_platform_admin(auth.uid())) WITH CHECK (is_platform_admin(auth.uid()));
CREATE POLICY "ai usage read" ON public.ai_usage_logs FOR SELECT TO authenticated USING (is_platform_admin(auth.uid()) OR (organization_id IS NOT NULL AND has_org_permission(auth.uid(), organization_id, 'org.manage')));
INSERT INTO ai_providers(key, name, secret_name, default_model, enabled) VALUES ('openai','OpenAI','OPENAI_API_KEY','gpt-4o-mini', false);
INSERT INTO ai_features(key, name, description, provider_key) VALUES
 ('product_copy','Copy de produto','Títulos e descrições de produto','openai'),
 ('marketing','Marketing','Textos de campanha e posts','openai'),
 ('whatsapp','WhatsApp','Mensagens de venda e atendimento','openai'),
 ('sales_assistant','Assistente de vendas','Apoio ao lojista na venda','openai'),
 ('finance_insights','Análise financeira','Leitura de indicadores financeiros','openai'),
 ('inventory_insights','Análise de estoque','Alertas e sugestões de reposição','openai'),
 ('admin_assistant','Assistente administrativo','Apoio à equipe BemMais','openai');

-- PLATFORM SETTINGS
CREATE TABLE public.platform_settings (
  key text PRIMARY KEY, value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.platform_settings TO authenticated;
GRANT ALL ON public.platform_settings TO service_role;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings admin" ON public.platform_settings FOR ALL TO authenticated USING (is_platform_admin(auth.uid())) WITH CHECK (is_platform_admin(auth.uid()));
INSERT INTO platform_settings(key, value) VALUES ('general', '{"currency":"BRL","timezone":"America/Sao_Paulo","offer_review_required":true}');

-- updated_at triggers
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['stores','categories','brands','products','product_variants','supplier_offers','supplier_offer_variants','grade_compositions','pricing_rules','store_listings','payment_accounts','payments','receivables','payouts','ai_providers','ai_features','platform_settings'] LOOP
    EXECUTE format('CREATE TRIGGER t_%s_updated BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t, t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['stores','products','supplier_offers','supplier_offer_variants','pricing_rules','inventory_movements','payment_accounts','payments','payment_allocations','payouts','ledger_entries','ai_providers','ai_features','platform_settings'] LOOP
    EXECUTE format('CREATE TRIGGER audit_%s AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION audit_row_change()', t, t);
  END LOOP;
END $$;
