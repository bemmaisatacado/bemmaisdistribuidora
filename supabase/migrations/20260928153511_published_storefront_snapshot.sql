-- A public store is a versioned projection. Presentation and commercial
-- content are copied on publish; operational checks remain live in the cart.
CREATE OR REPLACE FUNCTION public.store_draft_snapshot(_store_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object(
    'store', jsonb_build_object(
      'id', s.id, 'name', s.name, 'slug', s.slug, 'logo_url', s.logo_url,
      'favicon_url', s.favicon_url, 'description', s.description, 'theme', s.theme,
      'seo', s.seo, 'whatsapp', s.whatsapp,
      'canonical_url', coalesce((
        SELECT 'https://' || d.hostname FROM public.store_domains d
        WHERE d.store_id = s.id AND d.status = 'active'
        ORDER BY d.is_primary DESC, (d.type = 'platform_subdomain') DESC, d.created_at
        LIMIT 1
      ), 'https://' || s.slug || '.bemmaisdistribuidora.com.br')
    ),
    'sections', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', x.id, 'type', x.type, 'config', x.config) ORDER BY x.position)
      FROM public.store_sections x WHERE x.store_id = s.id AND x.is_enabled
    ), '[]'::jsonb),
    'navigation', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', n.id, 'label', n.label, 'kind', n.kind, 'target', n.target, 'position', n.position) ORDER BY n.position)
      FROM public.store_navigation_items n WHERE n.store_id = s.id AND n.is_enabled
    ), '[]'::jsonb),
    'listings', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', l.id, 'product_id', p.id, 'retail_price', l.retail_price,
        'compare_at_price', l.compare_at_price, 'modality', l.modality,
        'commercial_config', l.commercial_config, 'sort_order', l.sort_order,
        'product', jsonb_build_object(
          'id', p.id, 'name', p.name, 'slug', p.slug, 'description', p.description,
          'images', p.images,
          'category', case when c.id is null then null else jsonb_build_object('name', c.name, 'slug', c.slug) end,
          'variants', coalesce((
            SELECT jsonb_agg(jsonb_build_object('id', pv.id, 'sku', pv.sku, 'attributes', pv.attributes) ORDER BY pv.sku)
            FROM public.product_variants pv WHERE pv.product_id = p.id AND pv.is_active
          ), '[]'::jsonb)
        )
      ) ORDER BY l.sort_order, p.name, l.id)
      FROM public.store_listings l
      JOIN public.products p ON p.id = l.product_id
      LEFT JOIN public.categories c ON c.id = p.category_id AND c.is_active
      WHERE l.store_id = s.id AND l.is_published AND l.visibility = 'visible'
        AND l.retail_price IS NOT NULL AND p.status IN ('approved', 'active')
    ), '[]'::jsonb),
    'collections', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'name', c.name, 'slug', c.slug, 'description', c.description,
        'image_url', c.image_url,
        'listing_ids', coalesce((SELECT jsonb_agg(ci.listing_id ORDER BY ci.sort_order) FROM public.store_collection_items ci WHERE ci.collection_id = c.id), '[]'::jsonb)
      ) ORDER BY c.sort_order, c.name, c.id)
      FROM public.store_collections c WHERE c.store_id = s.id AND c.is_published
    ), '[]'::jsonb),
    'pages', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', pg.id, 'title', pg.title, 'slug', pg.slug, 'content', pg.content, 'seo', pg.seo) ORDER BY pg.title, pg.id)
      FROM public.store_pages pg WHERE pg.store_id = s.id AND pg.is_published
    ), '[]'::jsonb)
  ) FROM public.stores s WHERE s.id = _store_id
$$;

-- Stores already published before this migration did not contain the complete
-- projection. Their then-current public state becomes the first full version;
-- later draft edits remain isolated until the next publish.
UPDATE public.stores
SET published_snapshot = public.store_draft_snapshot(id),
    published_revision = greatest(published_revision, 1),
    draft_revision = greatest(draft_revision, published_revision, 1)
WHERE status = 'published'
  AND (published_snapshot IS NULL OR NOT (published_snapshot ? 'collections'));

