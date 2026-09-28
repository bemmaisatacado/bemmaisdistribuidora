-- Public storefront read APIs.  These functions are deliberately the only
-- anonymous read boundary for the catalogue: they expose sellable data, never
-- supplier offers, cost, internal margins, or operational inventory records.

-- Extend the lightweight home payload with only the fields required to link
-- into a public product page. The original function remains the home boundary.
CREATE OR REPLACE FUNCTION public.public_storefront(_slug text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'store', jsonb_build_object('name',s.name,'slug',s.slug,'logo_url',s.logo_url,'description',s.description,'theme',s.theme,'whatsapp',s.whatsapp),
    'sections', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',x.id,'type',x.type,'config',x.config) ORDER BY x.position) FROM public.store_sections x WHERE x.store_id=s.id AND x.is_enabled),'[]'::jsonb),
    'listings', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',l.id,'retail_price',l.retail_price,'compare_at_price',l.compare_at_price,'product',jsonb_build_object('name',p.name,'slug',p.slug,'images',p.images)) ORDER BY l.sort_order) FROM public.store_listings l JOIN public.products p ON p.id=l.product_id WHERE l.store_id=s.id AND l.is_published AND l.visibility='visible' AND l.retail_price IS NOT NULL AND p.status IN ('approved','active')),'[]'::jsonb)
  ) INTO result FROM public.stores s WHERE s.slug=lower(btrim(_slug)) AND s.status='published';
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.public_storefront_catalog(
  _slug text,
  _query text DEFAULT NULL,
  _category_slug text DEFAULT NULL,
  _page integer DEFAULT 1,
  _page_size integer DEFAULT 24
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  _store_id uuid;
  _page_safe integer := greatest(coalesce(_page, 1), 1);
  _size_safe integer := least(greatest(coalesce(_page_size, 24), 1), 48);
BEGIN
  SELECT id INTO _store_id
  FROM public.stores
  WHERE slug = lower(btrim(_slug)) AND status = 'published';

  IF _store_id IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN (
    WITH eligible AS (
      SELECT l.id, l.product_id, l.retail_price, l.compare_at_price, l.modality,
             l.sort_order, p.name, p.slug, p.images, p.description,
             c.name AS category_name, c.slug AS category_slug
      FROM public.store_listings l
      JOIN public.products p ON p.id = l.product_id
      LEFT JOIN public.categories c ON c.id = p.category_id AND c.is_active
      WHERE l.store_id = _store_id
        AND l.is_published
        AND l.visibility = 'visible'
        AND l.retail_price IS NOT NULL
        AND p.status IN ('approved', 'active')
        AND (_query IS NULL OR btrim(_query) = '' OR p.name ILIKE '%' || btrim(_query) || '%' OR p.slug ILIKE '%' || btrim(_query) || '%')
        AND (_category_slug IS NULL OR btrim(_category_slug) = '' OR c.slug = lower(btrim(_category_slug)))
    ), counted AS (
      SELECT *, count(*) OVER () AS total_count
      FROM eligible
    ), paged AS (
      SELECT * FROM counted
      ORDER BY sort_order, name, id
      OFFSET ((_page_safe - 1) * _size_safe) LIMIT _size_safe
    )
    SELECT jsonb_build_object(
      'page', _page_safe,
      'page_size', _size_safe,
      'total', coalesce((SELECT max(total_count) FROM paged), 0),
      'items', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'product_id', product_id, 'name', name, 'slug', slug,
        'images', images, 'description', description, 'retail_price', retail_price,
        'compare_at_price', compare_at_price, 'modality', modality,
        'category', CASE WHEN category_slug IS NULL THEN NULL ELSE jsonb_build_object('name', category_name, 'slug', category_slug) END
      ) ORDER BY sort_order, name, id) FROM paged), '[]'::jsonb)
    )
  );
END $$;

