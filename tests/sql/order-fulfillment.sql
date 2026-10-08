-- LOCAL DISPOSABLE Supabase ONLY. Requires all migrations, never production.
-- psql -X -v ON_ERROR_STOP=1 -f tests/sql/order-fulfillment.sql
-- All fixtures are rolled back. This file has NOT been executed by Node tests.
BEGIN;
DO $$
DECLARE
 actor uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid(); platform uuid;
 owner_a uuid:=gen_random_uuid(); owner_b uuid:=gen_random_uuid();
 product uuid:=gen_random_uuid(); variant uuid:=gen_random_uuid(); ord uuid:=gen_random_uuid();
 pay uuid:=gen_random_uuid(); item_a uuid:=gen_random_uuid(); item_b uuid:=gen_random_uuid();
 item_c uuid:=gen_random_uuid(); uncontrolled uuid:=gen_random_uuid(); fid uuid; fid_b uuid;
 reservation_b bigint; result jsonb; swap_id uuid; cancelled_order uuid:=gen_random_uuid();
BEGIN
 -- Deterministic item order ensures the invalid second item follows one valid output.
 IF item_a>item_b THEN swap_id:=item_a; item_a:=item_b; item_b:=swap_id; END IF;
 INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES(actor,actor::text||'@example.invalid','{}'),(outsider,outsider::text||'@example.invalid','{}');
 SELECT id INTO platform FROM public.organizations WHERE is_platform;
 INSERT INTO public.organization_members(organization_id,user_id,role_key) VALUES(platform,actor,'platform_super_admin')
 ON CONFLICT(organization_id,user_id) DO UPDATE SET role_key='platform_super_admin';
 INSERT INTO public.organizations(id,name,slug) VALUES(owner_a,'Fulfillment local A',owner_a::text),(owner_b,'Fulfillment local B',owner_b::text);
 INSERT INTO public.supplier_profiles(organization_id,fulfillment_mode) VALUES(owner_a,'bemmais'),(owner_b,'supplier');
 INSERT INTO public.products(id,name,slug) VALUES(product,'Current product',product::text);
 INSERT INTO public.product_variants(id,product_id,sku) VALUES(variant,product,variant::text);
 INSERT INTO public.orders(id,organization_id,buyer_user_id,status,total_amount,subtotal_amount)
 VALUES(ord,platform,actor,'pending_payment',40,40);
 INSERT INTO public.order_items(id,order_id,organization_id,product_id,variant_id,product_name_snapshot,sku_snapshot,
  quantity,unit_price,subtotal_amount,total_amount,stock_owner_organization_id,supplier_organization_id,seller_organization_id)
 VALUES(item_a,ord,platform,product,variant,'Historical product','historical-sku',2,5,10,10,owner_a,owner_a,platform),
 (item_b,ord,platform,product,variant,'Historical product','historical-sku',2,5,10,10,owner_a,owner_a,platform),
 (item_c,ord,platform,product,variant,'Historical product','historical-sku',2,5,10,10,owner_b,owner_b,platform),
 (uncontrolled,ord,platform,product,variant,'Historical product','historical-sku',2,5,10,10,NULL,owner_b,platform);
 INSERT INTO public.inventory_movements(organization_id,variant_id,movement_type,quantity) VALUES(owner_a,variant,'in',10),(owner_b,variant,'in',10);
 INSERT INTO public.inventory_movements(organization_id,variant_id,movement_type,quantity,reference_type,reference_id)
 VALUES(owner_a,variant,'reserve',2,'order_item',item_a::text),(owner_a,variant,'reserve',2,'order_item',item_b::text),
 (owner_b,variant,'reserve',2,'order_item',item_c::text);
 SELECT id INTO reservation_b FROM public.inventory_movements WHERE reference_type='order_item' AND reference_id=item_b::text;
 INSERT INTO public.payments(id,order_id,organization_id,buyer_user_id,amount,provider,provider_payment_id,status)
 VALUES(pay,ord,platform,actor,40,'local_test',pay::text,'pending');
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',actor)::text,true);
 BEGIN
  PERFORM public.start_order_fulfillment(ord); RAISE EXCEPTION 'Unpaid order accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'ORDER_NOT_PAID' THEN RAISE; END IF; END;
 -- Trusted confirmation fixture, NOT a real provider integration or production approval.
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','service_role')::text,true);
 PERFORM public.confirm_verified_payment_event('local_test',pay::text,'confirmed',pay,pay::text,40,'BRL','paid','{}');
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',actor)::text,true);
 BEGIN
  INSERT INTO public.payments(order_id,organization_id,buyer_user_id,amount,status) VALUES(ord,platform,actor,40,'processing');
  BEGIN
   PERFORM public.start_order_fulfillment(ord); RAISE EXCEPTION 'Uncertain payment accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'PAYMENT_UNCERTAIN' THEN RAISE; END IF; END;
  RAISE EXCEPTION 'RESET_UNCERTAIN_FIXTURE';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'RESET_UNCERTAIN_FIXTURE' THEN RAISE; END IF; END;
 INSERT INTO public.orders(id,organization_id,status) VALUES(cancelled_order,platform,'draft');
 PERFORM public.cancel_order(cancelled_order,'draft','Disposable fixture');
 BEGIN
  PERFORM public.start_order_fulfillment(cancelled_order); RAISE EXCEPTION 'Cancelled order accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'ORDER_NOT_PAID' THEN RAISE; END IF; END;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',outsider)::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 BEGIN
  PERFORM public.start_order_fulfillment(ord); RAISE EXCEPTION 'Unauthorized start accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'FORBIDDEN' THEN RAISE; END IF; END;
 EXECUTE 'RESET ROLE';
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',actor)::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 result:=public.start_order_fulfillment(ord);
 result:=public.start_order_fulfillment(ord);
 IF result->>'idempotent'<>'true' THEN RAISE EXCEPTION 'Start retry not idempotent'; END IF;
 SELECT fulfillment_id INTO fid FROM public.order_items WHERE id=item_a;
 IF fid IS DISTINCT FROM (SELECT fulfillment_id FROM public.order_items WHERE id=item_b) THEN RAISE EXCEPTION 'Group split incorrectly'; END IF;
 SELECT fulfillment_id INTO fid_b FROM public.order_items WHERE id=item_c;
 IF fid=fid_b OR (SELECT fulfillment_owner_organization_id FROM public.order_fulfillments WHERE id=fid)<>platform
 OR (SELECT stock_owner_organization_id FROM public.order_fulfillments WHERE id=fid)<>owner_a THEN RAISE EXCEPTION 'Owners mixed'; END IF;
 BEGIN
  UPDATE public.order_fulfillments SET status='ready_to_ship' WHERE id=fid;
  RAISE EXCEPTION 'Direct operational update accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.advance_order_fulfillment(fid,'ready_to_pick','ready_to_ship'); RAISE EXCEPTION 'Skipped lifecycle accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'FULFILLMENT_INVALID_TRANSITION' THEN RAISE; END IF; END;
 PERFORM public.advance_order_fulfillment(fid,'ready_to_pick','picking');
 PERFORM public.advance_order_fulfillment(fid,'picking','packed');
 IF EXISTS(SELECT 1 FROM public.inventory_movements WHERE reference_type='inventory_reservation_consumption' AND reference_id IN
  (SELECT id::text FROM public.inventory_movements WHERE reference_type='order_item' AND reference_id IN(item_a::text,item_b::text))) THEN RAISE EXCEPTION 'Picking consumed stock'; END IF;
 EXECUTE 'RESET ROLE';
 -- Second item was released: fail the entire group, including first item's output.
 BEGIN
 INSERT INTO public.inventory_movements(organization_id,variant_id,movement_type,quantity,reference_type,reference_id)
 VALUES(owner_a,variant,'release',2,'inventory_reservation_release',reservation_b::text);
 EXECUTE 'SET LOCAL ROLE authenticated';
 BEGIN
  PERFORM public.advance_order_fulfillment(fid,'packed','ready_to_ship'); RAISE EXCEPTION 'Released reservation consumed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'STOCK_RESERVATION_RELEASED' THEN RAISE; END IF; END;
 IF (SELECT status FROM public.order_fulfillments WHERE id=fid)<>'packed'
 OR EXISTS(SELECT 1 FROM public.inventory_movements WHERE reference_type='inventory_reservation_consumption'
  AND reference_id IN(SELECT id::text FROM public.inventory_movements WHERE reference_type='order_item' AND reference_id IN(item_a::text,item_b::text)))
 THEN RAISE EXCEPTION 'Partial operation survived'; END IF;
 EXECUTE 'RESET ROLE';
 RAISE EXCEPTION 'RESET_TEST_PHASE';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'RESET_TEST_PHASE' THEN RAISE; END IF;
 END;
 -- Subtransaction rolled back the deliberate TEST release, never editing the ledger.
 EXECUTE 'SET LOCAL ROLE authenticated';
 PERFORM public.advance_order_fulfillment(fid,'packed','ready_to_ship');
 PERFORM public.advance_order_fulfillment(fid,'packed','ready_to_ship');
 EXECUTE 'RESET ROLE';
 IF NOT EXISTS(SELECT 1 FROM public.inventory_balances WHERE organization_id=owner_a AND variant_id=variant AND on_hand=6 AND reserved=0)
 THEN RAISE EXCEPTION 'Multi-item consumption incorrect'; END IF;
 PERFORM public.advance_order_fulfillment(fid_b,'ready_to_pick','picking');
 PERFORM public.advance_order_fulfillment(fid_b,'picking','packed');
 EXECUTE 'SET LOCAL ROLE authenticated';
 result:=public.advance_order_fulfillment(fid_b,'packed','ready_to_ship');
 result:=public.advance_order_fulfillment(fid_b,'packed','ready_to_ship');
 IF result->>'idempotent'<>'true' THEN RAISE EXCEPTION 'Consumption retry duplicated'; END IF;
 EXECUTE 'RESET ROLE';
 IF NOT EXISTS(SELECT 1 FROM public.inventory_balances WHERE organization_id=owner_b AND variant_id=variant AND on_hand=8 AND reserved=0)
 THEN RAISE EXCEPTION 'Balance semantics incorrect'; END IF;
 IF (SELECT count(*) FROM public.inventory_movements WHERE movement_type='out' AND reference_type='inventory_reservation_consumption'
  AND reference_id=(SELECT id::text FROM public.inventory_movements WHERE movement_type='reserve' AND reference_type='order_item' AND reference_id=item_c::text))<>1
 THEN RAISE EXCEPTION 'Consumption duplicated'; END IF;
 BEGIN
  PERFORM public.cancel_order(ord,'paid','Test after consumption'); RAISE EXCEPTION 'Paid cancellation accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'ORDER_NOT_CANCELLABLE' THEN RAISE; END IF; END;
 PERFORM public.advance_order_fulfillment((SELECT fulfillment_id FROM public.order_items WHERE id=uncontrolled),'ready_to_pick','picking');
 PERFORM public.advance_order_fulfillment((SELECT fulfillment_id FROM public.order_items WHERE id=uncontrolled),'picking','packed');
 PERFORM public.advance_order_fulfillment((SELECT fulfillment_id FROM public.order_items WHERE id=uncontrolled),'packed','ready_to_ship');
 IF EXISTS(SELECT 1 FROM public.inventory_movements WHERE reference_type='order_item' AND reference_id=uncontrolled::text)
 OR EXISTS(SELECT 1 FROM public.order_items WHERE order_id=ord AND (product_name_snapshot<>'Historical product' OR quantity<>2 OR unit_price<>5))
 OR (SELECT total_amount FROM public.orders WHERE id=ord)<>40 THEN RAISE EXCEPTION 'Uncontrolled/history mutated'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.audit_logs WHERE entity_type='order_fulfillments' AND entity_id=fid_b::text AND actor_id=actor)
 THEN RAISE EXCEPTION 'Audit missing'; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',outsider)::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 IF EXISTS(SELECT 1 FROM public.order_fulfillments WHERE order_id=ord) THEN RAISE EXCEPTION 'RLS exposed groups'; END IF;
 BEGIN
  PERFORM public.advance_order_fulfillment(fid_b,'packed','ready_to_ship'); RAISE EXCEPTION 'Unauthorized retry accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'FORBIDDEN' THEN RAISE; END IF; END;
 EXECUTE 'RESET ROLE';
END $$;
ROLLBACK;
-- Additional TWO-SESSION concurrency protocol and pending cases are documented in
-- docs/ORDER_FULFILLMENT_VALIDATION.md. Do not substitute mocks for these checks.
