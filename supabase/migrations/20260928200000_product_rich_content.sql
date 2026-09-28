CREATE TABLE public.product_content_blocks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
 type text NOT NULL CHECK (type IN ('image','text','image_text','banner','two_images','benefits','size_guide','spacer','faq')),
 position integer NOT NULL DEFAULT 0, is_visible boolean NOT NULL DEFAULT true, config jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX product_content_blocks_product_position_idx ON public.product_content_blocks(product_id, position);
ALTER TABLE public.product_content_blocks ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_content_blocks TO authenticated;
CREATE POLICY "product content platform only" ON public.product_content_blocks FOR ALL TO authenticated USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));
CREATE TRIGGER product_content_blocks_updated BEFORE UPDATE ON public.product_content_blocks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER audit_product_content_blocks AFTER INSERT OR UPDATE OR DELETE ON public.product_content_blocks FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

CREATE OR REPLACE FUNCTION public.validate_product_content_block() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE link text; BEGIN
 IF NEW.config ? 'link' THEN link := NEW.config->>'link'; IF link ~* '^javascript:' OR link ~* '^data:' THEN RAISE EXCEPTION 'Link inseguro'; END IF; END IF;
 IF NEW.type='faq' AND jsonb_typeof(coalesce(NEW.config->'items','null'::jsonb)) <> 'array' THEN RAISE EXCEPTION 'FAQ requer itens'; END IF;
 IF NEW.type='benefits' AND jsonb_typeof(coalesce(NEW.config->'items','null'::jsonb)) <> 'array' THEN RAISE EXCEPTION 'Benefícios requerem itens'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER validate_product_content_block BEFORE INSERT OR UPDATE ON public.product_content_blocks FOR EACH ROW EXECUTE FUNCTION public.validate_product_content_block();

-- Preserve snapshot semantics: content is copied only when the Store is (re)published.
ALTER FUNCTION public.store_draft_snapshot(uuid) RENAME TO store_draft_snapshot_base;
CREATE FUNCTION public.store_draft_snapshot(_store_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT jsonb_set(public.store_draft_snapshot_base(_store_id), '{listings}', coalesce((SELECT jsonb_agg(jsonb_set(item,'{product,content_blocks}',coalesce((SELECT jsonb_agg(jsonb_build_object('id',b.id,'type',b.type,'position',b.position,'config',b.config) ORDER BY b.position) FROM public.product_content_blocks b WHERE b.product_id=(item->>'product_id')::uuid AND b.is_visible),'[]'::jsonb))) FROM jsonb_array_elements(public.store_draft_snapshot_base(_store_id)->'listings') item),'[]'::jsonb))
$$;
