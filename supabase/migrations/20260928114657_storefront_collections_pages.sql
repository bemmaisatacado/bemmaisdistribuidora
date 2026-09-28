-- Content entities belong to the same Store Engine. They are not separate
-- catalogues: collection items point to existing store listings.
CREATE TABLE IF NOT EXISTS public.store_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  image_url text,
  is_published boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(store_id, slug)
);
CREATE TABLE IF NOT EXISTS public.store_collection_items (
  collection_id uuid NOT NULL REFERENCES public.store_collections(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES public.store_listings(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  PRIMARY KEY(collection_id, listing_id)
);
CREATE INDEX IF NOT EXISTS store_collections_store_published_idx ON public.store_collections(store_id, is_published, sort_order);
CREATE INDEX IF NOT EXISTS store_collection_items_collection_idx ON public.store_collection_items(collection_id, sort_order);

CREATE TABLE IF NOT EXISTS public.store_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  title text NOT NULL,
  slug text NOT NULL,
  content text NOT NULL DEFAULT '',
  seo jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(store_id, slug)
);
CREATE INDEX IF NOT EXISTS store_pages_store_published_idx ON public.store_pages(store_id, is_published);

ALTER TABLE public.store_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_collection_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "store collections manage" ON public.store_collections FOR ALL TO authenticated
  USING (public.has_org_permission(auth.uid(), organization_id, 'stores.manage') OR public.is_platform_admin(auth.uid()))
  WITH CHECK (public.has_org_permission(auth.uid(), organization_id, 'stores.manage') OR public.is_platform_admin(auth.uid()));
CREATE POLICY "store collection items manage" ON public.store_collection_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.store_collections c WHERE c.id = collection_id AND (public.has_org_permission(auth.uid(), c.organization_id, 'stores.manage') OR public.is_platform_admin(auth.uid()))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.store_collections c JOIN public.store_listings l ON l.id = listing_id WHERE c.id = collection_id AND l.store_id = c.store_id AND (public.has_org_permission(auth.uid(), c.organization_id, 'stores.manage') OR public.is_platform_admin(auth.uid()))));
CREATE POLICY "store pages manage" ON public.store_pages FOR ALL TO authenticated
  USING (public.has_org_permission(auth.uid(), organization_id, 'stores.manage') OR public.is_platform_admin(auth.uid()))
  WITH CHECK (public.has_org_permission(auth.uid(), organization_id, 'stores.manage') OR public.is_platform_admin(auth.uid()));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_collections, public.store_collection_items, public.store_pages TO authenticated;
GRANT ALL ON public.store_collections, public.store_collection_items, public.store_pages TO service_role;

CREATE OR REPLACE FUNCTION public.public_storefront_page(_slug text, _page_slug text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object('title', pg.title, 'slug', pg.slug, 'content', pg.content, 'seo', pg.seo)
  FROM public.stores s JOIN public.store_pages pg ON pg.store_id = s.id
  WHERE s.slug = lower(btrim(_slug)) AND s.status = 'published'
    AND pg.slug = lower(btrim(_page_slug)) AND pg.is_published
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.public_storefront_collection(_slug text, _collection_slug text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object(
    'name', c.name, 'slug', c.slug, 'description', c.description, 'image_url', c.image_url,
    'items', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id', l.id, 'name', p.name, 'slug', p.slug, 'images', p.images,
      'retail_price', l.retail_price, 'compare_at_price', l.compare_at_price
    ) ORDER BY ci.sort_order, p.name) FROM public.store_collection_items ci
      JOIN public.store_listings l ON l.id = ci.listing_id
      JOIN public.products p ON p.id = l.product_id
      WHERE ci.collection_id = c.id AND l.store_id = s.id AND l.is_published AND l.visibility = 'visible'
        AND l.retail_price IS NOT NULL AND p.status IN ('approved', 'active')), '[]'::jsonb)
  ) FROM public.stores s JOIN public.store_collections c ON c.store_id = s.id
  WHERE s.slug = lower(btrim(_slug)) AND s.status = 'published'
    AND c.slug = lower(btrim(_collection_slug)) AND c.is_published
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.public_storefront_page(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.public_storefront_collection(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_storefront_page(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_storefront_collection(text, text) TO anon, authenticated;
