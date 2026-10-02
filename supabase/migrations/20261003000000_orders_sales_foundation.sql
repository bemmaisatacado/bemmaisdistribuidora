-- Orders are durable commercial records. Checkout, reservation, payment capture,
-- fulfillment and payouts remain separate future workflows.
DO $$ BEGIN
  CREATE TYPE public.order_status AS ENUM ('draft', 'pending_payment', 'paid', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.order_fulfillment_status AS ENUM ('unassigned', 'pending', 'fulfilled', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE SEQUENCE IF NOT EXISTS public.bemmais_order_number_seq;

CREATE OR REPLACE FUNCTION public.bemmais_order_number()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = public, pg_temp
AS $$
  SELECT 'BM-' || lpad(nextval('public.bemmais_order_number_seq')::text, 10, '0')
$$;

CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE DEFAULT public.bemmais_order_number(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  buyer_organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  buyer_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  buyer_name text,
  buyer_email text,
  shipping_address jsonb,
  status public.order_status NOT NULL DEFAULT 'draft',
  payment_status public.payment_status NOT NULL DEFAULT 'pending',
  currency char(3) NOT NULL DEFAULT 'BRL' CHECK (currency ~ '^[A-Z]{3}$'),
  subtotal_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (subtotal_amount >= 0),
  discount_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  shipping_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (shipping_amount >= 0),
  total_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  product_id uuid REFERENCES public.products(id) ON DELETE RESTRICT,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE RESTRICT,
  store_listing_id uuid REFERENCES public.store_listings(id) ON DELETE SET NULL,
  supplier_offer_id uuid REFERENCES public.supplier_offers(id) ON DELETE SET NULL,
  seller_organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  supplier_organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  stock_owner_organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  fulfillment_owner_organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  fulfillment_status public.order_fulfillment_status NOT NULL DEFAULT 'unassigned',
  commercial_modality public.commercial_modality,
  product_name_snapshot text NOT NULL,
  sku_snapshot text NOT NULL,
  image_path_snapshot text,
  attributes_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  unit_price numeric(12,2) NOT NULL CHECK (unit_price >= 0),
  quantity integer NOT NULL CHECK (quantity > 0),
  subtotal_amount numeric(12,2) NOT NULL CHECK (subtotal_amount >= 0),
  discount_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  shipping_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (shipping_amount >= 0),
  total_amount numeric(12,2) NOT NULL CHECK (total_amount >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS orders_org_created_idx ON public.orders(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_store_created_idx ON public.orders(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS order_items_order_idx ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS order_items_variant_idx ON public.order_items(variant_id);
CREATE INDEX IF NOT EXISTS order_items_supplier_idx ON public.order_items(supplier_organization_id);

CREATE OR REPLACE FUNCTION public.sync_order_item_organization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  SELECT organization_id INTO NEW.organization_id FROM public.orders WHERE id = NEW.order_id;
  IF NEW.organization_id IS NULL THEN RAISE EXCEPTION 'Pedido não encontrado'; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS t_order_items_org ON public.order_items;
CREATE TRIGGER t_order_items_org
BEFORE INSERT OR UPDATE OF order_id ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.sync_order_item_organization();

CREATE TRIGGER orders_updated BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER order_items_updated BEFORE UPDATE ON public.order_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER audit_orders AFTER INSERT OR UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
CREATE TRIGGER audit_order_items AFTER INSERT OR UPDATE ON public.order_items FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

GRANT SELECT ON public.orders, public.order_items TO authenticated;
GRANT ALL ON public.orders, public.order_items TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orders read" ON public.orders FOR SELECT TO authenticated
USING (public.is_platform_admin(auth.uid()) OR public.is_org_member(auth.uid(), organization_id) OR buyer_organization_id IS NOT NULL AND public.is_org_member(auth.uid(), buyer_organization_id) OR buyer_user_id = auth.uid());
CREATE POLICY "order items read" ON public.order_items FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id));

CREATE OR REPLACE FUNCTION public.admin_order_list(_limit integer DEFAULT 50)
RETURNS TABLE(
  id uuid,
  order_number text,
  status public.order_status,
  payment_status public.payment_status,
  currency text,
  total_amount text,
  item_count bigint,
  store_name text,
  buyer_name text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT o.id, o.order_number, o.status, o.payment_status, o.currency::text,
    o.total_amount::text, count(oi.id), s.name, o.buyer_name, o.created_at
  FROM public.orders o
  LEFT JOIN public.order_items oi ON oi.order_id = o.id
  LEFT JOIN public.stores s ON s.id = o.store_id
  WHERE public.is_platform_admin(auth.uid())
  GROUP BY o.id, s.name
  ORDER BY o.created_at DESC
  LIMIT least(greatest(_limit, 1), 100)
$$;

REVOKE ALL ON FUNCTION public.admin_order_list(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_order_list(integer) TO authenticated;
