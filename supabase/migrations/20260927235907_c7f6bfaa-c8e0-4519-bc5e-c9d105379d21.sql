ALTER TYPE public.org_status ADD VALUE IF NOT EXISTS 'blocked';

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS person_type text NOT NULL DEFAULT 'pj',
  ADD COLUMN IF NOT EXISTS whatsapp text,
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS responsible_name text,
  ADD COLUMN IF NOT EXISTS responsible_email text,
  ADD COLUMN IF NOT EXISTS responsible_whatsapp text,
  ADD COLUMN IF NOT EXISTS responsible_document text,
  ADD COLUMN IF NOT EXISTS responsible_role text,
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS street text,
  ADD COLUMN IF NOT EXISTS street_number text,
  ADD COLUMN IF NOT EXISTS complement text,
  ADD COLUMN IF NOT EXISTS district text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT 'BR',
  ADD COLUMN IF NOT EXISTS account_manager_id uuid,
  ADD COLUMN IF NOT EXISTS origin text;
ALTER TABLE public.organizations ADD CONSTRAINT organizations_person_type_chk CHECK (person_type IN ('pf','pj'));
CREATE INDEX IF NOT EXISTS organizations_created_idx ON public.organizations(created_at DESC);

-- Guard critical identifiers
CREATE OR REPLACE FUNCTION public.guard_org_update() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.slug IS DISTINCT FROM OLD.slug THEN RAISE EXCEPTION 'O identificador (slug) da empresa não pode ser alterado.'; END IF;
  IF NEW.is_platform IS DISTINCT FROM OLD.is_platform THEN RAISE EXCEPTION 'Operação não permitida.'; END IF;
  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN RAISE EXCEPTION 'Operação não permitida.'; END IF;
  IF NOT public.is_platform_admin(auth.uid()) AND auth.uid() IS NOT NULL THEN
    IF NEW.document IS DISTINCT FROM OLD.document OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.account_manager_id IS DISTINCT FROM OLD.account_manager_id OR NEW.origin IS DISTINCT FROM OLD.origin THEN
      RAISE EXCEPTION 'Somente a equipe BemMais pode alterar CPF/CNPJ, status e dados internos.';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.guard_org_update() FROM anon, public, authenticated;
CREATE TRIGGER t_orgs_guard BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.guard_org_update();

CREATE OR REPLACE FUNCTION public.guard_member_role() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.role_key LIKE 'platform_%' AND NOT EXISTS (SELECT 1 FROM organizations WHERE id = NEW.organization_id AND is_platform) THEN
    RAISE EXCEPTION 'Papéis da plataforma só existem na organização BemMais.';
  END IF;
  IF NEW.role_key NOT LIKE 'platform_%' AND EXISTS (SELECT 1 FROM organizations WHERE id = NEW.organization_id AND is_platform) THEN
    RAISE EXCEPTION 'A organização BemMais só aceita papéis da plataforma.';
  END IF;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.guard_member_role() FROM anon, public, authenticated;
CREATE TRIGGER t_members_guard BEFORE INSERT OR UPDATE ON public.organization_members FOR EACH ROW EXECUTE FUNCTION public.guard_member_role();

