-- Product media has its own private ownership boundary; no public storage policy is used.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('product-media', 'product-media', false, 10485760, ARRAY['image/jpeg','image/png','image/webp']::text[])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "product media storage select" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'product-media' AND public.is_platform_admin(auth.uid()));
CREATE POLICY "product media storage insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'product-media' AND public.is_platform_admin(auth.uid()) AND (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$');
CREATE POLICY "product media storage delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'product-media' AND public.is_platform_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.admin_catalog_metrics()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
 SELECT jsonb_build_object(
   'total', count(*), 'active', count(*) FILTER (WHERE p.status='active'), 'draft', count(*) FILTER (WHERE p.status='draft'),
   'without_image', count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM public.product_media m WHERE m.product_id=p.id)),
   'without_offer', count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM public.supplier_offers o WHERE o.product_id=p.id)),
   'without_active_sku', count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM public.product_variants v WHERE v.product_id=p.id AND v.is_active))
 ) FROM public.products p WHERE public.is_platform_admin(auth.uid())
$$;
GRANT EXECUTE ON FUNCTION public.admin_catalog_metrics() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_catalog_search(_query text DEFAULT NULL, _status public.catalog_status DEFAULT NULL, _category_id uuid DEFAULT NULL, _brand_id uuid DEFAULT NULL, _image text DEFAULT NULL, _sku text DEFAULT NULL, _offer text DEFAULT NULL, _limit int DEFAULT 20, _offset int DEFAULT 0)
RETURNS TABLE(id uuid,name text,slug text,status public.catalog_status,reference text,updated_at timestamptz,brand_name text,category_name text,variant_count bigint,offer_count bigint,has_image boolean,total_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
 WITH filtered AS (
 SELECT p.* FROM public.products p WHERE public.is_platform_admin(auth.uid())
 AND (_status IS NULL OR p.status=_status) AND (_category_id IS NULL OR p.category_id=_category_id) AND (_brand_id IS NULL OR p.brand_id=_brand_id)
 AND (_image IS NULL OR (_image='yes')=EXISTS(SELECT 1 FROM public.product_media m WHERE m.product_id=p.id))
 AND (_sku IS NULL OR (_sku='yes')=EXISTS(SELECT 1 FROM public.product_variants v WHERE v.product_id=p.id AND v.is_active))
 AND (_offer IS NULL OR (_offer='yes')=EXISTS(SELECT 1 FROM public.supplier_offers o WHERE o.product_id=p.id))
 AND (coalesce(_query,'')='' OR p.name ILIKE '%'||_query||'%' OR coalesce(p.reference,'') ILIKE '%'||_query||'%' OR EXISTS(SELECT 1 FROM public.brands b WHERE b.id=p.brand_id AND b.name ILIKE '%'||_query||'%') OR EXISTS(SELECT 1 FROM public.product_variants v WHERE v.product_id=p.id AND (v.sku ILIKE '%'||_query||'%' OR coalesce(v.internal_code,'') ILIKE '%'||_query||'%' OR coalesce(v.gtin,'') ILIKE '%'||_query||'%')))
 ) SELECT p.id,p.name,p.slug,p.status,p.reference,p.updated_at,b.name,c.name,(SELECT count(*) FROM public.product_variants v WHERE v.product_id=p.id),(SELECT count(*) FROM public.supplier_offers o WHERE o.product_id=p.id),EXISTS(SELECT 1 FROM public.product_media m WHERE m.product_id=p.id),count(*) over() FROM filtered p LEFT JOIN public.brands b ON b.id=p.brand_id LEFT JOIN public.categories c ON c.id=p.category_id ORDER BY p.updated_at DESC LIMIT least(greatest(_limit,1),100) OFFSET greatest(_offset,0)
$$;
GRANT EXECUTE ON FUNCTION public.admin_catalog_search(text,public.catalog_status,uuid,uuid,text,text,text,int,int) TO authenticated;
