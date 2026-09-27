CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TYPE public.org_status AS ENUM ('pending','active','suspended','archived');
CREATE TYPE public.org_capability AS ENUM ('supply_products','buy_wholesale','buy_mixed_wholesale','buy_closed_grade','use_dropshipping','sell_retail','sell_wholesale','operate_store');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text, avatar_url text, phone text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, slug text NOT NULL UNIQUE, legal_name text, document text,
  email text, phone text, status public.org_status NOT NULL DEFAULT 'active',
  is_platform boolean NOT NULL DEFAULT false,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX organizations_single_platform ON public.organizations (is_platform) WHERE is_platform;
CREATE INDEX organizations_status_idx ON public.organizations(status);
GRANT SELECT, INSERT, UPDATE ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.organization_capabilities (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  capability public.org_capability NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, capability)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_capabilities TO authenticated;
GRANT ALL ON public.organization_capabilities TO service_role;
ALTER TABLE public.organization_capabilities ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.roles (
  key text PRIMARY KEY, name text NOT NULL, description text,
  scope text NOT NULL DEFAULT 'organization' CHECK (scope IN ('platform','organization'))
);
CREATE TABLE public.permissions (key text PRIMARY KEY, description text);
CREATE TABLE public.role_permissions (
  role_key text NOT NULL REFERENCES public.roles(key) ON DELETE CASCADE,
  permission_key text NOT NULL REFERENCES public.permissions(key) ON DELETE CASCADE,
  PRIMARY KEY (role_key, permission_key)
);
GRANT SELECT ON public.roles, public.permissions, public.role_permissions TO authenticated;
GRANT ALL ON public.roles, public.permissions, public.role_permissions TO service_role;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_key text NOT NULL REFERENCES public.roles(key),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('invited','active','suspended')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);
CREATE INDEX organization_members_user_idx ON public.organization_members(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_members TO authenticated;
GRANT ALL ON public.organization_members TO service_role;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.audit_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid, organization_id uuid,
  action text NOT NULL, entity_type text NOT NULL, entity_id text,
  before_data jsonb, after_data jsonb
);
CREATE INDEX audit_logs_org_time_idx ON public.audit_logs(organization_id, occurred_at DESC);
CREATE INDEX audit_logs_entity_idx ON public.audit_logs(entity_type, entity_id);
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Helpers
CREATE OR REPLACE FUNCTION public.is_platform_admin(_uid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM organization_members m JOIN organizations o ON o.id = m.organization_id
    WHERE m.user_id = _uid AND m.status = 'active' AND o.is_platform AND m.role_key IN ('platform_super_admin','platform_admin'));
$$;
CREATE OR REPLACE FUNCTION public.is_org_member(_uid uuid, _org uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM organization_members WHERE user_id = _uid AND organization_id = _org AND status = 'active');
$$;
CREATE OR REPLACE FUNCTION public.has_org_permission(_uid uuid, _org uuid, _perm text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_platform_admin(_uid) OR EXISTS (
    SELECT 1 FROM organization_members m JOIN role_permissions rp ON rp.role_key = m.role_key
    WHERE m.user_id = _uid AND m.organization_id = _org AND m.status = 'active' AND rp.permission_key = _perm);
$$;
REVOKE EXECUTE ON FUNCTION public.is_platform_admin(uuid), public.is_org_member(uuid,uuid), public.has_org_permission(uuid,uuid,text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_platform_admin(uuid), public.is_org_member(uuid,uuid), public.has_org_permission(uuid,uuid,text) TO authenticated;

-- Policies
CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR public.is_platform_admin(auth.uid()));
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY "org read" ON public.organizations FOR SELECT TO authenticated USING (public.is_org_member(auth.uid(), id) OR public.is_platform_admin(auth.uid()));
CREATE POLICY "org insert admin" ON public.organizations FOR INSERT TO authenticated WITH CHECK (public.is_platform_admin(auth.uid()) AND NOT is_platform);
CREATE POLICY "org update" ON public.organizations FOR UPDATE TO authenticated USING (public.has_org_permission(auth.uid(), id, 'org.manage')) WITH CHECK (public.has_org_permission(auth.uid(), id, 'org.manage'));

CREATE POLICY "caps read" ON public.organization_capabilities FOR SELECT TO authenticated USING (public.is_org_member(auth.uid(), organization_id) OR public.is_platform_admin(auth.uid()));
CREATE POLICY "caps admin write" ON public.organization_capabilities FOR ALL TO authenticated USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE POLICY "catalog read roles" ON public.roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "catalog read perms" ON public.permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "catalog read role perms" ON public.role_permissions FOR SELECT TO authenticated USING (true);

CREATE POLICY "members read" ON public.organization_members FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_org_permission(auth.uid(), organization_id, 'members.read'));
CREATE POLICY "members manage" ON public.organization_members FOR ALL TO authenticated
  USING (public.has_org_permission(auth.uid(), organization_id, 'members.manage'))
  WITH CHECK (public.has_org_permission(auth.uid(), organization_id, 'members.manage')
    AND (role_key NOT LIKE 'platform_%' OR public.is_platform_admin(auth.uid())));

