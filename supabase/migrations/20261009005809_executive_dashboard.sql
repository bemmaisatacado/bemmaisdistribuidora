-- Read-only dashboard extension. Existing keys remain compatible with finance
-- and notifications; the executive UI reads only the new explicit definitions.
ALTER FUNCTION public.admin_dashboard_metrics(timestamptz,timestamptz) SET SCHEMA bemmais_private;
ALTER FUNCTION bemmais_private.admin_dashboard_metrics(timestamptz,timestamptz) RENAME TO dashboard_metrics_legacy;
REVOKE ALL ON FUNCTION bemmais_private.dashboard_metrics_legacy(timestamptz,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION public.admin_ops_queue() SET SCHEMA bemmais_private;
ALTER FUNCTION bemmais_private.admin_ops_queue() RENAME TO dashboard_ops_legacy;
REVOKE ALL ON FUNCTION bemmais_private.dashboard_ops_legacy() FROM PUBLIC,anon,authenticated,service_role;

-- One authoritative definition, reused by period metrics and operational queues.
CREATE VIEW bemmais_private.dashboard_verified_payments WITH (security_invoker=true) AS
 SELECT p.id,p.order_id,p.amount,p.currency,p.paid_at
 FROM public.payments p JOIN public.orders o ON o.id=p.order_id
 WHERE p.status='paid' AND p.paid_at IS NOT NULL AND o.status='paid' AND o.payment_status='paid'
  AND p.amount=o.total_amount AND p.currency=o.currency::text
  AND p.buyer_user_id IS NOT DISTINCT FROM o.buyer_user_id AND p.organization_id=o.organization_id
  AND EXISTS(SELECT 1 FROM public.payment_provider_events e WHERE e.payment_id=p.id
   AND e.provider=p.provider AND e.status_after='paid' AND e.processed_at IS NOT NULL
   AND e.verified_amount=p.amount AND e.verified_currency=p.currency);
REVOKE ALL ON bemmais_private.dashboard_verified_payments FROM PUBLIC,anon,authenticated,service_role;
CREATE INDEX IF NOT EXISTS orders_dashboard_created_idx ON public.orders(created_at);
CREATE INDEX IF NOT EXISTS payments_dashboard_paid_at_idx ON public.payments(paid_at) WHERE status='paid';

CREATE FUNCTION public.admin_dashboard_metrics(_from timestamptz,_to timestamptz)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE _result jsonb; _grain text; _legacy jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'DASHBOARD_FORBIDDEN'; END IF;
 IF _from IS NULL OR _to IS NULL OR NOT isfinite(_from) OR NOT isfinite(_to)
  OR _from>=_to OR _to-_from>interval '366 days' THEN RAISE EXCEPTION 'DASHBOARD_INVALID_PERIOD'; END IF;
 _grain:=CASE WHEN _to-_from<=interval '31 days' THEN 'day' WHEN _to-_from<=interval '100 days' THEN 'week' ELSE 'month' END;
 _legacy:=bemmais_private.dashboard_metrics_legacy(_from,_to);
 WITH period_orders AS MATERIALIZED (
  SELECT status,currency,total_amount,created_at FROM public.orders WHERE created_at>=_from AND created_at<_to
 ), confirmed AS MATERIALIZED (
  SELECT * FROM bemmais_private.dashboard_verified_payments WHERE currency='BRL' AND paid_at>=_from AND paid_at<_to
 ), order_buckets AS (
  SELECT date_trunc(_grain,created_at AT TIME ZONE 'America/Sao_Paulo') bucket,count(*) n FROM period_orders GROUP BY 1
 ), payment_buckets AS (
  SELECT date_trunc(_grain,paid_at AT TIME ZONE 'America/Sao_Paulo') bucket,count(DISTINCT order_id) n FROM confirmed GROUP BY 1
 ), buckets AS (
  SELECT generate_series(date_trunc(_grain,_from AT TIME ZONE 'America/Sao_Paulo'),
   date_trunc(_grain,(_to-interval '1 microsecond') AT TIME ZONE 'America/Sao_Paulo'),
   CASE _grain WHEN 'day' THEN interval '1 day' WHEN 'week' THEN interval '1 week' ELSE interval '1 month' END) bucket
 ), totals AS (
  SELECT count(*) orders,count(*) FILTER(WHERE status='draft') draft,
   count(*) FILTER(WHERE status='pending_payment') pending,count(*) FILTER(WHERE status='paid') paid,
   count(*) FILTER(WHERE status='cancelled') cancelled,
   coalesce(sum(total_amount) FILTER(WHERE currency='BRL' AND status IN ('pending_payment','paid')),0)::numeric(24,2) order_value,
   count(*) FILTER(WHERE currency<>'BRL') other_currency FROM period_orders
 ), paid_totals AS (
  SELECT coalesce(sum(amount),0)::numeric(24,2) amount,count(DISTINCT order_id) orders FROM confirmed
 ) SELECT jsonb_build_object(
  'orders',t.orders,'draft',t.draft,'pending',t.pending,'paid',t.paid,'cancelled',t.cancelled,
  'orderValue',t.order_value::text,'confirmedValue',p.amount::text,'confirmedOrders',p.orders,
  'ticket',coalesce(round(p.amount/nullif(p.orders,0),2),0)::numeric(24,2)::text,
  'otherCurrency',t.other_currency,'grain',_grain,'generatedAt',now(),
  'organizations',(SELECT count(*) FROM public.organizations WHERE NOT is_platform AND status='active'),
  'crmActive',(SELECT count(*) FROM public.customer_relationships r JOIN public.organizations o ON o.id=r.organization_id WHERE r.commercial_status='ativo' AND o.status='active' AND NOT o.is_platform),
  'suppliers',(SELECT count(*) FROM public.organizations o WHERE NOT o.is_platform AND o.status='active' AND EXISTS(SELECT 1 FROM public.organization_capabilities c WHERE c.organization_id=o.id AND c.capability='supply_products' AND c.enabled)),
  'publishedStores',(SELECT count(*) FROM public.stores WHERE status='published'),
  'products',(SELECT count(*) FROM public.products WHERE status<>'archived'),
  'skus',(SELECT count(*) FROM public.product_variants WHERE is_active),
  'series',(SELECT coalesce(jsonb_agg(jsonb_build_object('bucket',to_char(b.bucket,'YYYY-MM-DD'),'orders',coalesce(o.n,0),'confirmations',coalesce(p.n,0)) ORDER BY b.bucket),'[]'::jsonb)
   FROM buckets b LEFT JOIN order_buckets o USING(bucket) LEFT JOIN payment_buckets p USING(bucket))
 ) INTO _result FROM totals t CROSS JOIN paid_totals p;
 RETURN _legacy||jsonb_build_object('executive',_result);
END $$;
REVOKE ALL ON FUNCTION public.admin_dashboard_metrics(timestamptz,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_metrics(timestamptz,timestamptz) TO authenticated;

CREATE FUNCTION public.admin_ops_queue()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE _result jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'DASHBOARD_FORBIDDEN'; END IF;
 WITH eligible AS MATERIALIZED (
  SELECT o.id,o.order_number FROM public.orders o WHERE o.status='paid' AND o.payment_status='paid'
   AND EXISTS(SELECT 1 FROM bemmais_private.dashboard_verified_payments p WHERE p.order_id=o.id)
   AND NOT EXISTS(SELECT 1 FROM public.payments p WHERE p.order_id=o.id AND p.status NOT IN ('paid','failed','expired','cancelled'))
 ), review AS MATERIALIZED (
  SELECT o.id,o.order_number FROM public.orders o WHERE o.status<>'cancelled' AND (
   (o.status='paid' AND NOT EXISTS(SELECT 1 FROM eligible e WHERE e.id=o.id)) OR
   (o.status='pending_payment' AND EXISTS(SELECT 1 FROM public.payments p WHERE p.order_id=o.id AND p.status IN ('processing','authorized','chargeback','paid'))))
 ), unassigned AS MATERIALIZED (
  SELECT e.* FROM eligible e WHERE EXISTS(SELECT 1 FROM public.order_items i WHERE i.order_id=e.id AND i.fulfillment_id IS NULL)
 ), picking AS MATERIALIZED (
  SELECT f.id,f.order_id,e.order_number FROM public.order_fulfillments f JOIN eligible e ON e.id=f.order_id WHERE f.status IN ('ready_to_pick','picking','packed')
 ), shipping AS MATERIALIZED (
  SELECT f.id,f.order_id,e.order_number,s.status FROM public.order_fulfillments f JOIN eligible e ON e.id=f.order_id
   LEFT JOIN public.shipments s ON s.fulfillment_id=f.id WHERE f.status='ready_to_ship'
 ), samples AS (
  SELECT id,order_number,'payment_review' reason,1 priority FROM review
  UNION ALL SELECT id,order_number,'unassigned',2 FROM unassigned
  UNION ALL SELECT order_id,order_number,'fulfillment',3 FROM picking
  UNION ALL SELECT order_id,order_number,'logistics',4 FROM shipping
 ), distinct_samples AS (
  SELECT DISTINCT ON(id) id,order_number,reason,priority FROM samples ORDER BY id,priority
 ) SELECT jsonb_build_object(
  'orders_pending_payment',(SELECT count(*) FROM public.orders WHERE status='pending_payment'),
  'orders_payment_review',(SELECT count(*) FROM review),
  'orders_unassigned',(SELECT count(*) FROM unassigned),
  'fulfillment_pending',(SELECT count(*) FROM picking),
  'logistics_pending',(SELECT count(*) FROM shipping WHERE status IS NULL OR status='draft'),
  'logistics_ready',(SELECT count(*) FROM shipping WHERE status='ready_for_quote'),
  'order_samples',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'number',order_number,'reason',reason) ORDER BY priority,order_number),'[]'::jsonb)
   FROM (SELECT * FROM distinct_samples ORDER BY priority,order_number LIMIT 12) x)
 ) INTO _result;
 RETURN bemmais_private.dashboard_ops_legacy()||_result;
END $$;
REVOKE ALL ON FUNCTION public.admin_ops_queue() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.admin_ops_queue() TO authenticated;
