-- ISOLATED disposable Supabase ONLY, all migrations applied beforehand.
-- psql -X -v ON_ERROR_STOP=1 -v BEMMAIS_ISOLATED_TEST=on -f tests/sql/super-admin-hardening.sql
-- The acknowledgement is not a substitute for verifying the connection target.
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
#variable_conflict use_variable
DECLARE
 admin_id uuid:=gen_random_uuid(); operator_id uuid:=gen_random_uuid(); outsider_id uuid:=gen_random_uuid();
 platform_id uuid; org_id uuid:=gen_random_uuid(); foreign_org uuid:=gen_random_uuid();
 store_id uuid:=gen_random_uuid(); foreign_store uuid:=gen_random_uuid(); product_id uuid:=gen_random_uuid();
 variant_id uuid:=gen_random_uuid(); listing_id uuid:=gen_random_uuid(); order_id uuid; item_id uuid;
 domain_id uuid; revision integer; snap jsonb; result jsonb; again jsonb; released bigint; count_before bigint;
 slug text:='hardening-'||replace(gen_random_uuid()::text,'-','');
 items jsonb; address jsonb:='{"recipient":"Isolated recipient","postal_code":"01001000","street":"Test street","number":"1","district":"Test district","city":"Test city","state":"SP","country":"BR"}';
