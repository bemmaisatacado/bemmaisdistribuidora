-- Only through the isolated runner; no production target permitted.
\if :{?BEMMAIS_ISOLATED_TEST}
\if :BEMMAIS_ISOLATED_TEST
\else
\quit 3
\endif
\else
\quit 3
\endif
BEGIN;
DO $$
DECLARE entity text; fn record;
BEGIN
 FOREACH entity IN ARRAY ARRAY['orders','order_items','payments','payment_provider_events',
  'inventory_movements','order_fulfillments','shipments','shipment_packages','audit_logs'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname=entity AND c.relrowsecurity)
   THEN RAISE EXCEPTION 'REQUIRED_RLS_MISSING'; END IF;
 END LOOP;
 IF has_schema_privilege('anon','bemmais_private','USAGE')
  OR has_schema_privilege('authenticated','bemmais_private','USAGE')
   THEN RAISE EXCEPTION 'PRIVATE_SCHEMA_EXPOSED'; END IF;
 IF (SELECT count(DISTINCT p.proname) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname IN ('create_storefront_order','create_order_payment',
   'confirm_verified_payment_event','admin_dashboard_metrics','admin_ops_queue','store_draft_snapshot'))<>6
  THEN RAISE EXCEPTION 'REQUIRED_RPC_MISSING'; END IF;
 FOR fn IN SELECT p.oid,p.proname,p.prosecdef,p.proconfig FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
  AND p.proname IN ('create_storefront_order','create_order_payment','confirm_verified_payment_event',
   'admin_dashboard_metrics','admin_ops_queue','store_draft_snapshot') LOOP
  IF has_function_privilege('anon',fn.oid,'EXECUTE') THEN RAISE EXCEPTION 'ANONYMOUS_SENSITIVE_RPC'; END IF;
  IF fn.prosecdef AND NOT EXISTS(SELECT 1 FROM unnest(fn.proconfig) c WHERE replace(c,' ','')='search_path=public,pg_temp')
   THEN RAISE EXCEPTION 'DEFINER_SEARCH_PATH_MISSING'; END IF;
  IF fn.proname='confirm_verified_payment_event' AND has_function_privilege('authenticated',fn.oid,'EXECUTE')
   THEN RAISE EXCEPTION 'PUBLIC_PAYMENT_CONFIRMATION'; END IF;
 END LOOP;
END $$;
ROLLBACK;
-- Catalog-level assertions complement, not replace, role-switched tenant tests
-- in the domain suites. They do not certify every row policy by themselves.
