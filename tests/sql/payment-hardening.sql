-- Run ONLY on a disposable local Supabase PostgreSQL with migrations installed.
-- psql -v ON_ERROR_STOP=1 -f tests/sql/payment-hardening.sql
-- No provider adapter is installed. These are internal trusted-backend fixtures.
BEGIN;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
DO $$
DECLARE
 org uuid:=gen_random_uuid(); buyer uuid:=gen_random_uuid(); product uuid:=gen_random_uuid();
 variant uuid:=gen_random_uuid(); ord uuid:=gen_random_uuid(); item uuid:=gen_random_uuid();
 pay uuid:=gen_random_uuid(); other_pay uuid:=gen_random_uuid(); failed_order uuid:=gen_random_uuid();
 failed_pay uuid:=gen_random_uuid(); failed_item uuid:=gen_random_uuid(); result jsonb; before_ledger jsonb; after_ledger jsonb;
BEGIN
 IF has_function_privilege('authenticated','public.process_payment_provider_event(text,text,text,uuid,public.payment_status,text,text,jsonb)','EXECUTE')
  OR has_function_privilege('authenticated','public.confirm_verified_payment_event(text,text,text,uuid,text,numeric,text,public.payment_status,jsonb)','EXECUTE') THEN
  RAISE EXCEPTION 'Public confirmation is executable'; END IF;
 INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES(buyer,'payment-local-test@example.invalid','{}');
 INSERT INTO public.organizations(id,name,slug) VALUES(org,'Local payment test',org::text);
 INSERT INTO public.products(id,name,slug) VALUES(product,'Local payment test',product::text);
 INSERT INTO public.product_variants(id,product_id,sku) VALUES(variant,product,'LOCAL-'||variant::text);
 INSERT INTO public.orders(id,organization_id,buyer_user_id,status,total_amount,subtotal_amount)
 VALUES(ord,org,buyer,'pending_payment',399.90,399.90),(failed_order,org,buyer,'pending_payment',399.90,399.90);
 INSERT INTO public.order_items(id,order_id,organization_id,product_id,variant_id,product_name_snapshot,sku_snapshot,
  quantity,unit_price,subtotal_amount,total_amount,stock_owner_organization_id)
 VALUES(item,ord,org,product,variant,'Historical test','LOCAL-'||variant::text,1,399.90,399.90,399.90,org),
 (failed_item,failed_order,org,product,variant,'Historical test','LOCAL-'||variant::text,1,399.90,399.90,399.90,org);
 INSERT INTO public.inventory_movements(organization_id,variant_id,movement_type,quantity) VALUES(org,variant,'in',2);
 INSERT INTO public.inventory_movements(organization_id,variant_id,movement_type,quantity,reference_type,reference_id)
 VALUES(org,variant,'reserve',1,'order_item',item::text),
 (org,variant,'reserve',1,'order_item',failed_item::text);
 SELECT jsonb_agg(to_jsonb(m) ORDER BY id) INTO before_ledger FROM public.inventory_movements m WHERE variant_id=variant;
 INSERT INTO public.payments(id,order_id,buyer_user_id,organization_id,provider,provider_payment_id,amount,currency,method,idempotency_key)
 VALUES(pay,ord,buyer,org,'local_fixture','bound-1',399.90,'BRL','pix','local-'||pay::text),
 (other_pay,ord,buyer,org,'local_fixture','bound-2',399.90,'BRL','card',NULL),
 (failed_pay,failed_order,buyer,org,'local_fixture','bound-3',399.90,'BRL','pix',NULL);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',buyer)::text,true);
 result:=public.create_order_payment(ord,'pix','local-'||pay::text);
 IF result->>'payment_id'<>pay::text OR result->>'idempotent'<>'true' THEN RAISE EXCEPTION 'Idempotency failed'; END IF;
 BEGIN
  PERFORM public.create_order_payment(ord,'card','local-'||pay::text);
  RAISE EXCEPTION 'Divergent method accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'PAYMENT_IDEMPOTENCY_CONFLICT' THEN RAISE; END IF; END;
 BEGIN
  UPDATE public.payments SET status='paid' WHERE id=pay;
  RAISE EXCEPTION 'Unverified paid accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'UNAUTHORIZED_PAYMENT' THEN RAISE; END IF; END;
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 BEGIN
  PERFORM public.confirm_verified_payment_event('local_fixture','invalid-amount','payment.paid',pay,'bound-1',1.00,'BRL','paid');
  RAISE EXCEPTION 'Wrong amount accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'PROVIDER_EVENT_INVALID' THEN RAISE; END IF; END;
 IF EXISTS(SELECT 1 FROM public.payment_provider_events WHERE provider_event_id='invalid-amount') THEN RAISE EXCEPTION 'Failed event did not roll back'; END IF;
 PERFORM public.confirm_verified_payment_event('local_fixture','failed-1','payment.failed',failed_pay,'bound-3',399.90,'BRL','failed');
 IF (SELECT status FROM public.orders WHERE id=failed_order)<>'pending_payment' THEN RAISE EXCEPTION 'Failure changed order'; END IF;
 PERFORM public.confirm_verified_payment_event('local_fixture','paid-1','payment.paid',pay,'bound-1',399.90,'BRL','paid');
 result:=public.confirm_verified_payment_event('local_fixture','paid-1','payment.paid',pay,'bound-1',399.90,'BRL','paid');
 IF result->>'idempotent'<>'true' OR (SELECT count(*) FROM public.payment_provider_events WHERE provider_event_id='paid-1')<>1 THEN
  RAISE EXCEPTION 'Event duplicated'; END IF;
 IF (SELECT status FROM public.orders WHERE id=ord)<>'paid' OR (SELECT payment_status FROM public.orders WHERE id=ord)<>'paid' THEN
  RAISE EXCEPTION 'Order not synchronized'; END IF;
 BEGIN
  PERFORM public.confirm_verified_payment_event('local_fixture','late-processing','payment.processing',pay,'bound-1',399.90,'BRL','processing');
  RAISE EXCEPTION 'Paid regressed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'PAYMENT_INVALID_TRANSITION' THEN RAISE; END IF; END;
 BEGIN
  PERFORM public.confirm_verified_payment_event('local_fixture','second-paid','payment.paid',other_pay,'bound-2',399.90,'BRL','paid');
  RAISE EXCEPTION 'Second payment accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'PAYMENT_ALREADY_PAID' THEN RAISE; END IF; END;
 IF EXISTS(SELECT 1 FROM public.payment_provider_events WHERE provider_event_id='second-paid') THEN RAISE EXCEPTION 'Second payment not rolled back'; END IF;
 SELECT jsonb_agg(to_jsonb(m) ORDER BY id) INTO after_ledger FROM public.inventory_movements m WHERE variant_id=variant;
 IF before_ledger IS DISTINCT FROM after_ledger THEN RAISE EXCEPTION 'Payment changed reservation ledger'; END IF;
 IF public.sanitize_payment_metadata('{"EVENT":"paid","Authorization":"secret","nested":{"CVV":"123"},"list":[{"token":"private"}]}')
  <> '{"event":"paid"}'::jsonb THEN RAISE EXCEPTION 'Metadata leak'; END IF;
END $$;
ROLLBACK;
