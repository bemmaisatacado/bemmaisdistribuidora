
-- ===== Supplier commercial profile (visible to own org + platform) =====
CREATE TABLE public.supplier_profiles (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  supplier_type text NOT NULL DEFAULT 'other' CHECK (supplier_type IN ('factory','distributor','wholesaler','importer','representative','other')),
  category_ids uuid[] NOT NULL DEFAULT '{}',
  instagram text,
  modalities public.commercial_modality[] NOT NULL DEFAULT '{}',
  supports_unit_sale boolean NOT NULL DEFAULT false,
  own_fulfillment boolean NOT NULL DEFAULT false,
  min_order_value numeric(12,2),
  min_quantity int,
  prep_days int,
  ship_days int,
  commercial_notes text,
  return_policy text,
  freight_policy text,
  service_regions text,
  fulfillment_mode text NOT NULL DEFAULT 'supplier' CHECK (fulfillment_mode IN ('supplier','bemmais','third_party')),
  ship_origin text,
  logistics_notes text,
  payout_method text CHECK (payout_method IN ('pix','gateway','other')),
  finance_status text NOT NULL DEFAULT 'not_configured' CHECK (finance_status IN ('not_configured','pending','approved','active','problem','blocked')),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.supplier_profiles TO authenticated;
GRANT ALL ON public.supplier_profiles TO service_role;
ALTER TABLE public.supplier_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sp read" ON public.supplier_profiles FOR SELECT TO authenticated USING (is_org_member(auth.uid(), organization_id) OR is_platform_admin(auth.uid()));
CREATE POLICY "sp insert" ON public.supplier_profiles FOR INSERT TO authenticated WITH CHECK (has_org_permission(auth.uid(), organization_id, 'org.manage'));
CREATE POLICY "sp update" ON public.supplier_profiles FOR UPDATE TO authenticated USING (has_org_permission(auth.uid(), organization_id, 'org.manage')) WITH CHECK (has_org_permission(auth.uid(), organization_id, 'org.manage'));
CREATE TRIGGER t_sp_updated BEFORE UPDATE ON public.supplier_profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER t_sp_audit AFTER INSERT OR UPDATE OR DELETE ON public.supplier_profiles FOR EACH ROW EXECUTE FUNCTION audit_row_change();

-- finance_status is decided by the platform only
CREATE OR REPLACE FUNCTION public.guard_supplier_profile() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT is_platform_admin(auth.uid()) THEN
    IF TG_OP = 'INSERT' THEN NEW.finance_status := 'not_configured';
    ELSIF NEW.finance_status IS DISTINCT FROM OLD.finance_status THEN
      RAISE EXCEPTION 'Somente a BemMais altera o status financeiro';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER t_sp_guard BEFORE INSERT OR UPDATE ON public.supplier_profiles FOR EACH ROW EXECUTE FUNCTION guard_supplier_profile();

-- ===== Supplier relationship CRM (platform only) =====
CREATE TABLE public.supplier_relationships (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  relationship_status text NOT NULL DEFAULT 'prospeccao' CHECK (relationship_status IN ('prospeccao','onboarding','ativo','pausado','inativo')),
  account_manager_id uuid,
  last_contact_at timestamptz,
  next_action text,
  next_action_at date,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_relationships TO authenticated;
GRANT ALL ON public.supplier_relationships TO service_role;
ALTER TABLE public.supplier_relationships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "srel platform" ON public.supplier_relationships FOR ALL TO authenticated USING (is_platform_admin(auth.uid())) WITH CHECK (is_platform_admin(auth.uid()));
CREATE TRIGGER t_srel_updated BEFORE UPDATE ON public.supplier_relationships FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER t_srel_audit AFTER INSERT OR UPDATE OR DELETE ON public.supplier_relationships FOR EACH ROW EXECUTE FUNCTION audit_row_change();

-- ===== Offer lifecycle / modality config =====
ALTER TABLE public.supplier_offers
  ADD COLUMN IF NOT EXISTS ship_days int,
  ADD COLUMN IF NOT EXISTS drop_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS mixed_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS submitted_by uuid,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason text;
ALTER TABLE public.supplier_offers ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE public.grade_compositions ADD COLUMN IF NOT EXISTS price numeric(12,2);

CREATE OR REPLACE FUNCTION public.track_offer_submission() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status = 'pending_review' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    NEW.submitted_by := auth.uid(); NEW.submitted_at := now();
  END IF;
  IF NEW.status = 'rejected' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status)
     AND coalesce(btrim(NEW.rejection_reason),'') = '' THEN
    RAISE EXCEPTION 'Informe o motivo da rejeição';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER t_offer_submission BEFORE INSERT OR UPDATE ON public.supplier_offers FOR EACH ROW EXECUTE FUNCTION track_offer_submission();

-- ===== Store slugs: normalized + reserved names =====
CREATE OR REPLACE FUNCTION public.is_reserved_slug(_slug text) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT lower(_slug) = ANY (ARRAY['www','admin','app','api','login','entrar','cadastro','criar-conta','mail','email','smtp','imap','pop','ftp','suporte','ajuda','help','checkout','pagamento','pagamentos','financeiro','bemmais','bemmaisdistribuidora','static','cdn','assets','img','media','dev','staging','test','painel','dashboard','loja','lojas','store','stores','status','blog','docs','auth','oauth','webhook','webhooks','ns1','ns2','root','sistema','fornecedor','fornecedores','academy'])
$$;
CREATE OR REPLACE FUNCTION public.normalize_store_slug() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.slug := trim(both '-' from regexp_replace(lower(NEW.slug), '[^a-z0-9-]+', '-', 'g'));
  NEW.slug := regexp_replace(NEW.slug, '-{2,}', '-', 'g');
  IF length(NEW.slug) < 3 OR length(NEW.slug) > 50 THEN RAISE EXCEPTION 'Endereço da loja deve ter entre 3 e 50 caracteres'; END IF;
  IF is_reserved_slug(NEW.slug) THEN RAISE EXCEPTION 'Endereço "%" é reservado', NEW.slug; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER t_store_slug BEFORE INSERT OR UPDATE OF slug ON public.stores FOR EACH ROW EXECUTE FUNCTION normalize_store_slug();

-- ===== Store domains =====
CREATE TABLE public.store_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  hostname text NOT NULL,
  type text NOT NULL CHECK (type IN ('platform_subdomain','custom_domain')),
  verification_status text NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending','verifying','active','error')),
  is_primary boolean NOT NULL DEFAULT false,
  verification_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_error text,
  verified_at timestamptz,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX store_domains_hostname_uq ON public.store_domains (lower(hostname));
CREATE UNIQUE INDEX store_domains_primary_uq ON public.store_domains (store_id) WHERE is_primary;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_domains TO authenticated;
GRANT ALL ON public.store_domains TO service_role;
ALTER TABLE public.store_domains ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sd read" ON public.store_domains FOR SELECT TO authenticated USING (is_org_member(auth.uid(), organization_id) OR is_platform_admin(auth.uid()));
CREATE POLICY "sd write" ON public.store_domains FOR ALL TO authenticated USING (has_org_permission(auth.uid(), organization_id, 'stores.manage')) WITH CHECK (has_org_permission(auth.uid(), organization_id, 'stores.manage'));

CREATE OR REPLACE FUNCTION public.guard_store_domain() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s stores;
BEGIN
  SELECT * INTO s FROM stores WHERE id = NEW.store_id;
  NEW.organization_id := s.organization_id;
  NEW.hostname := lower(btrim(NEW.hostname));
  IF NEW.hostname !~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$' THEN RAISE EXCEPTION 'Domínio inválido'; END IF;
  IF NEW.type = 'platform_subdomain' AND is_reserved_slug(split_part(NEW.hostname,'.',1)) THEN
    RAISE EXCEPTION 'Subdomínio reservado';
  END IF;
  IF auth.uid() IS NOT NULL AND NOT is_platform_admin(auth.uid()) THEN
    IF NEW.verification_status = 'active' AND (TG_OP = 'INSERT' OR OLD.verification_status IS DISTINCT FROM 'active') THEN
      RAISE EXCEPTION 'Somente a BemMais ativa domínios';
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.hostname IS DISTINCT FROM OLD.hostname THEN RAISE EXCEPTION 'Hostname não pode ser alterado'; END IF;
  END IF;
  IF NEW.verification_status = 'active' AND NEW.verified_at IS NULL THEN NEW.verified_at := now(); END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER t_sd_guard BEFORE INSERT OR UPDATE ON public.store_domains FOR EACH ROW EXECUTE FUNCTION guard_store_domain();
CREATE TRIGGER t_sd_updated BEFORE UPDATE ON public.store_domains FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER t_sd_audit AFTER INSERT OR UPDATE OR DELETE ON public.store_domains FOR EACH ROW EXECUTE FUNCTION audit_row_change();

-- ===== Supplier RPCs (platform only) =====
CREATE OR REPLACE FUNCTION public.is_supplier_org(_org uuid) RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM organization_capabilities WHERE organization_id=_org AND capability='supply_products' AND enabled)
$$;