-- Internal notes (platform only)
CREATE TABLE public.organization_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  author_id uuid DEFAULT auth.uid(),
  kind text NOT NULL DEFAULT 'general',
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_notes_body_len CHECK (char_length(body) BETWEEN 1 AND 4000),
  CONSTRAINT organization_notes_kind_chk CHECK (kind IN ('general','negotiation','pending','operational'))
);
CREATE INDEX organization_notes_org_idx ON public.organization_notes(organization_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_notes TO authenticated;
GRANT ALL ON public.organization_notes TO service_role;
ALTER TABLE public.organization_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notes platform read" ON public.organization_notes FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));
CREATE POLICY "notes platform insert" ON public.organization_notes FOR INSERT TO authenticated WITH CHECK (public.is_platform_admin(auth.uid()) AND author_id = auth.uid());
CREATE POLICY "notes author update" ON public.organization_notes FOR UPDATE TO authenticated USING (public.is_platform_admin(auth.uid()) AND author_id = auth.uid()) WITH CHECK (public.is_platform_admin(auth.uid()) AND author_id = auth.uid());
CREATE POLICY "notes author delete" ON public.organization_notes FOR DELETE TO authenticated USING (public.is_platform_admin(auth.uid()) AND author_id = auth.uid());
CREATE TRIGGER t_org_notes_updated BEFORE UPDATE ON public.organization_notes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER audit_organization_notes AFTER INSERT OR UPDATE OR DELETE ON public.organization_notes FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

-- Tags (platform only)
CREATE TABLE public.org_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  color text NOT NULL DEFAULT 'neutral',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT org_tags_name_len CHECK (char_length(name) BETWEEN 1 AND 40),
  CONSTRAINT org_tags_color_chk CHECK (color IN ('neutral','brand','ok','warn','bad','info'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_tags TO authenticated;
GRANT ALL ON public.org_tags TO service_role;
ALTER TABLE public.org_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tags platform" ON public.org_tags FOR ALL TO authenticated USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));
CREATE TRIGGER t_org_tags_updated BEFORE UPDATE ON public.org_tags FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER audit_org_tags AFTER INSERT OR UPDATE OR DELETE ON public.org_tags FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

CREATE TABLE public.organization_tag_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.org_tags(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, tag_id)
);
GRANT SELECT, INSERT, DELETE ON public.organization_tag_links TO authenticated;
GRANT ALL ON public.organization_tag_links TO service_role;
ALTER TABLE public.organization_tag_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tag links platform" ON public.organization_tag_links FOR ALL TO authenticated USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));
CREATE TRIGGER audit_organization_tag_links AFTER INSERT OR UPDATE OR DELETE ON public.organization_tag_links FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

INSERT INTO public.org_tags(name, color) VALUES ('VIP','brand'),('Novo','info'),('Alto volume','ok'),('Teste','neutral'),('Prioridade','warn');

-- Invitations log
CREATE TABLE public.organization_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  role_key text NOT NULL REFERENCES public.roles(key),
  user_id uuid,
  status text NOT NULL DEFAULT 'sent',
  invited_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_invitations_status_chk CHECK (status IN ('sent','accepted','revoked'))
);
CREATE INDEX organization_invitations_org_idx ON public.organization_invitations(organization_id, created_at DESC);
GRANT SELECT ON public.organization_invitations TO authenticated;
GRANT ALL ON public.organization_invitations TO service_role;
ALTER TABLE public.organization_invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invites read" ON public.organization_invitations FOR SELECT TO authenticated USING (public.has_org_permission(auth.uid(), organization_id, 'members.read'));
CREATE TRIGGER t_org_invites_updated BEFORE UPDATE ON public.organization_invitations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER audit_organization_invitations AFTER INSERT OR UPDATE OR DELETE ON public.organization_invitations FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

-- Invited members become active on their first authenticated session
CREATE OR REPLACE FUNCTION public.activate_my_invites() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  IF auth.uid() IS NULL THEN RETURN 0; END IF;
  UPDATE organization_members SET status = 'active' WHERE user_id = auth.uid() AND status = 'invited';
  GET DIAGNOSTICS n = ROW_COUNT;
  UPDATE organization_invitations SET status = 'accepted' WHERE user_id = auth.uid() AND status = 'sent';
  RETURN n;
END; $$;
REVOKE EXECUTE ON FUNCTION public.activate_my_invites() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.activate_my_invites() TO authenticated;

-- Service-only lookup used by the invite server function
CREATE OR REPLACE FUNCTION public.find_user_id_by_email(_email text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT id FROM auth.users WHERE lower(email) = lower(trim(_email)) LIMIT 1;
$$;
REVOKE EXECUTE ON FUNCTION public.find_user_id_by_email(text) FROM anon, public, authenticated;
GRANT EXECUTE ON FUNCTION public.find_user_id_by_email(text) TO service_role;

-- Member directory with email + last access
CREATE OR REPLACE FUNCTION public.org_member_directory(_org uuid)
RETURNS TABLE(member_id uuid, user_id uuid, full_name text, email text, role_key text, status text, created_at timestamptz, last_sign_in_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  IF NOT public.has_org_permission(auth.uid(), _org, 'members.read') THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY SELECT m.id, m.user_id, p.full_name, u.email::text, m.role_key, m.status, m.created_at, u.last_sign_in_at
    FROM organization_members m LEFT JOIN profiles p ON p.id = m.user_id LEFT JOIN auth.users u ON u.id = m.user_id
    WHERE m.organization_id = _org ORDER BY m.created_at;
END; $$;
REVOKE EXECUTE ON FUNCTION public.org_member_directory(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.org_member_directory(uuid) TO authenticated;

-- Platform team list (for "Responsável BemMais")
CREATE OR REPLACE FUNCTION public.platform_team()
RETURNS TABLE(user_id uuid, full_name text, email text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY SELECT m.user_id, p.full_name, u.email::text FROM organization_members m
    JOIN organizations o ON o.id = m.organization_id AND o.is_platform
    LEFT JOIN profiles p ON p.id = m.user_id LEFT JOIN auth.users u ON u.id = m.user_id
    WHERE m.status = 'active' ORDER BY p.full_name NULLS LAST;
END; $$;
REVOKE EXECUTE ON FUNCTION public.platform_team() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.platform_team() TO authenticated;

-- Header indicators
CREATE OR REPLACE FUNCTION public.admin_org_stats() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN jsonb_build_object(
    'total', (SELECT count(*) FROM organizations WHERE NOT is_platform),
    'active', (SELECT count(*) FROM organizations WHERE NOT is_platform AND status::text = 'active'),
    'pending', (SELECT count(*) FROM organizations WHERE NOT is_platform AND status::text = 'pending'),
    'suspended', (SELECT count(*) FROM organizations WHERE NOT is_platform AND status::text IN ('suspended','blocked')),
    'suppliers', (SELECT count(DISTINCT c.organization_id) FROM organization_capabilities c JOIN organizations o ON o.id = c.organization_id WHERE NOT o.is_platform AND c.enabled AND c.capability = 'supply_products'),
    'clients', (SELECT count(DISTINCT c.organization_id) FROM organization_capabilities c JOIN organizations o ON o.id = c.organization_id WHERE NOT o.is_platform AND c.enabled AND c.capability <> 'supply_products'),
    'with_active_store', (SELECT count(DISTINCT s.organization_id) FROM stores s JOIN organizations o ON o.id = s.organization_id WHERE NOT o.is_platform AND s.status = 'active')
  );
END; $$;
REVOKE EXECUTE ON FUNCTION public.admin_org_stats() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.admin_org_stats() TO authenticated;

-- Server-side search with combinable filters
CREATE OR REPLACE FUNCTION public.admin_search_organizations(
  _q text DEFAULT NULL, _status text DEFAULT NULL, _capability text DEFAULT NULL, _profile text DEFAULT NULL,
  _has_store boolean DEFAULT NULL, _has_products boolean DEFAULT NULL, _from date DEFAULT NULL, _to date DEFAULT NULL,
  _tag uuid DEFAULT NULL, _page integer DEFAULT 0, _size integer DEFAULT 20
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _res jsonb; _digits text; _like text;
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  _size := LEAST(GREATEST(COALESCE(_size, 20), 1), 100);
  _like := CASE WHEN NULLIF(trim(_q), '') IS NULL THEN NULL ELSE '%' || trim(_q) || '%' END;
  _digits := NULLIF(regexp_replace(COALESCE(_q, ''), '\D', '', 'g'), '');
  WITH base AS (
    SELECT o.* FROM organizations o
    WHERE NOT o.is_platform
      AND (_like IS NULL OR o.name ILIKE _like OR o.legal_name ILIKE _like OR o.email ILIKE _like OR o.slug ILIKE _like
           OR o.responsible_name ILIKE _like OR o.responsible_email ILIKE _like
           OR (_digits IS NOT NULL AND length(_digits) >= 3 AND (
                regexp_replace(COALESCE(o.document, ''), '\D', '', 'g') LIKE '%' || _digits || '%'
             OR regexp_replace(COALESCE(o.phone, ''), '\D', '', 'g') LIKE '%' || _digits || '%'
             OR regexp_replace(COALESCE(o.whatsapp, ''), '\D', '', 'g') LIKE '%' || _digits || '%')))
      AND (_status IS NULL OR o.status::text = _status)
      AND (_capability IS NULL OR EXISTS (SELECT 1 FROM organization_capabilities c WHERE c.organization_id = o.id AND c.enabled AND c.capability::text = _capability))
      AND (_profile IS NULL
           OR (_profile = 'supplier' AND EXISTS (SELECT 1 FROM organization_capabilities c WHERE c.organization_id = o.id AND c.enabled AND c.capability = 'supply_products'))
           OR (_profile = 'client' AND EXISTS (SELECT 1 FROM organization_capabilities c WHERE c.organization_id = o.id AND c.enabled AND c.capability <> 'supply_products'))
           OR (_profile = 'hybrid' AND EXISTS (SELECT 1 FROM organization_capabilities c WHERE c.organization_id = o.id AND c.enabled AND c.capability = 'supply_products')
                                   AND EXISTS (SELECT 1 FROM organization_capabilities c WHERE c.organization_id = o.id AND c.enabled AND c.capability <> 'supply_products'))
           OR (_profile = 'none' AND NOT EXISTS (SELECT 1 FROM organization_capabilities c WHERE c.organization_id = o.id AND c.enabled)))
      AND (_has_store IS NULL OR _has_store = EXISTS (SELECT 1 FROM stores s WHERE s.organization_id = o.id))
      AND (_has_products IS NULL OR _has_products = (EXISTS (SELECT 1 FROM products p WHERE p.owner_organization_id = o.id) OR EXISTS (SELECT 1 FROM supplier_offers so WHERE so.organization_id = o.id)))
      AND (_from IS NULL OR o.created_at >= _from)
      AND (_to IS NULL OR o.created_at < (_to + 1))
      AND (_tag IS NULL OR EXISTS (SELECT 1 FROM organization_tag_links l WHERE l.organization_id = o.id AND l.tag_id = _tag))
  ), paged AS (
    SELECT * FROM base ORDER BY created_at DESC OFFSET GREATEST(COALESCE(_page, 0), 0) * _size LIMIT _size
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM base),
    'rows', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', p.id, 'name', p.name, 'legal_name', p.legal_name, 'document', p.document, 'email', p.email, 'status', p.status,
      'person_type', p.person_type, 'logo_url', p.logo_url, 'city', p.city, 'state', p.state, 'created_at', p.created_at,
      'responsible_name', p.responsible_name,
      'capabilities', COALESCE((SELECT jsonb_agg(c.capability ORDER BY c.capability) FROM organization_capabilities c WHERE c.organization_id = p.id AND c.enabled), '[]'::jsonb),
      'tags', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color) ORDER BY t.name) FROM organization_tag_links l JOIN org_tags t ON t.id = l.tag_id WHERE l.organization_id = p.id), '[]'::jsonb),
      'stores', (SELECT count(*) FROM stores s WHERE s.organization_id = p.id),
      'members', (SELECT count(*) FROM organization_members m WHERE m.organization_id = p.id)
    ) ORDER BY p.created_at DESC) FROM paged p), '[]'::jsonb)
  ) INTO _res;
  RETURN _res;
