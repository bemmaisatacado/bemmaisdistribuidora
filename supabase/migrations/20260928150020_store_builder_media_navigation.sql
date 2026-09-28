-- Public storefront media. Files are public read-only because storefront
-- images must be delivered without authentication; writes stay tenant-scoped.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('store-media', 'store-media', true, 5242880, ARRAY['image/jpeg','image/png','image/webp','image/gif','image/svg+xml'])
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "store media upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'store-media' AND (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
  AND EXISTS (SELECT 1 FROM public.stores s WHERE s.id::text = (storage.foldername(name))[1] AND (public.has_org_permission(auth.uid(), s.organization_id, 'stores.manage') OR public.is_platform_admin(auth.uid())))
);
CREATE POLICY "store media update" ON storage.objects FOR UPDATE TO authenticated USING (
  bucket_id = 'store-media' AND EXISTS (SELECT 1 FROM public.stores s WHERE s.id::text = (storage.foldername(name))[1] AND (public.has_org_permission(auth.uid(), s.organization_id, 'stores.manage') OR public.is_platform_admin(auth.uid())))
) WITH CHECK (bucket_id = 'store-media');
CREATE POLICY "store media delete" ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'store-media' AND EXISTS (SELECT 1 FROM public.stores s WHERE s.id::text = (storage.foldername(name))[1] AND (public.has_org_permission(auth.uid(), s.organization_id, 'stores.manage') OR public.is_platform_admin(auth.uid())))
);

CREATE TABLE IF NOT EXISTS public.store_navigation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  label text NOT NULL CHECK (length(label) BETWEEN 1 AND 80),
  kind text NOT NULL CHECK (kind IN ('home','catalog','category','collection','page','external')),
  target text NOT NULL DEFAULT '',
  position integer NOT NULL DEFAULT 0,
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS store_navigation_items_order_idx ON public.store_navigation_items(store_id, position);
ALTER TABLE public.store_navigation_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.store_navigation_items FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_navigation_items TO authenticated;
GRANT ALL ON public.store_navigation_items TO service_role;
CREATE POLICY "store navigation manage" ON public.store_navigation_items FOR ALL TO authenticated
  USING (public.has_org_permission(auth.uid(), organization_id, 'stores.manage') OR public.is_platform_admin(auth.uid()))
  WITH CHECK (public.has_org_permission(auth.uid(), organization_id, 'stores.manage') OR public.is_platform_admin(auth.uid()));
CREATE TRIGGER t_store_navigation_updated BEFORE UPDATE ON public.store_navigation_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_store_navigation_audit AFTER INSERT OR UPDATE OR DELETE ON public.store_navigation_items FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

CREATE OR REPLACE FUNCTION public.public_store_navigation(_slug text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'label', n.label, 'kind', n.kind, 'target', n.target) ORDER BY n.position), '[]'::jsonb)
  FROM public.stores s JOIN public.store_navigation_items n ON n.store_id = s.id
  WHERE s.slug = lower(btrim(_slug)) AND s.status = 'published' AND n.is_enabled
$$;
REVOKE ALL ON FUNCTION public.public_store_navigation(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_store_navigation(text) TO anon, authenticated;