CREATE OR REPLACE FUNCTION public.admin_supplier_stats()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE res jsonb;
BEGIN
  IF NOT is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  WITH s AS (
    SELECT o.id, o.status, o.document, o.email, o.whatsapp, r.relationship_status, p.modalities, p.payout_method,
      EXISTS(SELECT 1 FROM supplier_offers x WHERE x.organization_id=o.id) AS has_products,
      EXISTS(SELECT 1 FROM supplier_offers x WHERE x.organization_id=o.id AND x.status='active') AS has_active_offers,
      EXISTS(SELECT 1 FROM inventory_balances b WHERE b.organization_id=o.id AND b.on_hand - b.reserved > 0) AS has_stock,
      EXISTS(SELECT 1 FROM payment_accounts a WHERE a.organization_id=o.id AND a.status='active') AS has_account,
      EXISTS(SELECT 1 FROM customer_followups f WHERE f.organization_id=o.id AND f.status='open' AND f.due_at<current_date) AS late
    FROM organizations o
    LEFT JOIN supplier_relationships r ON r.organization_id=o.id
    LEFT JOIN supplier_profiles p ON p.organization_id=o.id
    WHERE NOT o.is_platform AND is_supplier_org(o.id))
  SELECT jsonb_build_object(
    'total', count(*),
    'active', count(*) FILTER (WHERE status='active'),
    'onboarding', count(*) FILTER (WHERE relationship_status='onboarding'),
    'with_products', count(*) FILTER (WHERE has_products),
    'with_active_offers', count(*) FILTER (WHERE has_active_offers),
    'drop', count(*) FILTER (WHERE 'drop' = ANY(coalesce(modalities,'{}'))),
    'with_stock', count(*) FILTER (WHERE has_stock),
    'pending', count(*) FILTER (WHERE late OR NOT has_account OR document IS NULL OR (email IS NULL AND whatsapp IS NULL))
  ) INTO res FROM s;
  RETURN res;