END; $$;
REVOKE EXECUTE ON FUNCTION public.admin_search_organizations(text,text,text,text,boolean,boolean,date,date,uuid,integer,integer) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.admin_search_organizations(text,text,text,text,boolean,boolean,date,date,uuid,integer,integer) TO authenticated;

-- Per-organization summary (real numbers only)
CREATE OR REPLACE FUNCTION public.org_summary(_org uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.is_platform_admin(auth.uid()) OR public.is_org_member(auth.uid(), _org)) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN jsonb_build_object(
    'members', (SELECT count(*) FROM organization_members WHERE organization_id = _org AND status = 'active'),
    'members_invited', (SELECT count(*) FROM organization_members WHERE organization_id = _org AND status = 'invited'),
    'stores', (SELECT count(*) FROM stores WHERE organization_id = _org),
    'stores_active', (SELECT count(*) FROM stores WHERE organization_id = _org AND status = 'active'),
    'products', (SELECT count(*) FROM products WHERE owner_organization_id = _org),
    'offers', (SELECT count(*) FROM supplier_offers WHERE organization_id = _org),
    'offers_pending', (SELECT count(*) FROM supplier_offers WHERE organization_id = _org AND status = 'pending_review'),
    'gmv', (SELECT COALESCE(sum(amount), 0) FROM payments WHERE organization_id = _org AND status = 'paid'),
    'receivables_pending', (SELECT COALESCE(sum(amount), 0) FROM receivables WHERE organization_id = _org AND status IN ('pending','available')),
    'payouts_pending', (SELECT COALESCE(sum(amount), 0) FROM payouts WHERE organization_id = _org AND status IN ('pending','processing')),
    'payouts_paid', (SELECT COALESCE(sum(amount), 0) FROM payouts WHERE organization_id = _org AND status = 'paid'),
    'payment_accounts', (SELECT count(*) FROM payment_accounts WHERE organization_id = _org),
    'payment_accounts_active', (SELECT count(*) FROM payment_accounts WHERE organization_id = _org AND status = 'active')
  );
END; $$;
REVOKE EXECUTE ON FUNCTION public.org_summary(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.org_summary(uuid) TO authenticated;