CREATE OR REPLACE FUNCTION public.public_storefront_product(_slug text, _product_slug text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  _store_id uuid;
BEGIN
  SELECT id INTO _store_id
  FROM public.stores
  WHERE slug = lower(btrim(_slug)) AND status = 'published';

  IF _store_id IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN (
    SELECT jsonb_build_object(
      'listing', jsonb_build_object(
        'id', l.id, 'retail_price', l.retail_price, 'compare_at_price', l.compare_at_price,
        'modality', l.modality, 'commercial_config', l.commercial_config
      ),
      'product', jsonb_build_object(
        'id', p.id, 'name', p.name, 'slug', p.slug, 'description', p.description,
        'images', p.images, 'category', CASE WHEN c.id IS NULL THEN NULL ELSE jsonb_build_object('name', c.name, 'slug', c.slug) END,
        'variants', coalesce((
          SELECT jsonb_agg(jsonb_build_object(
            'id', pv.id, 'sku', pv.sku, 'attributes', pv.attributes,
            'stock_controlled', stock.available_quantity IS NOT NULL,
            'available', coalesce(stock.available_quantity, 1) > 0,
            'available_quantity', CASE WHEN stock.available_quantity IS NULL THEN NULL ELSE greatest(stock.available_quantity, 0) END
          ) ORDER BY pv.sku)
          FROM public.product_variants pv
          LEFT JOIN LATERAL (
            SELECT b.on_hand - b.reserved AS available_quantity
            FROM public.supplier_offers so
            JOIN public.inventory_balances b ON b.organization_id = so.organization_id AND b.variant_id = pv.id
            WHERE so.id = l.offer_id
          ) stock ON true
          WHERE pv.product_id = p.id AND pv.is_active
        ), '[]'::jsonb)
      )
    )
    FROM public.store_listings l
    JOIN public.products p ON p.id = l.product_id
    LEFT JOIN public.categories c ON c.id = p.category_id AND c.is_active
    WHERE l.store_id = _store_id
      AND l.is_published
      AND l.visibility = 'visible'
      AND l.retail_price IS NOT NULL
      AND p.status IN ('approved', 'active')
      AND p.slug = lower(btrim(_product_slug))
    ORDER BY l.sort_order, l.created_at
    LIMIT 1
  );
END $$;

-- Rechecks each cart item in Postgres before an item is accepted or its
-- quantity is changed. It is intentionally read-only: checkout/order and
-- inventory reservation will be implemented in their own transactional flow.
CREATE OR REPLACE FUNCTION public.validate_storefront_cart(_slug text, _items jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE _store_id uuid;
BEGIN
  SELECT id INTO _store_id FROM public.stores WHERE slug = lower(btrim(_slug)) AND status = 'published';
  IF _store_id IS NULL OR jsonb_typeof(_items) <> 'array' THEN
    RETURN jsonb_build_object('items', '[]'::jsonb);
  END IF;

  RETURN jsonb_build_object('items', coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'listing_id', l.id, 'variant_id', pv.id, 'name', p.name,
      'unit_price', l.retail_price, 'requested_quantity', requested.quantity,
      'accepted_quantity', CASE
        WHEN stock.available_quantity IS NULL THEN requested.quantity
        ELSE least(requested.quantity, greatest(stock.available_quantity, 0))
      END,
      'available', stock.available_quantity IS NULL OR stock.available_quantity > 0
    ))
    FROM jsonb_array_elements(_items) raw
    CROSS JOIN LATERAL (
      SELECT greatest(1, least(coalesce((raw.value->>'quantity')::integer, 1), 999)) AS quantity
      WHERE coalesce(raw.value->>'listingId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND coalesce(raw.value->>'variantId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ) requested
    JOIN public.store_listings l ON l.id = (raw.value->>'listingId')::uuid
      AND l.store_id = _store_id AND l.is_published AND l.visibility = 'visible' AND l.retail_price IS NOT NULL
    JOIN public.products p ON p.id = l.product_id AND p.status IN ('approved', 'active')
    JOIN public.product_variants pv ON pv.id = (raw.value->>'variantId')::uuid AND pv.product_id = p.id AND pv.is_active
    LEFT JOIN LATERAL (
      SELECT b.on_hand - b.reserved AS available_quantity
      FROM public.supplier_offers so
      JOIN public.inventory_balances b ON b.organization_id = so.organization_id AND b.variant_id = pv.id
      WHERE so.id = l.offer_id
    ) stock ON true
  ), '[]'::jsonb));
END $$;

REVOKE ALL ON FUNCTION public.public_storefront_catalog(text, text, text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.public_storefront_product(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_storefront_cart(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_storefront_catalog(text, text, text, integer, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_storefront_product(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_storefront_cart(text, jsonb) TO anon, authenticated;
