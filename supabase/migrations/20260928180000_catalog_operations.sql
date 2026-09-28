-- Operational Product Master: internal identity is separate from the optional official GTIN.
ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS internal_code text,
  ADD COLUMN IF NOT EXISTS gtin text;

UPDATE public.product_variants SET gtin = barcode WHERE gtin IS NULL AND barcode IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS product_variants_internal_code_key ON public.product_variants(internal_code) WHERE internal_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS product_variants_gtin_key ON public.product_variants(gtin) WHERE gtin IS NOT NULL;

CREATE SEQUENCE IF NOT EXISTS public.bemmais_internal_code_seq;

CREATE OR REPLACE FUNCTION public.bemmais_internal_code()
RETURNS text LANGUAGE sql VOLATILE SET search_path = public, pg_temp AS $$
  SELECT 'BMI' || lpad(nextval('public.bemmais_internal_code_seq')::text, 10, '0')
$$;

CREATE OR REPLACE FUNCTION public.assign_product_variant_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  -- IDs, not mutable product names, form the default SKU suffix. The unique index is final authority.
  IF coalesce(btrim(NEW.sku), '') = '' THEN NEW.sku := 'BM-' || upper(replace(NEW.product_id::text, '-', '')) || '-' || lpad(nextval('public.bemmais_internal_code_seq')::text, 6, '0'); END IF;
  IF coalesce(btrim(NEW.internal_code), '') = '' THEN NEW.internal_code := public.bemmais_internal_code(); END IF;
  NEW.gtin := nullif(btrim(NEW.gtin), '');
  NEW.barcode := NEW.gtin; -- compatibility only: barcode remains the official GTIN field for legacy readers.
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS t_product_variant_identity ON public.product_variants;
CREATE TRIGGER t_product_variant_identity BEFORE INSERT OR UPDATE OF sku, internal_code, gtin ON public.product_variants
FOR EACH ROW EXECUTE FUNCTION public.assign_product_variant_identity();

-- The previous validator predates the explicit GTIN column.
DROP TRIGGER IF EXISTS t_product_variant_validate ON public.product_variants;
CREATE TRIGGER t_product_variant_validate BEFORE INSERT OR UPDATE OF sku, barcode, gtin, attributes ON public.product_variants
FOR EACH ROW EXECUTE FUNCTION public.validate_product_variant();

CREATE OR REPLACE FUNCTION public.create_product_master(
  _name text, _slug text, _description text DEFAULT NULL, _short_description text DEFAULT NULL,
  _category_id uuid DEFAULT NULL, _brand_id uuid DEFAULT NULL, _reference text DEFAULT NULL,
  _audience text DEFAULT NULL, _tags text[] DEFAULT '{}', _variants jsonb DEFAULT '[]'::jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE _product_id uuid; _item jsonb; _slug_base text; _i int := 0;
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'Apenas plataforma pode cadastrar Product Master'; END IF;
  _slug_base := trim(both '-' from regexp_replace(lower(coalesce(_slug, _name)), '[^a-z0-9-]+', '-', 'g'));
  IF _slug_base = '' THEN RAISE EXCEPTION 'Nome inválido'; END IF;
  WHILE EXISTS (SELECT 1 FROM public.products WHERE slug = _slug_base || CASE WHEN _i = 0 THEN '' ELSE '-' || _i END) LOOP _i := _i + 1; END LOOP;
  INSERT INTO public.products(name,slug,description,short_description,category_id,brand_id,reference,audience,tags,status)
  VALUES (btrim(_name), _slug_base || CASE WHEN _i = 0 THEN '' ELSE '-' || _i END, nullif(_description,''), nullif(_short_description,''), _category_id,_brand_id,nullif(_reference,''),nullif(_audience,''),coalesce(_tags,'{}'),'draft') RETURNING id INTO _product_id;
  IF jsonb_array_length(coalesce(_variants,'[]'::jsonb)) = 0 THEN
    INSERT INTO public.product_variants(product_id, sku, internal_code, gtin, attributes) VALUES (_product_id, '', '', NULL, '{}'::jsonb);
  ELSE
    FOR _item IN SELECT value FROM jsonb_array_elements(_variants) LOOP
      INSERT INTO public.product_variants(product_id,sku,internal_code,gtin,attributes,weight_grams,dimensions,is_active)
      VALUES (_product_id,coalesce(_item->>'sku',''),coalesce(_item->>'internal_code',''),nullif(_item->>'gtin',''),coalesce(_item->'attributes','{}'::jsonb),nullif(_item->>'weight_grams','')::integer,coalesce(_item->'dimensions','{}'::jsonb),coalesce((_item->>'is_active')::boolean,true));
    END LOOP;
  END IF;
  RETURN _product_id;
END $$;
REVOKE ALL ON FUNCTION public.create_product_master(text,text,text,text,uuid,uuid,text,text,text[],jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_product_master(text,text,text,text,uuid,uuid,text,text,text[],jsonb) TO authenticated;