END $$;

CREATE OR REPLACE FUNCTION public.admin_supplier_list(
  _q text DEFAULT NULL, _status text DEFAULT NULL, _type text DEFAULT NULL, _state text DEFAULT NULL,
  _manager uuid DEFAULT NULL, _relationship text DEFAULT NULL, _capability text DEFAULT NULL,
  _modality text DEFAULT NULL, _has_products boolean DEFAULT NULL, _has_offers boolean DEFAULT NULL,
  _has_store boolean DEFAULT NULL, _tag uuid DEFAULT NULL, _from date DEFAULT NULL, _to date DEFAULT NULL,
  _page int DEFAULT 1, _size int DEFAULT 24)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE res jsonb; qd text;
BEGIN
  IF NOT is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  qd := nullif(regexp_replace(coalesce(_q,''),'\D','','g'),'');
  WITH base AS (
    SELECT o.id,o.name,o.legal_name,o.document,o.email,o.whatsapp,o.phone,o.city,o.state,o.status,o.logo_url,o.created_at,
      p.supplier_type, coalesce(p.modalities,'{}') AS modalities, r.relationship_status,
      coalesce(r.account_manager_id,o.account_manager_id) AS manager_id,
      (SELECT pr.full_name FROM profiles pr WHERE pr.id=coalesce(r.account_manager_id,o.account_manager_id)) AS manager_name,
      (SELECT coalesce(array_agg(c.capability::text),'{}') FROM organization_capabilities c WHERE c.organization_id=o.id AND c.enabled) AS caps,
      (SELECT count(DISTINCT x.product_id) FROM supplier_offers x WHERE x.organization_id=o.id) AS products_count,
      (SELECT count(*) FROM supplier_offers x WHERE x.organization_id=o.id) AS offers_count,
      (SELECT count(*) FROM supplier_offers x WHERE x.organization_id=o.id AND x.status='active') AS offers_active,
      (SELECT count(*) FROM stores s WHERE s.organization_id=o.id) AS stores_count,
      greatest(o.updated_at,
        (SELECT max(a.occurred_at) FROM audit_logs a WHERE a.organization_id=o.id),
        (SELECT max(i.occurred_at) FROM customer_interactions i WHERE i.organization_id=o.id)) AS last_activity
    FROM organizations o
    LEFT JOIN supplier_profiles p ON p.organization_id=o.id
    LEFT JOIN supplier_relationships r ON r.organization_id=o.id
    WHERE NOT o.is_platform AND is_supplier_org(o.id)
  ), f AS (
    SELECT * FROM base b WHERE
      (_q IS NULL OR _q='' OR b.name ILIKE '%'||_q||'%' OR b.legal_name ILIKE '%'||_q||'%' OR b.email ILIKE '%'||_q||'%' OR b.city ILIKE '%'||_q||'%'
        OR (qd IS NOT NULL AND (regexp_replace(coalesce(b.document,''),'\D','','g') LIKE '%'||qd||'%'
          OR regexp_replace(coalesce(b.whatsapp,'')||coalesce(b.phone,''),'\D','','g') LIKE '%'||qd||'%')))
      AND (_status IS NULL OR b.status::text=_status)
      AND (_type IS NULL OR b.supplier_type=_type)
      AND (_state IS NULL OR b.state=_state)
      AND (_manager IS NULL OR b.manager_id=_manager)
      AND (_relationship IS NULL OR coalesce(b.relationship_status,'prospeccao')=_relationship)
      AND (_capability IS NULL OR _capability = ANY(b.caps))
      AND (_modality IS NULL OR _modality = ANY(b.modalities::text[]))
      AND (_has_products IS NULL OR (b.products_count>0)=_has_products)
      AND (_has_offers IS NULL OR (b.offers_active>0)=_has_offers)
      AND (_has_store IS NULL OR (b.stores_count>0)=_has_store)
      AND (_tag IS NULL OR EXISTS (SELECT 1 FROM organization_tag_links l WHERE l.organization_id=b.id AND l.tag_id=_tag))
      AND (_from IS NULL OR b.created_at::date>=_from)
      AND (_to IS NULL OR b.created_at::date<=_to)
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM f),
    'rows', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM f ORDER BY created_at DESC
      OFFSET greatest(_page-1,0)*_size LIMIT least(_size,100)) x),'[]'::jsonb)
  ) INTO res;
  RETURN res;