CREATE POLICY "audit read" ON public.audit_logs FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()) OR (organization_id IS NOT NULL AND public.has_org_permission(auth.uid(), organization_id, 'audit.read')));

-- Audit trigger (writes via definer; table itself is append-only for clients)
CREATE OR REPLACE FUNCTION public.audit_row_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _org uuid; _row jsonb;
BEGIN
  _row := to_jsonb(COALESCE(NEW, OLD));
  _org := CASE WHEN TG_TABLE_NAME = 'organizations' THEN (_row->>'id')::uuid ELSE (_row->>'organization_id')::uuid END;
  INSERT INTO audit_logs(actor_id, organization_id, action, entity_type, entity_id, before_data, after_data)
  VALUES (auth.uid(), _org, lower(TG_OP), TG_TABLE_NAME, COALESCE(_row->>'id', _row->>'capability'),
    CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END, CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END);
  RETURN COALESCE(NEW, OLD);
END; $$;
REVOKE EXECUTE ON FUNCTION public.audit_row_change() FROM anon, public, authenticated;

CREATE TRIGGER audit_organizations AFTER INSERT OR UPDATE OR DELETE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
CREATE TRIGGER audit_members AFTER INSERT OR UPDATE OR DELETE ON public.organization_members FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
CREATE TRIGGER audit_caps AFTER INSERT OR UPDATE OR DELETE ON public.organization_capabilities FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

CREATE TRIGGER t_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_orgs_updated BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_members_updated BEFORE UPDATE ON public.organization_members FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seeds
INSERT INTO public.roles(key,name,description,scope) VALUES
 ('platform_super_admin','Super Admin','Controle total da plataforma','platform'),
 ('platform_admin','Admin BemMais','Administra a plataforma','platform'),
 ('org_owner','Proprietário','Dono da organização','organization'),
 ('org_manager','Gerente','Gerencia a organização','organization'),
 ('org_operator','Operador','Opera o dia a dia','organization'),
 ('org_viewer','Visualizador','Apenas leitura','organization');
INSERT INTO public.permissions(key,description) VALUES
 ('org.manage','Editar dados da organização'),('members.read','Ver membros'),('members.manage','Gerenciar membros'),
 ('audit.read','Ver auditoria'),('catalog.manage','Gerenciar catálogo'),('stores.manage','Gerenciar lojas'),
 ('finance.read','Ver financeiro'),('finance.manage','Gerenciar financeiro');
INSERT INTO public.role_permissions(role_key, permission_key)
 SELECT 'org_owner', key FROM public.permissions
 UNION ALL SELECT 'org_manager', unnest(ARRAY['org.manage','members.read','members.manage','catalog.manage','stores.manage','finance.read'])
 UNION ALL SELECT 'org_operator', unnest(ARRAY['members.read','catalog.manage'])
 UNION ALL SELECT 'org_viewer', 'members.read';

INSERT INTO public.organizations(name, slug, legal_name, is_platform) VALUES ('BemMais Distribuidora','bemmais','BemMais Distribuidora', true);

-- New user: profile + first user bootstraps as Super Admin
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _platform uuid;
BEGIN
  INSERT INTO profiles(id, full_name) VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name') ON CONFLICT DO NOTHING;
  SELECT id INTO _platform FROM organizations WHERE is_platform LIMIT 1;
  IF _platform IS NOT NULL AND NOT EXISTS (SELECT 1 FROM organization_members WHERE organization_id = _platform AND role_key = 'platform_super_admin') THEN
    INSERT INTO organization_members(organization_id, user_id, role_key) VALUES (_platform, NEW.id, 'platform_super_admin');
  END IF;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, public, authenticated;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();