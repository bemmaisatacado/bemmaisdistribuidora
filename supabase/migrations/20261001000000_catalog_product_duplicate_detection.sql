-- Candidate detection is advisory only. The caller decides whether to reuse or create a Product Master.
CREATE OR REPLACE FUNCTION public.admin_find_product_duplicates(
  _name text,
  _brand_id uuid DEFAULT NULL,
  _reference text DEFAULT NULL,
  _category_id uuid DEFAULT NULL,
  _gtin text DEFAULT NULL,
  _limit integer DEFAULT 8
)
RETURNS TABLE(
  id uuid,
  name text,
  status public.catalog_status,
  reference text,
  brand_id uuid,
  brand_name text,
  category_id uuid,
  category_name text,
  image_path text,
  matching_gtin text,
  score integer,
  gtin_match boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH input AS (
    SELECT
      lower(regexp_replace(btrim(coalesce(_name, '')), '\s+', ' ', 'g')) AS normalized_name,
      lower(regexp_replace(btrim(coalesce(_reference, '')), '\s+', ' ', 'g')) AS normalized_reference,
      nullif(btrim(coalesce(_gtin, '')), '') AS gtin
  ), candidates AS (
    SELECT
      p.id,
      p.name,
      p.status,
      p.reference,
      p.brand_id,
      b.name AS brand_name,
      p.category_id,
      c.name AS category_name,
      (SELECT m.storage_path FROM public.product_media m WHERE m.product_id = p.id ORDER BY m.is_primary DESC, m.sort_order LIMIT 1) AS image_path,
      coalesce(
        (SELECT v.gtin FROM public.product_variants v WHERE v.product_id = p.id AND v.gtin = input.gtin LIMIT 1),
        (SELECT v.gtin FROM public.product_variants v WHERE v.product_id = p.id AND v.gtin IS NOT NULL ORDER BY v.created_at LIMIT 1)
      ) AS matching_gtin,
      EXISTS(SELECT 1 FROM public.product_variants v WHERE v.product_id = p.id AND v.gtin = input.gtin) AS gtin_match,
      lower(regexp_replace(btrim(p.name), '\s+', ' ', 'g')) = input.normalized_name AS same_name,
      input.normalized_reference <> ''
        AND lower(regexp_replace(btrim(coalesce(p.reference, '')), '\s+', ' ', 'g')) = input.normalized_reference AS same_reference,
      (_brand_id IS NOT NULL AND p.brand_id = _brand_id) AS same_brand,
      (_category_id IS NOT NULL AND p.category_id = _category_id) AS same_category
    FROM public.products p
    LEFT JOIN public.brands b ON b.id = p.brand_id
    LEFT JOIN public.categories c ON c.id = p.category_id
    CROSS JOIN input
    WHERE public.is_platform_admin(auth.uid())
  )
  SELECT
    id, name, status, reference, brand_id, brand_name, category_id, category_name, image_path, matching_gtin,
    CASE
      WHEN gtin_match THEN 100
      WHEN same_reference AND same_brand THEN 80
      WHEN same_reference THEN 65
      WHEN same_name AND same_brand THEN 60
      WHEN same_name AND same_category THEN 50
      ELSE 0
    END AS score,
    gtin_match
  FROM candidates
  WHERE gtin_match OR same_reference OR (same_name AND (same_brand OR same_category))
  ORDER BY score DESC, name ASC
  LIMIT least(greatest(_limit, 1), 20)
$$;

REVOKE ALL ON FUNCTION public.admin_find_product_duplicates(text, uuid, text, uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_find_product_duplicates(text, uuid, text, uuid, text, integer) TO authenticated;