CREATE OR REPLACE FUNCTION public.public_storefront_catalog(
  _slug text, _query text DEFAULT NULL, _category_slug text DEFAULT NULL,
  _page integer DEFAULT 1, _page_size integer DEFAULT 24
)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH snapshot AS (
    SELECT published_snapshot payload FROM public.stores
    WHERE slug = lower(btrim(_slug)) AND status = 'published' AND published_snapshot IS NOT NULL
  ), eligible AS (
    SELECT item, item->>'id' AS id, item->>'product_id' AS product_id,
      item->>'retail_price' AS retail_price, item->>'compare_at_price' AS compare_at_price,
      item->>'modality' AS modality, coalesce((item->>'sort_order')::integer, 0) AS sort_order,
      item->'commercial_config' AS commercial_config, item->'product' AS product
    FROM snapshot CROSS JOIN LATERAL jsonb_array_elements(payload->'listings') item
    WHERE (_query IS NULL OR btrim(_query) = '' OR item #>> '{product,name}' ILIKE '%' || btrim(_query) || '%' OR item #>> '{product,slug}' ILIKE '%' || btrim(_query) || '%')
      AND (_category_slug IS NULL OR btrim(_category_slug) = '' OR item #>> '{product,category,slug}' = lower(btrim(_category_slug)))
  ), counted AS (
    SELECT *, count(*) OVER () AS total_count FROM eligible
  ), paged AS (
    SELECT * FROM counted ORDER BY sort_order, product->>'name', id
    OFFSET ((greatest(coalesce(_page, 1), 1) - 1) * least(greatest(coalesce(_page_size, 24), 1), 48))
    LIMIT least(greatest(coalesce(_page_size, 24), 1), 48)
  )
  SELECT jsonb_build_object(
    'page', greatest(coalesce(_page, 1), 1), 'page_size', least(greatest(coalesce(_page_size, 24), 1), 48),
    'total', coalesce((SELECT max(total_count) FROM paged), 0),
    'items', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id', id, 'product_id', product_id, 'name', product->>'name', 'slug', product->>'slug',
      'images', product->'images', 'description', product->>'description', 'retail_price', retail_price::numeric,
      'compare_at_price', nullif(compare_at_price, '')::numeric, 'modality', modality,
      'commercial_config', commercial_config, 'category', product->'category'
    ) ORDER BY sort_order, product->>'name', id) FROM paged), '[]'::jsonb)
  )
$$;

CREATE OR REPLACE FUNCTION public.public_storefront_product(_slug text, _product_slug text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH snapshot AS (
    SELECT id AS store_id, published_snapshot payload FROM public.stores
    WHERE slug = lower(btrim(_slug)) AND status = 'published' AND published_snapshot IS NOT NULL
  ), chosen AS (
    SELECT s.store_id, item FROM snapshot s
    CROSS JOIN LATERAL jsonb_array_elements(s.payload->'listings') item
    WHERE item #>> '{product,slug}' = lower(btrim(_product_slug))
    ORDER BY coalesce((item->>'sort_order')::integer, 0), item->>'id' LIMIT 1
  )
  SELECT jsonb_build_object(
    'listing', jsonb_build_object(
      'id', c.item->>'id', 'retail_price', (c.item->>'retail_price')::numeric,
      'compare_at_price', nullif(c.item->>'compare_at_price', '')::numeric,
      'modality', c.item->>'modality', 'commercial_config', c.item->'commercial_config'
    ),
    'product', jsonb_build_object(
      'id', c.item #>> '{product,id}', 'name', c.item #>> '{product,name}',
      'slug', c.item #>> '{product,slug}', 'description', c.item #>> '{product,description}',
      'images', c.item #> '{product,images}', 'category', c.item #> '{product,category}',
      'variants', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'id', variant->>'id', 'sku', variant->>'sku', 'attributes', variant->'attributes',
          'stock_controlled', stock.available_quantity IS NOT NULL,
          'available', live.id IS NOT NULL AND pv.id IS NOT NULL AND (stock.available_quantity IS NULL OR stock.available_quantity > 0),
          'available_quantity', CASE WHEN stock.available_quantity IS NULL THEN NULL ELSE greatest(stock.available_quantity, 0) END
        ) ORDER BY variant->>'sku')
        FROM jsonb_array_elements(c.item #> '{product,variants}') variant
        LEFT JOIN public.store_listings live ON live.id::text = c.item->>'id' AND live.store_id = c.store_id
          AND live.is_published AND live.visibility = 'visible' AND live.retail_price IS NOT NULL
        LEFT JOIN public.product_variants pv ON pv.id::text = variant->>'id' AND pv.is_active
        LEFT JOIN LATERAL (
          SELECT b.on_hand - b.reserved AS available_quantity
          FROM public.supplier_offers so
          JOIN public.inventory_balances b ON b.organization_id = so.organization_id AND b.variant_id = pv.id
          WHERE so.id = live.offer_id
        ) stock ON true
      ), '[]'::jsonb)
    )
  ) FROM chosen c
