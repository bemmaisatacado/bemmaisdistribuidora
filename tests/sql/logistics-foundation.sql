-- LOCAL DISPOSABLE Supabase ONLY, after all migrations. NOT EXECUTED.
-- psql -X -v ON_ERROR_STOP=1 -f tests/sql/logistics-foundation.sql
BEGIN;
DO $$
DECLARE
 actor uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid(); platform uuid;
 owner_a uuid:=gen_random_uuid(); owner_b uuid:=gen_random_uuid(); ord uuid:=gen_random_uuid();
 product uuid:=gen_random_uuid(); variant uuid:=gen_random_uuid(); item_a uuid:=gen_random_uuid(); item_b uuid:=gen_random_uuid();
 pay uuid:=gen_random_uuid(); fid uuid; sid uuid; second_sid uuid; result jsonb; before_stock bigint;
 origin jsonb:='{"recipient":"Local test origin","postal_code":"39400000","street":"Test street","number":"1","district":"Test district","city":"Test city","state":"MG","country":"BR"}';
 packages jsonb;
BEGIN
 IF public.shipping_address_complete('{"recipient":"Historical","city":"City"}') THEN RAISE EXCEPTION 'Incomplete address accepted'; END IF;
 IF NOT public.shipping_address_complete(origin) THEN RAISE EXCEPTION 'Complete address rejected'; END IF;
 IF public.shipping_transition_allowed('draft','delivered') OR public.shipping_transition_allowed('draft','label_created') THEN RAISE EXCEPTION 'Fake external state permitted'; END IF;
 IF has_table_privilege('authenticated','public.shipments','UPDATE') OR has_table_privilege('anon','public.shipments','INSERT') THEN RAISE EXCEPTION 'Unsafe grants'; END IF;
 INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES(actor,actor::text||'@example.invalid','{}'),(outsider,outsider::text||'@example.invalid','{}');
 SELECT id INTO platform FROM public.organizations WHERE is_platform;
 INSERT INTO public.organization_members(organization_id,user_id,role_key) VALUES(platform,actor,'platform_super_admin')
 ON CONFLICT(organization_id,user_id) DO UPDATE SET role_key='platform_super_admin';
 INSERT INTO public.organizations(id,name,slug) VALUES(owner_a,'Local logistics A',owner_a::text),(owner_b,'Local logistics B',owner_b::text);
 INSERT INTO public.supplier_profiles(organization_id,fulfillment_mode) VALUES(owner_a,'supplier'),(owner_b,'supplier');
 INSERT INTO public.products(id,name,slug) VALUES(product,'Local test product',product::text);
 INSERT INTO public.product_variants(id,product_id,sku) VALUES(variant,product,variant::text);
 INSERT INTO public.orders(id,organization_id,buyer_user_id,status,subtotal_amount,total_amount,shipping_address)
 VALUES(ord,platform,actor,'pending_payment',20,20,origin);
 INSERT INTO public.order_items(id,order_id,organization_id,product_id,variant_id,product_name_snapshot,sku_snapshot,quantity,unit_price,subtotal_amount,total_amount,
  stock_owner_organization_id,supplier_organization_id,seller_organization_id)
 VALUES(item_a,ord,platform,product,variant,'Historical A','BM-test-a',2,5,10,10,owner_a,owner_a,platform),
 (item_b,ord,platform,product,variant,'Historical B','BM-test-b',2,5,10,10,owner_b,owner_b,platform);
 INSERT INTO public.payments(id,order_id,organization_id,buyer_user_id,amount,provider,provider_payment_id,status)
 VALUES(pay,ord,platform,actor,20,'local_test',pay::text,'pending');
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','service_role')::text,true);
 -- Trusted isolated fixture, NOT real gateway confirmation or a production approval.
 PERFORM public.confirm_verified_payment_event('local_test',pay::text,'confirmed',pay,pay::text,20,'BRL','paid','{}');
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',actor)::text,true);
 PERFORM public.start_order_fulfillment(ord);
 SELECT fulfillment_id INTO fid FROM public.order_items WHERE id=item_a;
 BEGIN
  PERFORM public.prepare_fulfillment_shipment(fid); RAISE EXCEPTION 'Unprepared fulfillment accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'FULFILLMENT_NOT_READY' THEN RAISE; END IF; END;
 FOR fid IN SELECT id FROM public.order_fulfillments WHERE order_id=ord ORDER BY id LOOP
  PERFORM public.advance_order_fulfillment(fid,'ready_to_pick','picking');
  PERFORM public.advance_order_fulfillment(fid,'picking','packed');
  PERFORM public.advance_order_fulfillment(fid,'packed','ready_to_ship');
 END LOOP;
 SELECT count(*) INTO before_stock FROM public.inventory_movements;
 SELECT fulfillment_id INTO fid FROM public.order_items WHERE id=item_a;
 EXECUTE 'SET LOCAL ROLE authenticated';
 result:=public.prepare_fulfillment_shipment(fid); sid:=(result->>'shipment_id')::uuid;
 result:=public.prepare_fulfillment_shipment(fid);
 IF result->>'idempotent'<>'true' OR result->>'shipment_id'<>sid::text THEN RAISE EXCEPTION 'Duplicate shipment'; END IF;
 second_sid:=(public.prepare_fulfillment_shipment((SELECT fulfillment_id FROM public.order_items WHERE id=item_b))->>'shipment_id')::uuid;
 IF second_sid=sid THEN RAISE EXCEPTION 'Suppliers consolidated'; END IF;
 IF (SELECT recipient_snapshot FROM public.shipments WHERE id=sid) IS DISTINCT FROM origin THEN RAISE EXCEPTION 'Snapshot lost'; END IF;
 packages:=jsonb_build_array(jsonb_build_object('quantity',1,'weight','1.000','length','30','width','20','height','15',
  'weight_unit','kg','dimension_unit','cm','measured',true,'items',jsonb_build_array(jsonb_build_object('order_item_id',item_a,'quantity',2))));
 PERFORM public.configure_shipment(sid,0,'carrier',NULL,false,packages);
 IF (SELECT status FROM public.shipments WHERE id=sid)<>'draft' THEN RAISE EXCEPTION 'Missing origin not blocked'; END IF;
 result:=public.configure_shipment(sid,1,'carrier',origin,true,packages);
 result:=public.configure_shipment(sid,1,'carrier',origin,true,packages);
 IF result->>'idempotent'<>'true' OR (SELECT version FROM public.shipments WHERE id=sid)<>2 THEN RAISE EXCEPTION 'Configuration retry duplicated'; END IF;
 IF (SELECT status FROM public.shipments WHERE id=sid)<>'ready_for_quote' THEN RAISE EXCEPTION 'Readiness incorrect'; END IF;
 BEGIN
  PERFORM public.configure_shipment(sid,1,'pickup',origin,true,packages); RAISE EXCEPTION 'Stale update accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'SHIPMENT_VERSION_CONFLICT' THEN RAISE; END IF; END;
 BEGIN
  PERFORM public.configure_shipment(sid,2,'carrier',origin,true,jsonb_set(packages,'{0,items,0,order_item_id}',to_jsonb(item_b::text)));
  RAISE EXCEPTION 'Cross fulfillment accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'PACKAGE_ITEM_INVALID' THEN RAISE; END IF; END;
 IF (SELECT version FROM public.shipments WHERE id=sid)<>2 OR (SELECT count(*) FROM public.shipment_packages WHERE shipment_id=sid)<>2 THEN RAISE EXCEPTION 'Partial package revision'; END IF;
 IF (public.admin_order_logistics(ord)->>'provider_configured')<>'false' THEN RAISE EXCEPTION 'Fake provider'; END IF;
 BEGIN
  UPDATE public.shipments SET status='ready_for_quote' WHERE id=sid; RAISE EXCEPTION 'Direct update accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 EXECUTE 'RESET ROLE';
 IF (SELECT count(*) FROM public.inventory_movements)<>before_stock THEN RAISE EXCEPTION 'Logistics wrote inventory'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.audit_logs WHERE entity_type='shipments' AND entity_id=sid::text AND actor_id=actor) THEN RAISE EXCEPTION 'Audit missing'; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',outsider)::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 IF EXISTS(SELECT 1 FROM public.shipments WHERE order_id=ord) THEN RAISE EXCEPTION 'RLS exposed shipment'; END IF;
 BEGIN
  PERFORM public.prepare_fulfillment_shipment(fid); RAISE EXCEPTION 'Unauthorized operation accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'FORBIDDEN' THEN RAISE; END IF; END;
 EXECUTE 'RESET ROLE';
END $$;
ROLLBACK;
-- Two-session concurrency and pending additional cases: docs/LOGISTICS_FOUNDATION_VALIDATION.md.
