-- Hostnames are the source of truth for public store resolution. No DNS
-- destination is created here; provisioning belongs to a future provider.
ALTER TABLE public.store_domains
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending_configuration'
    CHECK (status IN ('pending_configuration','pending_verification','active','error','disabled')),
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS provider_reference text;

UPDATE public.store_domains
SET status = CASE
  WHEN type = 'platform_subdomain' THEN 'active'
  WHEN verification_status = 'active' THEN 'active'
  WHEN verification_status = 'error' THEN 'error'
  ELSE 'pending_configuration'
END;

CREATE OR REPLACE FUNCTION public.normalize_hostname(_value text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
DECLARE value text := lower(btrim(coalesce(_value, '')));
BEGIN
  value := regexp_replace(value, '^https?://', '');
  value := split_part(value, '/', 1);
  value := split_part(value, '?', 1);
  value := split_part(value, '#', 1);
  value := regexp_replace(value, '\.+$', '');
  IF value ~ ':[0-9]+$' THEN value := regexp_replace(value, ':[0-9]+$', ''); END IF;
  IF value = '' OR value LIKE '%@%' OR value LIKE '%:%' THEN
    RAISE EXCEPTION 'Hostname inválido';
  END IF;
  IF value !~ '^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$' THEN
    RAISE EXCEPTION 'Hostname inválido';
  END IF;
  RETURN value;
END $$;

CREATE OR REPLACE FUNCTION public.is_reserved_slug(_slug text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT lower(btrim(_slug)) = ANY (ARRAY[
    'www','admin','app','api','login','auth','mail','email','smtp','ftp','cdn','assets','static','storage','status','support','suporte','financeiro','checkout','pagamento','payments','webhook','webhooks','bemmais',
    'entrar','cadastro','criar-conta','imap','pop','ajuda','help','pagamentos','bemmaisdistribuidora','img','media','dev','staging','test','painel','dashboard','loja','lojas','store','stores','blog','docs','oauth','ns1','ns2','root','sistema','fornecedor','fornecedores','academy'
  ])
$$;

CREATE OR REPLACE FUNCTION public.guard_store_domain()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE s public.stores; platform_suffix constant text := '.bemmaisdistribuidora.com.br';
BEGIN
  SELECT * INTO s FROM public.stores WHERE id = NEW.store_id;
  IF s.id IS NULL THEN RAISE EXCEPTION 'Loja não encontrada'; END IF;
  NEW.organization_id := s.organization_id;
  NEW.hostname := public.normalize_hostname(NEW.hostname);
  IF NEW.type = 'platform_subdomain' THEN
    IF NEW.hostname <> s.slug || platform_suffix OR public.is_reserved_slug(split_part(NEW.hostname, '.', 1)) THEN
      RAISE EXCEPTION 'O subdomínio deve usar o slug seguro da loja';
    END IF;
    NEW.status := 'active'; NEW.verification_status := 'active'; NEW.verified_at := coalesce(NEW.verified_at, now());
  ELSE
    IF NEW.hostname LIKE '%.' || 'bemmaisdistribuidora.com.br' THEN RAISE EXCEPTION 'Use PLATFORM_SUBDOMAIN para endereços BemMais'; END IF;
    IF TG_OP = 'INSERT' THEN
      NEW.status := 'pending_configuration'; NEW.verification_status := 'pending'; NEW.verified_at := NULL; NEW.provider := NULL; NEW.provider_reference := NULL; NEW.verification_data := '{}'::jsonb;
    ELSIF auth.uid() IS NOT NULL AND (NEW.status IS DISTINCT FROM OLD.status OR NEW.verification_status IS DISTINCT FROM OLD.verification_status OR NEW.verified_at IS DISTINCT FROM OLD.verified_at OR NEW.provider IS DISTINCT FROM OLD.provider OR NEW.provider_reference IS DISTINCT FROM OLD.provider_reference) THEN
      RAISE EXCEPTION 'A verificação de domínio depende da infraestrutura BemMais';
    END IF;
    IF NEW.status = 'active' AND (NEW.verification_status <> 'active' OR NEW.verified_at IS NULL OR nullif(NEW.provider, '') IS NULL) THEN
      RAISE EXCEPTION 'Domínio personalizado não pode ficar ativo sem verificação do provider';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.hostname IS DISTINCT FROM OLD.hostname THEN RAISE EXCEPTION 'Hostname não pode ser alterado; cadastre outro domínio'; END IF;
  IF NEW.is_primary AND NEW.status <> 'active' THEN RAISE EXCEPTION 'Somente domínio ativo pode ser principal'; END IF;
  RETURN NEW;
END $$;

-- Stores always receive exactly one controlled platform hostname. Existing
-- stores are backfilled without inventing custom-domain verification.
CREATE OR REPLACE FUNCTION public.ensure_platform_store_domain()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  INSERT INTO public.store_domains (store_id, organization_id, hostname, type, status, verification_status, is_primary)
  VALUES (NEW.id, NEW.organization_id, NEW.slug || '.bemmaisdistribuidora.com.br', 'platform_subdomain', 'active', 'active', true)
  ON CONFLICT (store_id) WHERE (is_primary) DO NOTHING;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS t_store_platform_domain ON public.stores;
CREATE TRIGGER t_store_platform_domain AFTER INSERT ON public.stores FOR EACH ROW EXECUTE FUNCTION public.ensure_platform_store_domain();

INSERT INTO public.store_domains (store_id, organization_id, hostname, type, status, verification_status, is_primary)
SELECT s.id, s.organization_id, s.slug || '.bemmaisdistribuidora.com.br', 'platform_subdomain', 'active', 'active',
  NOT EXISTS (SELECT 1 FROM public.store_domains d WHERE d.store_id = s.id AND d.is_primary)
FROM public.stores s
WHERE NOT EXISTS (SELECT 1 FROM public.store_domains d WHERE d.store_id = s.id AND d.type = 'platform_subdomain');

CREATE OR REPLACE FUNCTION public.normalize_store_slug()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  NEW.slug := trim(both '-' from regexp_replace(lower(NEW.slug), '[^a-z0-9-]+', '-', 'g'));
  NEW.slug := regexp_replace(NEW.slug, '-{2,}', '-', 'g');
  IF length(NEW.slug) < 3 OR length(NEW.slug) > 50 THEN RAISE EXCEPTION 'Endereço da loja deve ter entre 3 e 50 caracteres'; END IF;
  IF public.is_reserved_slug(NEW.slug) THEN RAISE EXCEPTION 'Endereço "%" é reservado', NEW.slug; END IF;
  IF TG_OP = 'UPDATE' AND NEW.slug IS DISTINCT FROM OLD.slug AND OLD.status = 'published' AND current_setting('app.slug_change_confirmed', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'Alteração de slug publicado exige confirmação administrativa';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.change_store_slug(_store_id uuid, _slug text, _confirmed boolean DEFAULT false)
RETURNS public.stores LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE s public.stores; result public.stores;
BEGIN
  SELECT * INTO s FROM public.stores WHERE id = _store_id FOR UPDATE;
  IF s.id IS NULL THEN RAISE EXCEPTION 'Loja não encontrada'; END IF;
  IF NOT (public.is_platform_admin(auth.uid()) OR public.has_org_permission(auth.uid(), s.organization_id, 'stores.manage')) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF s.status = 'published' AND NOT _confirmed THEN RAISE EXCEPTION 'Confirme a alteração do endereço publicado'; END IF;
  PERFORM set_config('app.slug_change_confirmed', CASE WHEN _confirmed THEN 'true' ELSE 'false' END, true);
  UPDATE public.stores SET slug = _slug WHERE id = _store_id RETURNING * INTO result;
  UPDATE public.store_domains SET hostname = result.slug || '.bemmaisdistribuidora.com.br'
    WHERE store_id = _store_id AND type = 'platform_subdomain';
  IF NOT FOUND THEN
    INSERT INTO public.store_domains (store_id, organization_id, hostname, type, status, verification_status, is_primary)
    VALUES (result.id, result.organization_id, result.slug || '.bemmaisdistribuidora.com.br', 'platform_subdomain', 'active', 'active',
      NOT EXISTS (SELECT 1 FROM public.store_domains WHERE store_id = _store_id AND is_primary));
  END IF;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.resolve_store_by_hostname(_hostname text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object(
    'store', jsonb_build_object('id', s.id, 'slug', s.slug, 'name', s.name, 'logo_url', s.logo_url, 'theme', s.theme, 'seo', s.seo),
    'domain', jsonb_build_object('hostname', d.hostname, 'type', d.type, 'is_primary', d.is_primary)
  )
  FROM public.store_domains d JOIN public.stores s ON s.id = d.store_id
  WHERE d.hostname = public.normalize_hostname(_hostname) AND d.status = 'active' AND s.status = 'published'
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.store_canonical_url(_store_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT 'https://' || d.hostname FROM public.store_domains d JOIN public.stores s ON s.id = d.store_id
  WHERE d.store_id = _store_id AND d.status = 'active' AND d.is_primary AND s.status = 'published'
  UNION ALL
  SELECT 'https://' || d.hostname FROM public.store_domains d JOIN public.stores s ON s.id = d.store_id
  WHERE d.store_id = _store_id AND d.type = 'platform_subdomain' AND d.status = 'active' AND s.status = 'published'
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.normalize_hostname(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.normalize_hostname(text) TO authenticated;
REVOKE ALL ON FUNCTION public.change_store_slug(uuid, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.change_store_slug(uuid, text, boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.resolve_store_by_hostname(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_store_by_hostname(text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.store_canonical_url(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.store_canonical_url(uuid) TO anon, authenticated;