$$;

CREATE OR REPLACE FUNCTION public.public_storefront_page(_slug text, _page_slug text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT page FROM public.stores s CROSS JOIN LATERAL jsonb_array_elements(s.published_snapshot->'pages') page
  WHERE s.slug = lower(btrim(_slug)) AND s.status = 'published' AND s.published_snapshot IS NOT NULL
    AND page->>'slug' = lower(btrim(_page_slug))
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.public_storefront_collection(_slug text, _collection_slug text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH snapshot AS (
    SELECT published_snapshot payload FROM public.stores
    WHERE slug = lower(btrim(_slug)) AND status = 'published' AND published_snapshot IS NOT NULL
  ), selected_collection AS (
    SELECT entry AS collection, payload FROM snapshot CROSS JOIN LATERAL jsonb_array_elements(payload->'collections') entry
    WHERE entry->>'slug' = lower(btrim(_collection_slug)) LIMIT 1
  )
  SELECT jsonb_build_object(
    'name', c.collection->>'name', 'slug', c.collection->>'slug', 'description', c.collection->>'description', 'image_url', c.collection->>'image_url',
    'items', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', item->>'id', 'name', item #>> '{product,name}', 'slug', item #>> '{product,slug}',
        'images', item #> '{product,images}', 'retail_price', (item->>'retail_price')::numeric,
        'compare_at_price', nullif(item->>'compare_at_price', '')::numeric
      ) ORDER BY item->>'sort_order', item #>> '{product,name}')
      FROM jsonb_array_elements(c.payload->'listings') item
      WHERE (c.collection->'listing_ids') ? (item->>'id')
    ), '[]'::jsonb)
  ) FROM selected_collection c
$$;

CREATE OR REPLACE FUNCTION public.public_store_navigation(_slug text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce(published_snapshot->'navigation', '[]'::jsonb) FROM public.stores
  WHERE slug = lower(btrim(_slug)) AND status = 'published' AND published_snapshot IS NOT NULL
$$;

DROP TRIGGER IF EXISTS t_collections_draft_revision ON public.store_collections;
CREATE TRIGGER t_collections_draft_revision AFTER INSERT OR UPDATE OR DELETE ON public.store_collections FOR EACH ROW EXECUTE FUNCTION public.mark_store_draft_revision();
DROP TRIGGER IF EXISTS t_collection_items_draft_revision ON public.store_collection_items;
CREATE OR REPLACE FUNCTION public.mark_collection_item_draft_revision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE target uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT store_id INTO target FROM public.store_collections WHERE id = OLD.collection_id;
    UPDATE public.stores SET draft_revision = draft_revision + 1 WHERE id = target;
    RETURN OLD;
  END IF;
  SELECT store_id INTO target FROM public.store_collections WHERE id = NEW.collection_id;
  UPDATE public.stores SET draft_revision = draft_revision + 1 WHERE id = target;
  RETURN NEW;
END $$;
CREATE TRIGGER t_collection_items_draft_revision AFTER INSERT OR UPDATE OR DELETE ON public.store_collection_items FOR EACH ROW EXECUTE FUNCTION public.mark_collection_item_draft_revision();
DROP TRIGGER IF EXISTS t_store_collections_audit ON public.store_collections;
CREATE TRIGGER t_store_collections_audit AFTER INSERT OR UPDATE OR DELETE ON public.store_collections FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
