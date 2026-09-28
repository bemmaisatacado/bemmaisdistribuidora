-- Product Master evolution: identity stays separate from supplier offers and Store listings.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS short_description text,
  ADD COLUMN IF NOT EXISTS reference text,
  ADD COLUMN IF NOT EXISTS audience text,
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS seo jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.brands
  ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS weight_grams integer,
  ADD COLUMN IF NOT EXISTS dimensions jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS products_name_idx ON public.products(lower(name));
CREATE INDEX IF NOT EXISTS products_reference_idx ON public.products(lower(reference));
CREATE INDEX IF NOT EXISTS variants_sku_idx ON public.product_variants(lower(sku));
CREATE INDEX IF NOT EXISTS variants_barcode_idx ON public.product_variants(barcode) WHERE barcode IS NOT NULL;
CREATE INDEX IF NOT EXISTS categories_parent_idx ON public.categories(parent_id, sort_order);

CREATE TABLE IF NOT EXISTS public.category_attributes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text NOT NULL,
  type text NOT NULL CHECK (type IN ('text','number','boolean','select','multi_select','color','measurement')),
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_required boolean NOT NULL DEFAULT false,
  is_variant boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(category_id, code)
);
CREATE INDEX IF NOT EXISTS category_attributes_category_idx ON public.category_attributes(category_id, sort_order);
ALTER TABLE public.category_attributes ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.category_attributes TO authenticated;
GRANT ALL ON public.category_attributes TO service_role;
CREATE POLICY "category attributes read" ON public.category_attributes FOR SELECT TO authenticated USING (true);
CREATE POLICY "category attributes admin" ON public.category_attributes FOR ALL TO authenticated USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));
CREATE TRIGGER t_category_attributes_updated BEFORE UPDATE ON public.category_attributes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER audit_category_attributes AFTER INSERT OR UPDATE OR DELETE ON public.category_attributes FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

CREATE TABLE IF NOT EXISTS public.product_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL,
  storage_path text NOT NULL,
  alt_text text,
  sort_order integer NOT NULL DEFAULT 0,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(product_id, storage_path)
);
CREATE UNIQUE INDEX IF NOT EXISTS product_media_primary_idx ON public.product_media(product_id) WHERE is_primary;
ALTER TABLE public.product_media ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_media TO authenticated;
GRANT ALL ON public.product_media TO service_role;
CREATE POLICY "product media read" ON public.product_media FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id));
CREATE POLICY "product media manage" ON public.product_media FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND public.is_platform_admin(auth.uid()))) WITH CHECK (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND public.is_platform_admin(auth.uid())));
CREATE TRIGGER audit_product_media AFTER INSERT OR UPDATE OR DELETE ON public.product_media FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

CREATE OR REPLACE FUNCTION public.guard_category_hierarchy()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.parent_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.parent_id = NEW.id OR EXISTS (
    WITH RECURSIVE ancestors AS (
      SELECT id, parent_id FROM public.categories WHERE id = NEW.parent_id
      UNION ALL SELECT c.id, c.parent_id FROM public.categories c JOIN ancestors a ON c.id = a.parent_id
    ) SELECT 1 FROM ancestors WHERE id = NEW.id
  ) THEN RAISE EXCEPTION 'Categoria não pode criar ciclo'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS t_category_hierarchy ON public.categories;
CREATE TRIGGER t_category_hierarchy BEFORE INSERT OR UPDATE OF parent_id ON public.categories FOR EACH ROW EXECUTE FUNCTION public.guard_category_hierarchy();

CREATE OR REPLACE FUNCTION public.normalize_catalog_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  NEW.name := btrim(NEW.name);
  NEW.slug := trim(both '-' from regexp_replace(lower(NEW.slug), '[^a-z0-9-]+', '-', 'g'));
  IF EXISTS (SELECT 1 FROM public.brands b WHERE lower(b.name) = lower(NEW.name) AND b.id <> coalesce(NEW.id, gen_random_uuid())) THEN RAISE EXCEPTION 'Marca já existe'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS t_brand_identity ON public.brands;
CREATE TRIGGER t_brand_identity BEFORE INSERT OR UPDATE OF name, slug ON public.brands FOR EACH ROW EXECUTE FUNCTION public.normalize_catalog_identity();

CREATE OR REPLACE FUNCTION public.validate_product_variant()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  NEW.sku := upper(btrim(NEW.sku));
  IF NEW.barcode IS NOT NULL AND NEW.barcode !~ '^[0-9]{8,14}$' THEN RAISE EXCEPTION 'EAN/GTIN deve ter entre 8 e 14 dígitos'; END IF;
  IF EXISTS (SELECT 1 FROM public.product_variants v WHERE v.product_id = NEW.product_id AND v.id <> coalesce(NEW.id, gen_random_uuid()) AND v.attributes = NEW.attributes) THEN RAISE EXCEPTION 'Combinação de atributos duplicada'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS t_product_variant_validate ON public.product_variants;
CREATE TRIGGER t_product_variant_validate BEFORE INSERT OR UPDATE OF sku, barcode, attributes ON public.product_variants FOR EACH ROW EXECUTE FUNCTION public.validate_product_variant();