BEGIN
 IF has_function_privilege('anon','public.store_draft_snapshot(uuid)','EXECUTE') THEN RAISE EXCEPTION 'ANON_SNAPSHOT_GRANT'; END IF;
 IF has_function_privilege('authenticated','bemmais_private.store_draft_snapshot_base(uuid)','EXECUTE') THEN RAISE EXCEPTION 'PRIVATE_IMPLEMENTATION_GRANT'; END IF;
 IF has_schema_privilege('authenticated','bemmais_private','USAGE') THEN RAISE EXCEPTION 'PRIVATE_SCHEMA_GRANT'; END IF;
 INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
  (admin_id,admin_id::text||'@example.invalid','{}'),(operator_id,operator_id::text||'@example.invalid','{}'),
  (outsider_id,outsider_id::text||'@example.invalid','{}');
 SELECT id INTO platform_id FROM public.organizations WHERE is_platform;
 INSERT INTO public.organization_members(organization_id,user_id,role_key) VALUES(platform_id,admin_id,'platform_super_admin') ON CONFLICT DO NOTHING;
 PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
 INSERT INTO public.organizations(id,name) VALUES(org_id,'Isolated store owner'),(foreign_org,'Isolated foreign owner');
 INSERT INTO public.organization_capabilities(organization_id,capability) VALUES(org_id,'operate_store'),(foreign_org,'operate_store');
 INSERT INTO public.organization_members(organization_id,user_id,role_key) VALUES(org_id,operator_id,'org_owner'),(foreign_org,outsider_id,'org_owner');
 INSERT INTO public.stores(id,organization_id,name,slug,logo_url) VALUES(store_id,org_id,'Isolated store',slug,'/isolated-logo.svg'),
  (foreign_store,foreign_org,'Foreign store',slug||'-foreign','/isolated-logo.svg');
 INSERT INTO public.products(id,name,slug,status) VALUES(product_id,'Isolated product',slug||'-product','approved');
 INSERT INTO public.product_variants(id,product_id,sku) VALUES(variant_id,product_id,slug||'-sku');
 INSERT INTO public.store_listings(id,store_id,organization_id,product_id,retail_price,is_published)
  VALUES(listing_id,store_id,org_id,product_id,25.50,true);
 INSERT INTO public.inventory_movements(organization_id,variant_id,movement_type,quantity) VALUES(org_id,variant_id,'in',10);
 SELECT d.id INTO domain_id FROM public.store_domains d WHERE d.store_id=store_id AND d.type='platform_subdomain';
 -- Qualify fixture predicates to avoid PL/pgSQL variable/column ambiguity.
 PERFORM set_config('request.jwt.claim.sub',operator_id::text,true);
 SET LOCAL ROLE authenticated;
 PERFORM public.store_draft_snapshot(store_id);
 BEGIN
  PERFORM public.store_draft_snapshot(foreign_store);
  RAISE EXCEPTION 'FOREIGN_DRAFT_EXPOSED';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'STORE_FORBIDDEN' THEN RAISE; END IF; END;
 BEGIN
  UPDATE public.stores SET status='published' WHERE id=store_id;
  RAISE EXCEPTION 'DIRECT_PUBLISH_ALLOWED';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'STORE_PUBLICATION_RPC_REQUIRED' THEN RAISE; END IF; END;
 BEGIN
  UPDATE public.stores SET published_snapshot='{}' WHERE id=store_id;
  RAISE EXCEPTION 'DIRECT_SNAPSHOT_ALLOWED';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'STORE_PUBLICATION_RPC_REQUIRED' THEN RAISE; END IF; END;
 SELECT s.draft_revision INTO revision FROM public.stores s WHERE s.id=store_id;
 UPDATE public.stores SET name='Updated isolated name' WHERE id=store_id;
 IF (SELECT s.draft_revision FROM public.stores s WHERE s.id=store_id)<>revision+1 THEN RAISE EXCEPTION 'REVISION_WRONG'; END IF;
 SELECT s.draft_revision INTO revision FROM public.stores s WHERE s.id=store_id;
 INSERT INTO public.store_sections(store_id,organization_id,type,config) VALUES(store_id,org_id,'hero','{}');
 IF (SELECT s.draft_revision FROM public.stores s WHERE s.id=store_id)<>revision+1 THEN RAISE EXCEPTION 'CHILD_REVISION_WRONG'; END IF;
 UPDATE public.store_sections ss SET config=ss.config WHERE ss.store_id=store_id;
 IF (SELECT s.draft_revision FROM public.stores s WHERE s.id=store_id)<>revision+1 THEN RAISE EXCEPTION 'NOOP_REVISION_WRONG'; END IF;
 PERFORM public.change_store_status(store_id,'published');
 SELECT s.published_snapshot INTO snap FROM public.stores s WHERE s.id=store_id;
 UPDATE public.stores SET name='New draft only' WHERE id=store_id;
 IF (SELECT s.published_snapshot FROM public.stores s WHERE s.id=store_id) IS DISTINCT FROM snap THEN RAISE EXCEPTION 'PUBLIC_SNAPSHOT_MUTATED'; END IF;
 PERFORM public.change_store_slug(store_id,slug||'-changed',true);
 IF NOT EXISTS(SELECT 1 FROM public.store_domains d WHERE d.store_id=store_id AND d.hostname=slug||'-changed.bemmaisdistribuidora.com.br') THEN RAISE EXCEPTION 'SLUG_DOMAIN_INCONSISTENT'; END IF;
 BEGIN
  UPDATE public.store_domains SET hostname=slug||'-forged.bemmaisdistribuidora.com.br' WHERE id=domain_id;
  RAISE EXCEPTION 'DIRECT_DOMAIN_CHANGE_ALLOWED';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT IN ('DOMAIN_HOSTNAME_IMMUTABLE','O subdomínio deve usar o slug seguro da loja') THEN RAISE; END IF; END;
 BEGIN
  INSERT INTO public.inventory_movements(organization_id,variant_id,movement_type,quantity) VALUES(org_id,variant_id,'reserve',1);
  RAISE EXCEPTION 'MANUAL_RESERVE_ALLOWED';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'INVENTORY_OPERATIONAL_RPC_REQUIRED' THEN RAISE; END IF; END;
 BEGIN
  INSERT INTO public.inventory_movements(organization_id,variant_id,movement_type,quantity) VALUES(org_id,variant_id,'release',1);
  RAISE EXCEPTION 'MANUAL_RELEASE_ALLOWED';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'INVENTORY_OPERATIONAL_RPC_REQUIRED' THEN RAISE; END IF; END;
 items:=jsonb_build_array(jsonb_build_object('listingId',listing_id,'variantId',variant_id,'quantity',2));
 result:=public.create_storefront_order(slug||'-changed',items,address,'isolated-retry');
 again:=public.create_storefront_order(slug||'-changed',items,address,'isolated-retry');
 IF result->>'order_id' IS DISTINCT FROM again->>'order_id' THEN RAISE EXCEPTION 'CHECKOUT_DUPLICATED'; END IF;
 order_id:=(result->>'order_id')::uuid;
 SELECT oi.id INTO item_id FROM public.order_items oi WHERE oi.order_id=order_id;
 IF (SELECT b.reserved FROM public.inventory_balances b WHERE b.organization_id=org_id AND b.variant_id=variant_id)<>2
 OR (SELECT b.on_hand FROM public.inventory_balances b WHERE b.organization_id=org_id AND b.variant_id=variant_id)<>10 THEN RAISE EXCEPTION 'RESERVATION_BALANCE_WRONG'; END IF;
 SELECT count(*) INTO count_before FROM public.orders o WHERE o.buyer_user_id=operator_id;
 BEGIN
  PERFORM public.create_storefront_order(slug||'-changed',jsonb_build_array(jsonb_build_object('listingId',listing_id,'variantId',variant_id,'quantity',99)),address,'isolated-insufficient');
  RAISE EXCEPTION 'INSUFFICIENT_ACCEPTED';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'INSUFFICIENT_STOCK' THEN RAISE; END IF; END;
 IF (SELECT count(*) FROM public.orders o WHERE o.buyer_user_id=operator_id)<>count_before THEN RAISE EXCEPTION 'PARTIAL_ORDER'; END IF;
 RESET ROLE;
 PERFORM set_config('request.jwt.claim.sub',outsider_id::text,true);
 SET LOCAL ROLE authenticated;
 IF EXISTS(SELECT 1 FROM public.stores s WHERE s.id=store_id) THEN RAISE EXCEPTION 'STORE_RLS_LEAK'; END IF;
 BEGIN
  PERFORM public.change_store_status(store_id,'draft');
  RAISE EXCEPTION 'FOREIGN_STATUS_ALLOWED';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'STORE_FORBIDDEN' THEN RAISE; END IF; END;
 RESET ROLE;
 PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
 PERFORM public.cancel_order(order_id,'pending_payment','Isolated regression cancellation');
 PERFORM public.release_order_item_reservation(item_id);
 SELECT count(*) INTO released FROM public.inventory_movements m WHERE m.movement_type='release'
  AND m.reference_type='inventory_reservation_release' AND m.reference_id IN
  (SELECT r.id::text FROM public.inventory_movements r WHERE r.reference_id=item_id::text AND r.movement_type='reserve');
 IF released<>1 THEN RAISE EXCEPTION 'RELEASE_DUPLICATED'; END IF;
 IF (SELECT b.reserved FROM public.inventory_balances b WHERE b.organization_id=org_id AND b.variant_id=variant_id)<>0 THEN RAISE EXCEPTION 'RELEASE_BALANCE_WRONG'; END IF;
END $$;
ROLLBACK;
