-- Store Engine foundation. Public storefront data is explicitly separated from
-- operational data; supplier costs and private ledger records are never exposed.
ALTER TYPE public.store_status ADD VALUE IF NOT EXISTS 'ready';
ALTER TYPE public.store_status ADD VALUE IF NOT EXISTS 'published';

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS favicon_url text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS theme jsonb NOT NULL DEFAULT '{"primary":"#111111","secondary":"#ffffff","accent":"#e8641e","background":"#ffffff","surface":"#ffffff","text":"#161616","mutedText":"#6b7280","border":"#e5e7eb","radius":"medium","fontHeading":"sora","fontBody":"manrope","buttonStyle":"solid","cardStyle":"soft"}'::jsonb,
  ADD COLUMN IF NOT EXISTS storefront_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS seo jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.store_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  type text NOT NULL CHECK (type IN ('hero','banner','categories','featured_products','product_carousel','promotion','benefits','image_text','brands','whatsapp_cta','newsletter','footer')),
  position integer NOT NULL DEFAULT 0,
  is_enabled boolean NOT NULL DEFAULT true,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS store_sections_store_position_idx ON public.store_sections(store_id, position);
ALTER TABLE public.store_sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "store sections manage" ON public.store_sections FOR ALL TO authenticated
  USING (public.has_org_permission(auth.uid(), organization_id, 'stores.manage'))
  WITH CHECK (public.has_org_permission(auth.uid(), organization_id, 'stores.manage')
    AND EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.organization_id = store_sections.organization_id));
CREATE POLICY "store sections platform" ON public.store_sections FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_sections TO authenticated;
GRANT ALL ON public.store_sections TO service_role;

ALTER TABLE public.store_listings
  ADD COLUMN IF NOT EXISTS compare_at_price numeric(12,2),
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'visible' CHECK (visibility IN ('visible','hidden')),
  ADD COLUMN IF NOT EXISTS commercial_config jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS store_listings_public_idx ON public.store_listings(store_id, is_published, visibility, sort_order);

-- DomainProvider is intentionally an application boundary for a future
-- Cloudflare adapter. No DNS target or verification is invented here.
CREATE OR REPLACE FUNCTION public.public_storefront(_slug text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'store', jsonb_build_object('name',s.name,'slug',s.slug,'logo_url',s.logo_url,'description',s.description,'theme',s.theme,'whatsapp',s.whatsapp),
    'sections', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',x.id,'type',x.type,'config',x.config) ORDER BY x.position) FROM public.store_sections x WHERE x.store_id=s.id AND x.is_enabled),'[]'::jsonb),
    'listings', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',l.id,'retail_price',l.retail_price,'product',jsonb_build_object('name',p.name,'images',p.images)) ORDER BY l.sort_order) FROM public.store_listings l JOIN public.products p ON p.id=l.product_id WHERE l.store_id=s.id AND l.is_published AND l.visibility='visible' AND p.status IN ('approved','active')),'[]'::jsonb)
  ) INTO result FROM public.stores s WHERE s.slug=lower(btrim(_slug)) AND s.status='published';
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.public_storefront(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_storefront(text) TO anon, authenticated;
