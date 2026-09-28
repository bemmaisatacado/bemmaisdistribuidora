-- Draft data remains in the normalized Store Engine tables. A published
-- snapshot is atomically replaced only by publish_store, so public visitors
-- never receive a partially edited builder state.
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS published_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS published_by uuid,
  ADD COLUMN IF NOT EXISTS published_revision integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS draft_revision integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.mark_store_draft_revision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE target uuid;
BEGIN
  -- NEW is not available on DELETE. Keeping the branches explicit makes this
  -- trigger safe for all Store Engine tables that participate in a draft.
  IF TG_OP = 'DELETE' THEN
    target := OLD.store_id;
    UPDATE public.stores SET draft_revision = draft_revision + 1 WHERE id = target;
    RETURN OLD;
  END IF;

  target := coalesce(NEW.store_id, NEW.id);
  UPDATE public.stores SET draft_revision = draft_revision + 1 WHERE id = target;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS t_store_draft_revision ON public.stores;
CREATE TRIGGER t_store_draft_revision AFTER UPDATE OF name,slug,logo_url,favicon_url,description,theme,seo,storefront_config ON public.stores FOR EACH ROW EXECUTE FUNCTION public.mark_store_draft_revision();
DROP TRIGGER IF EXISTS t_sections_draft_revision ON public.store_sections;
CREATE TRIGGER t_sections_draft_revision AFTER INSERT OR UPDATE OR DELETE ON public.store_sections FOR EACH ROW EXECUTE FUNCTION public.mark_store_draft_revision();
DROP TRIGGER IF EXISTS t_navigation_draft_revision ON public.store_navigation_items;
CREATE TRIGGER t_navigation_draft_revision AFTER INSERT OR UPDATE OR DELETE ON public.store_navigation_items FOR EACH ROW EXECUTE FUNCTION public.mark_store_draft_revision();
DROP TRIGGER IF EXISTS t_pages_draft_revision ON public.store_pages;
CREATE TRIGGER t_pages_draft_revision AFTER INSERT OR UPDATE OR DELETE ON public.store_pages FOR EACH ROW EXECUTE FUNCTION public.mark_store_draft_revision();

-- Store rows and navigation already participate in the central audit trail.
-- These additional entities are material storefront changes and must be
-- traceable when a saved draft is eventually published.
DROP TRIGGER IF EXISTS t_store_sections_audit ON public.store_sections;
CREATE TRIGGER t_store_sections_audit AFTER INSERT OR UPDATE OR DELETE ON public.store_sections FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
DROP TRIGGER IF EXISTS t_store_pages_audit ON public.store_pages;
CREATE TRIGGER t_store_pages_audit AFTER INSERT OR UPDATE OR DELETE ON public.store_pages FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

CREATE OR REPLACE FUNCTION public.store_draft_snapshot(_store_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object(
    'store', jsonb_build_object('name',s.name,'slug',s.slug,'logo_url',s.logo_url,'favicon_url',s.favicon_url,'description',s.description,'theme',s.theme,'seo',s.seo,'whatsapp',s.whatsapp),
    'sections',coalesce((SELECT jsonb_agg(jsonb_build_object('id',x.id,'type',x.type,'config',x.config) ORDER BY x.position) FROM public.store_sections x WHERE x.store_id=s.id AND x.is_enabled),'[]'::jsonb),
    'navigation',coalesce((SELECT jsonb_agg(jsonb_build_object('label',n.label,'kind',n.kind,'target',n.target) ORDER BY n.position) FROM public.store_navigation_items n WHERE n.store_id=s.id AND n.is_enabled),'[]'::jsonb),
    'listings',coalesce((SELECT jsonb_agg(jsonb_build_object('id',l.id,'retail_price',l.retail_price,'compare_at_price',l.compare_at_price,'product',jsonb_build_object('name',p.name,'slug',p.slug,'images',p.images)) ORDER BY l.sort_order) FROM public.store_listings l JOIN public.products p ON p.id=l.product_id WHERE l.store_id=s.id AND l.is_published AND l.visibility='visible' AND l.retail_price IS NOT NULL AND p.status IN ('approved','active')),'[]'::jsonb)
  ) FROM public.stores s WHERE s.id=_store_id
$$;

CREATE OR REPLACE FUNCTION public.publish_store(_store_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE s public.stores; snapshot jsonb; missing text[] := '{}';
BEGIN
  SELECT * INTO s FROM public.stores WHERE id=_store_id FOR UPDATE;
  IF s.id IS NULL THEN RAISE EXCEPTION 'Loja não encontrada'; END IF;
  IF NOT (public.is_platform_admin(auth.uid()) OR public.has_org_permission(auth.uid(),s.organization_id,'stores.manage')) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF nullif(btrim(s.name),'') IS NULL THEN missing:=array_append(missing,'Nome da loja'); END IF;
  IF nullif(btrim(s.slug),'') IS NULL THEN missing:=array_append(missing,'Slug'); END IF;
  IF s.logo_url IS NULL THEN missing:=array_append(missing,'Logo'); END IF;
  IF NOT EXISTS(SELECT 1 FROM public.store_domains d WHERE d.store_id=s.id AND d.type='platform_subdomain' AND d.status='active') THEN missing:=array_append(missing,'Subdomínio BemMais válido'); END IF;
  IF NOT EXISTS(SELECT 1 FROM public.store_listings l JOIN public.products p ON p.id=l.product_id WHERE l.store_id=s.id AND l.is_published AND l.visibility='visible' AND p.status IN ('approved','active')) THEN missing:=array_append(missing,'Produto publicado'); END IF;
  IF coalesce(array_length(missing,1),0)>0 THEN RAISE EXCEPTION 'Checklist incompleto: %',array_to_string(missing,', '); END IF;
  SELECT public.store_draft_snapshot(s.id) INTO snapshot;
  UPDATE public.stores SET status='published',published_snapshot=snapshot,published_at=now(),published_by=auth.uid(),published_revision=published_revision+1,draft_revision=published_revision+1 WHERE id=s.id;
  RETURN snapshot;
END $$;

CREATE OR REPLACE FUNCTION public.public_storefront(_slug text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT published_snapshot FROM public.stores WHERE slug=lower(btrim(_slug)) AND status='published' AND published_snapshot IS NOT NULL
$$;

CREATE OR REPLACE FUNCTION public.preview_storefront(_store_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE s public.stores; BEGIN SELECT * INTO s FROM public.stores WHERE id=_store_id; IF s.id IS NULL OR NOT (public.is_platform_admin(auth.uid()) OR public.has_org_permission(auth.uid(),s.organization_id,'stores.manage')) THEN RAISE EXCEPTION 'forbidden'; END IF; RETURN public.store_draft_snapshot(_store_id); END $$;
REVOKE ALL ON FUNCTION public.store_draft_snapshot(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.publish_store(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.preview_storefront(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_store(uuid),public.preview_storefront(uuid) TO authenticated;
