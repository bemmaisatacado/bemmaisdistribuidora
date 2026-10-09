-- Disposable isolated Supabase ONLY, with all local migrations already applied.
-- Never run against production. The acknowledgement does not verify the target.
-- psql -X -v ON_ERROR_STOP=1 -v BEMMAIS_ISOLATED_TEST=on -f tests/sql/executive-dashboard.sql
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
DECLARE
 admin_id uuid:=gen_random_uuid(); outsider_id uuid:=gen_random_uuid(); platform_id uuid;
 result jsonb; queues jsonb;
BEGIN
 IF has_function_privilege('anon','public.admin_dashboard_metrics(timestamptz,timestamptz)','EXECUTE')
  OR has_function_privilege('anon','public.admin_ops_queue()','EXECUTE') THEN RAISE EXCEPTION 'ANONYMOUS_DASHBOARD_ACCESS'; END IF;
 IF has_schema_privilege('authenticated','bemmais_private','USAGE')
  OR has_function_privilege('authenticated','bemmais_private.dashboard_metrics_legacy(timestamptz,timestamptz)','EXECUTE')
  OR has_table_privilege('authenticated','bemmais_private.dashboard_verified_payments','SELECT') THEN RAISE EXCEPTION 'PRIVATE_IMPLEMENTATION_EXPOSED'; END IF;
 INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
  (admin_id,admin_id::text||'@example.invalid','{}'),(outsider_id,outsider_id::text||'@example.invalid','{}');
 SELECT id INTO platform_id FROM public.organizations WHERE is_platform;
 INSERT INTO public.organization_members(organization_id,user_id,role_key) VALUES(platform_id,admin_id,'platform_super_admin') ON CONFLICT DO NOTHING;
 PERFORM set_config('request.jwt.claim.sub',outsider_id::text,true);
 SET LOCAL ROLE authenticated;
 BEGIN
  PERFORM public.admin_dashboard_metrics('1990-01-01','1990-01-02');
  RAISE EXCEPTION 'NONADMIN_METRICS_ALLOWED';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'DASHBOARD_FORBIDDEN' THEN RAISE; END IF; END;
 BEGIN
  PERFORM public.admin_ops_queue();
  RAISE EXCEPTION 'NONADMIN_QUEUE_ALLOWED';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'DASHBOARD_FORBIDDEN' THEN RAISE; END IF; END;
 RESET ROLE;
 PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
 -- Fixtures are confined to this transaction and disposable environment.
 IF EXISTS(SELECT 1 FROM public.orders WHERE created_at>='1990-01-01' AND created_at<'1990-01-03') THEN RAISE EXCEPTION 'FIXTURE_WINDOW_NOT_EMPTY'; END IF;
 INSERT INTO public.orders(organization_id,status,subtotal_amount,total_amount,created_at)
 VALUES(platform_id,'pending_payment',199.90,199.90,'1990-01-01T12:00:00Z'),
       (platform_id,'draft',25,25,'1990-01-01T13:00:00Z'),
       (platform_id,'pending_payment',10,10,'1990-01-02T00:00:00Z');
 SET LOCAL ROLE authenticated;
 result:=public.admin_dashboard_metrics('1990-01-01T00:00:00Z','1990-01-02T00:00:00Z');
 IF result#>>'{executive,orders}'<>'2' OR result#>>'{executive,pending}'<>'1'
  OR result#>>'{executive,draft}'<>'1' OR result#>>'{executive,orderValue}'<>'199.90'
  OR result#>>'{executive,confirmedValue}'<>'0.00' OR result#>>'{executive,ticket}'<>'0.00' THEN RAISE EXCEPTION 'AGGREGATE_DEFINITIONS_WRONG'; END IF;
 IF NOT(result ? 'gmv') OR NOT(result ? 'platform_revenue') THEN RAISE EXCEPTION 'LEGACY_METRICS_BROKEN'; END IF;
 IF (SELECT sum((p->>'orders')::bigint) FROM jsonb_array_elements(result#>'{executive,series}') p)<>2 THEN RAISE EXCEPTION 'SERIES_COUNT_WRONG'; END IF;
 BEGIN
  PERFORM public.admin_dashboard_metrics('1990-01-02','1990-01-01');
  RAISE EXCEPTION 'INVALID_RANGE_ALLOWED';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'DASHBOARD_INVALID_PERIOD' THEN RAISE; END IF; END;
 queues:=public.admin_ops_queue();
 IF NOT(queues ? 'offers_pending') OR NOT(queues ? 'orders_unassigned')
  OR jsonb_array_length(queues->'order_samples')>12 THEN RAISE EXCEPTION 'QUEUE_CONTRACT_WRONG'; END IF;
 RESET ROLE;
END $$;
ROLLBACK;
-- Verified-payment positive fixtures, query plans and tenant RLS must also be
-- homologated alongside payment-hardening.sql in the isolated database.
