-- Administrative read models for Orders. They are platform-only and do not mutate orders.
DROP FUNCTION IF EXISTS public.admin_order_list(integer);
CREATE OR REPLACE FUNCTION public.admin_order_list(
  _query text DEFAULT NULL, _order_status public.order_status DEFAULT NULL, _payment_status public.payment_status DEFAULT NULL,
  _store_id uuid DEFAULT NULL, _from timestamptz DEFAULT NULL, _to timestamptz DEFAULT NULL, _offset integer DEFAULT 0, _limit integer DEFAULT 20
)
RETURNS TABLE(id uuid, order_number text, status public.order_status, payment_status public.payment_status, fulfillment_status public.order_fulfillment_status, currency text, total_amount text, item_count bigint, store_name text, buyer_name text, created_at timestamptz, total_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH filtered AS (
    SELECT o.*, s.name AS resolved_store_name, count(oi.id)::bigint AS resolved_item_count,
      CASE WHEN count(oi.id)=0 OR bool_and(oi.fulfillment_status='unassigned') THEN 'unassigned'::public.order_fulfillment_status
           WHEN bool_and(oi.fulfillment_status='fulfilled') THEN 'fulfilled'::public.order_fulfillment_status
           WHEN bool_and(oi.fulfillment_status='cancelled') THEN 'cancelled'::public.order_fulfillment_status
           ELSE 'pending'::public.order_fulfillment_status END AS resolved_fulfillment_status
    FROM public.orders o LEFT JOIN public.order_items oi ON oi.order_id=o.id LEFT JOIN public.stores s ON s.id=o.store_id
    WHERE public.is_platform_admin(auth.uid())
      AND (_query IS NULL OR btrim(_query)='' OR o.order_number ILIKE '%'||btrim(_query)||'%' OR coalesce(o.buyer_name,'') ILIKE '%'||btrim(_query)||'%' OR coalesce(o.buyer_email,'') ILIKE '%'||btrim(_query)||'%' OR coalesce(s.name,'') ILIKE '%'||btrim(_query)||'%')
      AND (_order_status IS NULL OR o.status=_order_status) AND (_payment_status IS NULL OR o.payment_status=_payment_status)
      AND (_store_id IS NULL OR o.store_id=_store_id) AND (_from IS NULL OR o.created_at>=_from) AND (_to IS NULL OR o.created_at<_to)
    GROUP BY o.id,s.name
  ) SELECT id,order_number,status,payment_status,resolved_fulfillment_status,currency::text,total_amount::text,resolved_item_count,resolved_store_name,buyer_name,created_at,count(*) OVER()
  FROM filtered ORDER BY created_at DESC OFFSET greatest(_offset,0) LIMIT least(greatest(_limit,1),100);
$$;

CREATE OR REPLACE FUNCTION public.admin_order_stats(
  _query text DEFAULT NULL, _order_status public.order_status DEFAULT NULL, _payment_status public.payment_status DEFAULT NULL, _store_id uuid DEFAULT NULL, _from timestamptz DEFAULT NULL, _to timestamptz DEFAULT NULL
) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object('total_orders',count(*),'pending_payment',count(*) FILTER (WHERE status='pending_payment'),'paid',count(*) FILTER (WHERE status='paid'),'cancelled',count(*) FILTER (WHERE status='cancelled'),'total_amount',coalesce(sum(total_amount),0)::text)
  FROM public.orders o LEFT JOIN public.stores s ON s.id=o.store_id WHERE public.is_platform_admin(auth.uid())
    AND (_query IS NULL OR btrim(_query)='' OR o.order_number ILIKE '%'||btrim(_query)||'%' OR coalesce(o.buyer_name,'') ILIKE '%'||btrim(_query)||'%' OR coalesce(o.buyer_email,'') ILIKE '%'||btrim(_query)||'%' OR coalesce(s.name,'') ILIKE '%'||btrim(_query)||'%')
    AND (_order_status IS NULL OR o.status=_order_status) AND (_payment_status IS NULL OR o.payment_status=_payment_status) AND (_store_id IS NULL OR o.store_id=_store_id) AND (_from IS NULL OR o.created_at>=_from) AND (_to IS NULL OR o.created_at<_to);
$$;

CREATE OR REPLACE FUNCTION public.admin_order_360(_order_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT CASE WHEN NOT public.is_platform_admin(auth.uid()) THEN NULL ELSE jsonb_build_object(
    'order', (SELECT jsonb_build_object('id',o.id,'order_number',o.order_number,'status',o.status,'payment_status',o.payment_status,'fulfillment_status',CASE WHEN count(oi.id)=0 OR bool_and(oi.fulfillment_status='unassigned') THEN 'unassigned' WHEN bool_and(oi.fulfillment_status='fulfilled') THEN 'fulfilled' WHEN bool_and(oi.fulfillment_status='cancelled') THEN 'cancelled' ELSE 'pending' END,'currency',o.currency,'subtotal_amount',o.subtotal_amount::text,'discount_amount',o.discount_amount::text,'shipping_amount',o.shipping_amount::text,'total_amount',o.total_amount::text,'buyer_name',o.buyer_name,'buyer_email',o.buyer_email,'organization_name',org.name,'store_name',s.name,'shipping_address',o.shipping_address,'created_at',o.created_at,'updated_at',o.updated_at) FROM public.orders o LEFT JOIN public.stores s ON s.id=o.store_id LEFT JOIN public.organizations org ON org.id=o.organization_id LEFT JOIN public.order_items oi ON oi.order_id=o.id WHERE o.id=_order_id GROUP BY o.id,org.name,s.name),
    'items', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',oi.id,'product_id',oi.product_id,'variant_id',oi.variant_id,'product_name_snapshot',oi.product_name_snapshot,'sku_snapshot',oi.sku_snapshot,'image_path_snapshot',oi.image_path_snapshot,'attributes_snapshot',oi.attributes_snapshot,'quantity',oi.quantity,'unit_price',oi.unit_price::text,'subtotal_amount',oi.subtotal_amount::text,'discount_amount',oi.discount_amount::text,'shipping_amount',oi.shipping_amount::text,'total_amount',oi.total_amount::text,'commercial_modality',oi.commercial_modality,'fulfillment_status',oi.fulfillment_status,'supplier_name',supplier.name,'seller_name',seller.name,'stock_owner_name',stock.name,'fulfillment_owner_name',fulfillment.name) ORDER BY oi.created_at),'[]'::jsonb) FROM public.order_items oi LEFT JOIN public.organizations supplier ON supplier.id=oi.supplier_organization_id LEFT JOIN public.organizations seller ON seller.id=oi.seller_organization_id LEFT JOIN public.organizations stock ON stock.id=oi.stock_owner_organization_id LEFT JOIN public.organizations fulfillment ON fulfillment.id=oi.fulfillment_owner_organization_id WHERE oi.order_id=_order_id),
    'payments',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'status',p.status,'provider',p.provider,'method',p.method,'amount',p.amount::text,'provider_payment_id',p.provider_payment_id,'paid_at',p.paid_at,'created_at',p.created_at) ORDER BY p.created_at DESC),'[]'::jsonb) FROM public.payments p WHERE p.reference_id=_order_id::text),
    'activity',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id::text,'action',a.action,'entity_type',a.entity_type,'actor_name',pr.full_name,'occurred_at',a.occurred_at) ORDER BY a.occurred_at DESC),'[]'::jsonb) FROM public.audit_logs a LEFT JOIN public.profiles pr ON pr.id=a.actor_id WHERE (a.entity_type='orders' AND a.entity_id=_order_id::text) OR (a.entity_type='order_items' AND a.entity_id IN (SELECT id::text FROM public.order_items WHERE order_id=_order_id)))
  ) END;
$$;
REVOKE ALL ON FUNCTION public.admin_order_list(text,public.order_status,public.payment_status,uuid,timestamptz,timestamptz,integer,integer), public.admin_order_stats(text,public.order_status,public.payment_status,uuid,timestamptz,timestamptz), public.admin_order_360(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_order_list(text,public.order_status,public.payment_status,uuid,timestamptz,timestamptz,integer,integer), public.admin_order_stats(text,public.order_status,public.payment_status,uuid,timestamptz,timestamptz), public.admin_order_360(uuid) TO authenticated;