END $$;

CREATE OR REPLACE FUNCTION public.supplier_360(_org uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE o organizations; res jsonb;
BEGIN
  IF NOT is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO o FROM organizations WHERE id=_org AND NOT is_platform;
  IF o.id IS NULL THEN RETURN NULL; END IF;
  SELECT jsonb_build_object(
    'profile', (SELECT to_jsonb(p) FROM supplier_profiles p WHERE p.organization_id=_org),
    'relationship', (SELECT to_jsonb(r) || jsonb_build_object('manager_name',(SELECT full_name FROM profiles WHERE id=r.account_manager_id))
                     FROM supplier_relationships r WHERE r.organization_id=_org),
    'categories', coalesce((SELECT jsonb_agg(c.name ORDER BY c.name) FROM categories c
                     WHERE c.id = ANY(coalesce((SELECT category_ids FROM supplier_profiles WHERE organization_id=_org),'{}'))),'[]'::jsonb),
    'operation', jsonb_build_object(
      'products', (SELECT count(DISTINCT product_id) FROM supplier_offers WHERE organization_id=_org),
      'skus', (SELECT count(*) FROM supplier_offer_variants WHERE organization_id=_org),
      'offers', (SELECT count(*) FROM supplier_offers WHERE organization_id=_org),
      'offers_active', (SELECT count(*) FROM supplier_offers WHERE organization_id=_org AND status='active'),
      'offers_pending', (SELECT count(*) FROM supplier_offers WHERE organization_id=_org AND status='pending_review'),
      'offers_rejected', (SELECT count(*) FROM supplier_offers WHERE organization_id=_org AND status='rejected'),
      'on_hand', coalesce((SELECT sum(on_hand) FROM inventory_balances WHERE organization_id=_org),0),
      'reserved', coalesce((SELECT sum(reserved) FROM inventory_balances WHERE organization_id=_org),0),
      'negative_skus', (SELECT count(*) FROM inventory_balances WHERE organization_id=_org AND on_hand - reserved < 0),
      'stores', (SELECT count(*) FROM stores WHERE organization_id=_org)),
    'finance', jsonb_build_object(
      'active_accounts', (SELECT count(*) FROM payment_accounts WHERE organization_id=_org AND status='active'),
      'accounts', (SELECT count(*) FROM payment_accounts WHERE organization_id=_org),
      'receivables_open', coalesce((SELECT sum(amount) FROM receivables WHERE organization_id=_org AND status IN ('pending','available')),0),
      'payouts_pending', coalesce((SELECT sum(amount) FROM payouts WHERE organization_id=_org AND status IN ('pending','processing')),0),
      'payouts_paid', coalesce((SELECT sum(amount) FROM payouts WHERE organization_id=_org AND status='paid'),0)),
    'access', jsonb_build_object(
      'members', (SELECT count(*) FROM organization_members WHERE organization_id=_org AND status='active'),
      'invites_pending', (SELECT count(*) FROM organization_invitations WHERE organization_id=_org AND status='pending'),
      'last_sign_in', (SELECT max(u.last_sign_in_at) FROM organization_members m JOIN auth.users u ON u.id=m.user_id WHERE m.organization_id=_org)),
    'last_activity', greatest(o.updated_at, (SELECT max(occurred_at) FROM audit_logs WHERE organization_id=_org))
  ) INTO res;
  RETURN res;
END $$;

CREATE OR REPLACE FUNCTION public.admin_supplier_queues()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE res jsonb;
BEGIN
  IF NOT is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT jsonb_build_object(
    'onboarding', coalesce((SELECT jsonb_agg(x) FROM (
      SELECT o.id,o.name FROM supplier_relationships r JOIN organizations o ON o.id=r.organization_id
      WHERE r.relationship_status='onboarding' ORDER BY r.updated_at LIMIT 50) x),'[]'::jsonb),
    'offers_pending', coalesce((SELECT jsonb_agg(x) FROM (
      SELECT o.id,o.name,p.name AS detail FROM supplier_offers s JOIN organizations o ON o.id=s.organization_id JOIN products p ON p.id=s.product_id
      WHERE s.status='pending_review' ORDER BY s.submitted_at NULLS LAST LIMIT 50) x),'[]'::jsonb),
    'no_payout', coalesce((SELECT jsonb_agg(x) FROM (
      SELECT o.id,o.name FROM organizations o WHERE NOT o.is_platform AND is_supplier_org(o.id) AND o.status='active'
      AND NOT EXISTS (SELECT 1 FROM payment_accounts a WHERE a.organization_id=o.id AND a.status='active') ORDER BY o.name LIMIT 50) x),'[]'::jsonb),
    'stock_issues', coalesce((SELECT jsonb_agg(x) FROM (
      SELECT o.id,o.name,v.sku AS detail FROM inventory_balances b JOIN organizations o ON o.id=b.organization_id JOIN product_variants v ON v.id=b.variant_id
      WHERE is_supplier_org(o.id) AND b.on_hand - b.reserved < 0 LIMIT 50) x),'[]'::jsonb),
    'followups_late', coalesce((SELECT jsonb_agg(x) FROM (
      SELECT o.id,o.name,f.title AS detail FROM customer_followups f JOIN organizations o ON o.id=f.organization_id
      WHERE is_supplier_org(o.id) AND f.status='open' AND f.due_at<current_date
      UNION ALL
      SELECT o.id,o.name,r.next_action FROM supplier_relationships r JOIN organizations o ON o.id=r.organization_id
      WHERE r.next_action IS NOT NULL AND r.next_action_at<current_date LIMIT 50) x),'[]'::jsonb),
    'incomplete', coalesce((SELECT jsonb_agg(x) FROM (
      SELECT o.id,o.name FROM organizations o WHERE NOT o.is_platform AND is_supplier_org(o.id)
      AND (o.document IS NULL OR (o.email IS NULL AND o.whatsapp IS NULL) OR NOT EXISTS (SELECT 1 FROM supplier_profiles p WHERE p.organization_id=o.id))
      ORDER BY o.created_at LIMIT 50) x),'[]'::jsonb)
  ) INTO res;
  RETURN res;
END $$;

DO $$ DECLARE fn text; BEGIN
  FOREACH fn IN ARRAY ARRAY['admin_supplier_stats()','supplier_360(uuid)','admin_supplier_queues()',
    'admin_supplier_list(text,text,text,text,uuid,text,text,text,boolean,boolean,boolean,uuid,date,date,int,int)']
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated, service_role', fn);
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.guard_supplier_profile() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_store_domain() FROM PUBLIC, anon, authenticated;
