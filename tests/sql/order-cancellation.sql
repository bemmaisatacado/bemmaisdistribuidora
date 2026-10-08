-- Disposable LOCAL Supabase only, after all migrations. NEVER production.
-- psql -X -v ON_ERROR_STOP=1 -f tests/sql/order-cancellation.sql
BEGIN;
DO $$
DECLARE
 actor uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid(); org uuid:=gen_random_uuid();
 owner_b uuid:=gen_random_uuid(); product uuid:=gen_random_uuid(); variant uuid:=gen_random_uuid();
 ord uuid:=gen_random_uuid(); blocked uuid:=gen_random_uuid(); item_a uuid:=gen_random_uuid(); item_b uuid:=gen_random_uuid();
 pay uuid:=gen_random_uuid(); result jsonb; initial_count bigint;
BEGIN
 INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES(actor,actor::text||'@example.invalid','{}'),(outsider,outsider::text||'@example.invalid','{}');
 INSERT INTO public.organization_members(organization_id,user_id,role_key)
 SELECT id,actor,'platform_super_admin' FROM public.organizations WHERE is_platform
 ON CONFLICT(organization_id,user_id) DO UPDATE SET role_key='platform_super_admin';
 INSERT INTO public.organizations(id,name,slug) VALUES(org,'Cancellation local test',org::text),(owner_b,'Other stock owner',owner_b::text);
 INSERT INTO public.products(id,name,slug) VALUES(product,'Historical item',product::text);
 INSERT INTO public.product_variants(id,product_id,sku) VALUES(variant,product,variant::text);
 INSERT INTO public.orders(id,organization_id,status,total_amount,subtotal_amount)
 VALUES(ord,org,'pending_payment',20,20),(blocked,org,'pending_payment',20,20);
 INSERT INTO public.order_items(id,order_id,organization_id,product_id,variant_id,product_name_snapshot,sku_snapshot,quantity,unit_price,subtotal_amount,total_amount,stock_owner_organization_id)
 VALUES(item_a,ord,org,product,variant,'Historical item','historical-sku',2,5,10,10,org),
 (item_b,ord,org,product,variant,'Historical item','historical-sku',2,5,10,10,owner_b);
 INSERT INTO public.inventory_movements(organization_id,variant_id,movement_type,quantity)
 VALUES(org,variant,'in',5),(owner_b,variant,'in',5);
 INSERT INTO public.inventory_movements(organization_id,variant_id,movement_type,quantity,reference_type,reference_id)
 VALUES(org,variant,'reserve',2,'order_item',item_a::text),(owner_b,variant,'reserve',2,'order_item',item_b::text);
 INSERT INTO public.payments(id,order_id,organization_id,amount,status) VALUES(pay,blocked,org,20,'processing');
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',outsider)::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 BEGIN
  PERFORM public.cancel_order(ord,'pending_payment','Customer request');
  RAISE EXCEPTION 'Unauthorized cancellation accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'FORBIDDEN' THEN RAISE; END IF; END;
 EXECUTE 'RESET ROLE';
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',actor)::text,true);
 BEGIN
  PERFORM public.cancel_order(blocked,'pending_payment','Customer request');
  RAISE EXCEPTION 'Processing payment accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'ORDER_PAYMENT_UNCERTAIN' THEN RAISE; END IF; END;
 BEGIN
  PERFORM public.cancel_order(ord,'draft','Customer request');
  RAISE EXCEPTION 'Stale status accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'ORDER_STATUS_CONFLICT' THEN RAISE; END IF; END;
 -- Deliberate exception AFTER the RPC: all cancellation effects must roll back.
 BEGIN
  PERFORM public.cancel_order(ord,'pending_payment','Customer request');
  RAISE EXCEPTION 'TEST_ROLLBACK';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'TEST_ROLLBACK' THEN RAISE; END IF; END;
 IF (SELECT status FROM public.orders WHERE id=ord)<>'pending_payment'
  OR EXISTS(SELECT 1 FROM public.inventory_movements WHERE movement_type='release' AND organization_id IN(org,owner_b)) THEN
  RAISE EXCEPTION 'Rollback failed'; END IF;
 -- Force one owner's release to fail: all releases and order must roll back.
 INSERT INTO public.inventory_movements(organization_id,variant_id,movement_type,quantity) VALUES(owner_b,variant,'release',2);
 BEGIN
  PERFORM public.cancel_order(ord,'pending_payment','Customer request');
  RAISE EXCEPTION 'Invalid reservation accepted';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='Invalid reservation accepted' THEN RAISE; END IF;
 END;
 IF (SELECT status FROM public.orders WHERE id=ord)<>'pending_payment'
  OR EXISTS(SELECT 1 FROM public.inventory_movements WHERE reference_type='inventory_reservation_release'
   AND reference_id IN(SELECT id::text FROM public.inventory_movements WHERE reference_type='order_item' AND reference_id IN(item_a::text,item_b::text))) THEN
  RAISE EXCEPTION 'Partial release/order remained'; END IF;
 -- Append-only restoration of this deliberately inconsistent TEST fixture.
 INSERT INTO public.inventory_movements(organization_id,variant_id,movement_type,quantity) VALUES(owner_b,variant,'reserve',2);
 EXECUTE 'SET LOCAL ROLE authenticated';
 result:=public.cancel_order(ord,'pending_payment','Customer request');
 IF result->>'idempotent'<>'false' THEN RAISE EXCEPTION 'First cancellation failed'; END IF;
 result:=public.cancel_order(ord,'pending_payment','Customer request');
 IF result->>'idempotent'<>'true' THEN RAISE EXCEPTION 'Retry not idempotent'; END IF;
 BEGIN
  PERFORM public.cancel_order(ord,'pending_payment','Different reason');
  RAISE EXCEPTION 'Reason silently overwritten';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'CANCELLATION_IDEMPOTENCY_CONFLICT' THEN RAISE; END IF; END;
 EXECUTE 'RESET ROLE';
 IF (SELECT count(*) FROM public.inventory_movements WHERE reference_type='inventory_reservation_release'
  AND reference_id IN(SELECT id::text FROM public.inventory_movements WHERE reference_type='order_item' AND reference_id IN(item_a::text,item_b::text)))<>2 THEN
  RAISE EXCEPTION 'Missing/duplicate releases'; END IF;
 IF EXISTS(SELECT 1 FROM public.inventory_balances WHERE variant_id=variant AND (on_hand<>5 OR reserved<>0)) THEN RAISE EXCEPTION 'Balance changed incorrectly'; END IF;
 IF (SELECT total_amount FROM public.orders WHERE id=ord)<>20
  OR EXISTS(SELECT 1 FROM public.order_items WHERE order_id=ord AND product_name_snapshot<>'Historical item') THEN
  RAISE EXCEPTION 'Historical values/snapshots changed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.audit_logs WHERE entity_type='orders' AND entity_id=ord::text
  AND actor_id=actor AND after_data->>'cancellation_reason'='Customer request') THEN RAISE EXCEPTION 'Audit missing'; END IF;
END $$;
ROLLBACK;
