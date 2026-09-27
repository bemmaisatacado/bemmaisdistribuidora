CREATE OR REPLACE FUNCTION public.admin_dashboard_metrics(_from timestamptz, _to timestamptz)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  IF NOT is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT jsonb_build_object(
    'gmv', COALESCE((SELECT sum(amount) FROM payments WHERE status IN ('paid','partially_refunded') AND paid_at >= _from AND paid_at < _to),0),
    'paid_count', (SELECT count(*) FROM payments WHERE status IN ('paid','partially_refunded') AND paid_at >= _from AND paid_at < _to),
    'platform_revenue', COALESCE((SELECT sum(a.amount) FROM payment_allocations a JOIN payments p ON p.id = a.payment_id WHERE a.beneficiary_role = 'platform' AND p.status IN ('paid','partially_refunded') AND p.paid_at >= _from AND p.paid_at < _to),0),
    'active_clients', (SELECT count(DISTINCT o.id) FROM organizations o JOIN organization_capabilities c ON c.organization_id = o.id AND c.enabled WHERE NOT o.is_platform AND o.status = 'active' AND c.capability <> 'supply_products'),
    'suppliers', (SELECT count(DISTINCT o.id) FROM organizations o JOIN organization_capabilities c ON c.organization_id = o.id AND c.enabled AND c.capability = 'supply_products' WHERE NOT o.is_platform),
    'stores', (SELECT count(*) FROM stores WHERE status <> 'archived'),
    'products', (SELECT count(*) FROM products WHERE status <> 'archived'),
    'skus', (SELECT count(*) FROM product_variants WHERE is_active),
    'receivables_pending', COALESCE((SELECT sum(amount) FROM receivables WHERE status IN ('pending','available')),0),
    'payouts_pending', COALESCE((SELECT sum(amount) FROM payouts WHERE status IN ('pending','processing')),0),
    'payouts_pending_count', (SELECT count(*) FROM payouts WHERE status IN ('pending','processing'))
  ) INTO r;
  RETURN r;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_ops_queue()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN jsonb_build_object(
    'offers_pending', (SELECT count(*) FROM supplier_offers WHERE status = 'pending_review'),
    'products_pending', (SELECT count(*) FROM products WHERE status = 'pending_review'),
    'orgs_pending', (SELECT count(*) FROM organizations WHERE status = 'pending'),
    'payments_problem', (SELECT count(*) FROM payments WHERE status IN ('failed','chargeback')),
    'payouts_pending', (SELECT count(*) FROM payouts WHERE status IN ('pending','processing','failed')),
    'accounts_pending', (SELECT count(*) FROM payment_accounts WHERE status = 'pending'),
    'suppliers_without_account', (SELECT count(DISTINCT c.organization_id) FROM organization_capabilities c
        WHERE c.capability = 'supply_products' AND c.enabled
        AND NOT EXISTS (SELECT 1 FROM payment_accounts pa WHERE pa.organization_id = c.organization_id AND pa.status = 'active')),
    'stock_critical', (SELECT count(*) FROM inventory_balances WHERE on_hand - reserved <= 0)
  );
END; $$;
REVOKE EXECUTE ON FUNCTION public.admin_dashboard_metrics(timestamptz, timestamptz) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.admin_ops_queue() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_metrics(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_ops_queue() TO authenticated;