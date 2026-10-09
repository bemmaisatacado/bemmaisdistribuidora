-- Complete addresses; no legacy snapshots are overwritten.
ALTER TABLE public.stores ADD COLUMN allow_pickup boolean NOT NULL DEFAULT false;
ALTER TABLE public.orders ADD COLUMN delivery_method text NOT NULL DEFAULT 'delivery' CHECK(delivery_method IN('delivery','pickup'));
ALTER TABLE public.orders ADD COLUMN checkout_intent_fingerprint text;

CREATE OR REPLACE FUNCTION public.shipping_address_complete(_address jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $$
 SELECT coalesce(jsonb_typeof(_address)='object'
 AND NOT EXISTS(SELECT 1 FROM jsonb_each(CASE WHEN jsonb_typeof(_address)='object' THEN _address ELSE '{}'::jsonb END) WHERE jsonb_typeof(value)<>'string' OR length(value#>>'{}')>200)
 AND length(btrim(_address->>'recipient')) BETWEEN 1 AND 200
 AND (_address->>'postal_code') ~ '^[0-9]{8}$' AND (_address->>'postal_code')<>'00000000'
 AND length(btrim(_address->>'street')) BETWEEN 1 AND 200
 AND CASE WHEN _address->>'no_number'='true' THEN coalesce(btrim(_address->>'number'),'')=''
 ELSE length(btrim(_address->>'number')) BETWEEN 1 AND 20 AND lower(btrim(_address->>'number')) NOT IN('s/n','sn','sem número','sem numero') END
 AND coalesce(_address->>'no_number','false') IN('true','false')
 AND length(btrim(_address->>'district')) BETWEEN 1 AND 200
 AND length(btrim(_address->>'city')) BETWEEN 1 AND 200
 AND (_address->>'state') = ANY(string_to_array('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO',' '))
 AND (_address->>'country')='BR',false)
$$;
CREATE FUNCTION public.normalize_delivery_address(_raw jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=public,pg_temp AS $$
DECLARE _safe jsonb; _mode text;
BEGIN
 IF _raw IS NULL OR jsonb_typeof(_raw)<>'object' OR octet_length(_raw::text)>4096 THEN RAISE EXCEPTION 'ADDRESS_INCOMPLETE'; END IF;
 _mode:=coalesce(_raw->>'delivery_method','delivery');
 IF _mode NOT IN('delivery','pickup') THEN RAISE EXCEPTION 'ADDRESS_INCOMPLETE'; END IF;
 IF _mode='pickup' THEN RETURN jsonb_build_object('delivery_method','pickup'); END IF;
 SELECT coalesce(jsonb_object_agg(key,to_jsonb(CASE WHEN key='postal_code' THEN regexp_replace(btrim(value#>>'{}'),'[ .-]','','g')
  WHEN key IN('state','country') THEN upper(btrim(value#>>'{}')) ELSE btrim(value#>>'{}') END)), '{}') INTO _safe
 FROM jsonb_each(_raw) WHERE key IN('recipient','postal_code','street','number','complement','district','city','state','country','reference','no_number')
 AND jsonb_typeof(value)='string';
 IF NOT public.shipping_address_complete(_safe) THEN RAISE EXCEPTION 'ADDRESS_INCOMPLETE'; END IF;
 RETURN _safe || jsonb_build_object('delivery_method','delivery');
END $$;
CREATE FUNCTION public.storefront_delivery_options(_slug text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('pickup',allow_pickup) FROM public.stores WHERE slug=lower(btrim(_slug)) AND status='published'
$$;
REVOKE ALL ON FUNCTION public.storefront_delivery_options(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.storefront_delivery_options(text) TO anon,authenticated;
CREATE FUNCTION public.guard_order_address_snapshot()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.shipping_address IS DISTINCT FROM OLD.shipping_address OR NEW.delivery_method IS DISTINCT FROM OLD.delivery_method
 OR NEW.checkout_intent_fingerprint IS DISTINCT FROM OLD.checkout_intent_fingerprint THEN RAISE EXCEPTION 'ADDRESS_SNAPSHOT_IMMUTABLE'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_order_address BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.guard_order_address_snapshot();
-- Membership alone must not disclose personal addresses.
DROP POLICY "orders read" ON public.orders;
CREATE POLICY "orders read" ON public.orders FOR SELECT TO authenticated USING(public.is_platform_admin(auth.uid()) OR buyer_user_id=auth.uid());

CREATE TABLE public.order_delivery_address_corrections(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES public.orders(id),
 revision integer NOT NULL CHECK(revision>0), address jsonb NOT NULL CHECK(public.shipping_address_complete(address)),
 reason_code text NOT NULL CHECK(reason_code IN('legacy_incomplete','customer_confirmed_correction')),
 created_by uuid NOT NULL REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(order_id,revision)
);
ALTER TABLE public.order_delivery_address_corrections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_delivery_address_corrections FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.order_delivery_address_corrections TO authenticated;
CREATE POLICY "address corrections platform" ON public.order_delivery_address_corrections FOR SELECT TO authenticated USING(public.is_platform_admin(auth.uid()));
CREATE FUNCTION public.guard_address_correction()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_OP<>'INSERT' OR NOT public.is_platform_admin(auth.uid()) OR current_setting('bemmais.address_correction',true) IS DISTINCT FROM 'allowed' THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_address_correction BEFORE INSERT OR UPDATE OR DELETE ON public.order_delivery_address_corrections FOR EACH ROW EXECUTE FUNCTION public.guard_address_correction();
CREATE TRIGGER audit_address_correction AFTER INSERT ON public.order_delivery_address_corrections FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
CREATE FUNCTION public.order_effective_delivery_address(_order_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce((SELECT address FROM public.order_delivery_address_corrections WHERE order_id=o.id ORDER BY revision DESC LIMIT 1),o.shipping_address)
 FROM public.orders o WHERE o.id=_order_id
$$;
REVOKE ALL ON FUNCTION public.order_effective_delivery_address(uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.correct_legacy_order_address(_order_id uuid,_expected_revision integer,_address jsonb,_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE _o public.orders%ROWTYPE; _a jsonb; _last public.order_delivery_address_corrections%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 SELECT * INTO _o FROM public.orders WHERE id=_order_id FOR UPDATE;
 IF NOT FOUND OR _o.status='cancelled' OR _o.delivery_method<>'delivery' OR public.shipping_address_complete(_o.shipping_address) THEN RAISE EXCEPTION 'ADDRESS_CORRECTION_NOT_ALLOWED'; END IF;
 _a:=public.normalize_delivery_address(_address)-'delivery_method';
 IF NOT public.shipping_address_complete(_a) OR _reason NOT IN('legacy_incomplete','customer_confirmed_correction') OR _reason IS NULL THEN RAISE EXCEPTION 'ADDRESS_INCOMPLETE'; END IF;
 SELECT * INTO _last FROM public.order_delivery_address_corrections WHERE order_id=_order_id ORDER BY revision DESC LIMIT 1;
 IF _last.address=_a AND _last.reason_code=_reason THEN RETURN jsonb_build_object('revision',_last.revision,'idempotent',true); END IF;
 IF _expected_revision IS DISTINCT FROM coalesce(_last.revision,0) THEN RAISE EXCEPTION 'ADDRESS_REVISION_CONFLICT'; END IF;
 PERFORM id FROM public.shipments WHERE order_id=_order_id ORDER BY id FOR UPDATE;
 PERFORM set_config('bemmais.address_correction','allowed',true);
 INSERT INTO public.order_delivery_address_corrections(order_id,revision,address,reason_code,created_by)
 VALUES(_order_id,coalesce(_last.revision,0)+1,_a,_reason,auth.uid());
 PERFORM set_config('bemmais.address_correction','',true);
 -- Invalidate ready configuration without changing the original recipient snapshot or package revisions.
 PERFORM set_config('bemmais.shipping_write','allowed',true);
 UPDATE public.shipments SET status='draft',configuration_fingerprint=NULL,updated_at=now(),updated_by=auth.uid() WHERE order_id=_order_id;
 PERFORM set_config('bemmais.shipping_write','',true);
 RETURN jsonb_build_object('revision',coalesce(_last.revision,0)+1,'idempotent',false);
END $$;
CREATE FUNCTION public.admin_order_address(_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 RETURN (SELECT jsonb_build_object('method',o.delivery_method,'original',o.shipping_address,
 'effective',public.order_effective_delivery_address(o.id),
 'revision',coalesce((SELECT max(revision) FROM public.order_delivery_address_corrections WHERE order_id=o.id),0),
 'correctable',o.status<>'cancelled' AND o.delivery_method='delivery' AND NOT public.shipping_address_complete(o.shipping_address),
 'history',(SELECT coalesce(jsonb_agg(jsonb_build_object('revision',revision,'reason',reason_code,'at',created_at,'actor',created_by) ORDER BY revision),'[]') FROM public.order_delivery_address_corrections WHERE order_id=o.id))
 FROM public.orders o WHERE o.id=_order_id);
END $$;
REVOKE ALL ON FUNCTION public.correct_legacy_order_address(uuid,integer,jsonb,text),public.admin_order_address(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.correct_legacy_order_address(uuid,integer,jsonb,text),public.admin_order_address(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.create_storefront_order(
  _store_slug text, _items jsonb, _shipping_address jsonb, _idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _buyer uuid := auth.uid();
  _store public.stores%ROWTYPE;
  _raw jsonb;
  _listing public.store_listings%ROWTYPE;
  _product public.products%ROWTYPE;
  _variant public.product_variants%ROWTYPE;
  _offer public.supplier_offers%ROWTYPE;
  _offer_variant public.supplier_offer_variants%ROWTYPE;
  _qty integer;
  _requested_modality public.commercial_modality;
  _subtotal numeric(12,2) := 0;
  _order_id uuid;
  _order_item_id uuid;
  _existing uuid;
  _image text;
  _buyer_name text;
  _buyer_email text;
  _available integer;
  _resolved jsonb := '[]'::jsonb;
  _line jsonb;
  _row jsonb;
  _lock record;
  _position record;
  _stock_controlled boolean;
  _fingerprint text;
BEGIN
  IF _buyer IS NULL THEN RAISE EXCEPTION 'CHECKOUT_AUTH_REQUIRED'; END IF;
  IF nullif(btrim(_idempotency_key),'') IS NULL
     OR jsonb_typeof(_items) <> 'array'
     OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'EMPTY_CART';
  END IF;
  _shipping_address := public.normalize_delivery_address(_shipping_address);
  _fingerprint := encode(sha256(convert_to(jsonb_build_object('store',lower(btrim(_store_slug)), 'items',_items,'address',_shipping_address)::text,'UTF8')),'hex');

  -- Serializes repeated requests from the same buyer before any commercial work.
  PERFORM pg_advisory_xact_lock(hashtextextended(_buyer::text || ':' || _idempotency_key, 0));
  SELECT id INTO _existing
  FROM public.orders
  WHERE buyer_user_id = _buyer AND checkout_idempotency_key = _idempotency_key;
  IF _existing IS NOT NULL THEN
    IF NOT EXISTS(SELECT 1 FROM public.orders WHERE id=_existing AND checkout_intent_fingerprint=_fingerprint) THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
    RETURN jsonb_build_object('order_id', _existing, 'idempotent', true);
  END IF;

  SELECT * INTO _store
  FROM public.stores
  WHERE slug = lower(btrim(_store_slug)) AND status = 'published';
  IF _store.id IS NULL THEN RAISE EXCEPTION 'STORE_UNAVAILABLE'; END IF;
  IF _shipping_address->>'delivery_method'='pickup' AND NOT _store.allow_pickup THEN RAISE EXCEPTION 'PICKUP_UNAVAILABLE'; END IF;

  FOR _raw IN SELECT value FROM jsonb_array_elements(_items) LOOP
    BEGIN
      _qty := (_raw->>'quantity')::integer;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'INVALID_ITEM';
    END;
    IF _qty < 1 OR _qty > 999
       OR coalesce(_raw->>'listingId','') !~* '^[0-9a-f-]{36}$'
       OR coalesce(_raw->>'variantId','') !~* '^[0-9a-f-]{36}$' THEN
      RAISE EXCEPTION 'INVALID_ITEM';
    END IF;
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(_resolved) item
      WHERE item->>'listing_id' = _raw->>'listingId'
        AND item->>'variant_id' = _raw->>'variantId'
    ) THEN
      RAISE EXCEPTION 'INCOMPATIBLE_ITEM';
    END IF;

    SELECT * INTO _listing
    FROM public.store_listings
    WHERE id = (_raw->>'listingId')::uuid
      AND store_id = _store.id
      AND is_published
      AND visibility = 'visible'
      AND retail_price IS NOT NULL;
    IF _listing.id IS NULL THEN RAISE EXCEPTION 'LISTING_UNAVAILABLE'; END IF;

    SELECT * INTO _product
    FROM public.products
    WHERE id = _listing.product_id AND status IN ('approved','active');
    IF _product.id IS NULL THEN RAISE EXCEPTION 'LISTING_UNAVAILABLE'; END IF;

    SELECT * INTO _variant
    FROM public.product_variants
    WHERE id = (_raw->>'variantId')::uuid AND product_id = _product.id;
    IF _variant.id IS NULL THEN RAISE EXCEPTION 'INVALID_VARIANT'; END IF;
    IF NOT _variant.is_active THEN RAISE EXCEPTION 'VARIANT_INACTIVE'; END IF;
    IF nullif(_raw->>'modality','') IS NOT NULL
       AND _raw->>'modality' IS DISTINCT FROM _listing.modality::text THEN
      RAISE EXCEPTION 'INVALID_MODALITY';
    END IF;
    _requested_modality := _listing.modality;
    _offer := NULL;
    _offer_variant := NULL;
    IF _listing.offer_id IS NOT NULL THEN
      SELECT * INTO _offer
      FROM public.supplier_offers
      WHERE id = _listing.offer_id
        AND product_id = _product.id
        AND status IN ('approved','active');
      IF _offer.id IS NULL THEN RAISE EXCEPTION 'OFFER_UNAVAILABLE'; END IF;
      IF NOT (_requested_modality = ANY(_offer.modalities)) THEN
        RAISE EXCEPTION 'INVALID_MODALITY';
      END IF;
      IF _qty < _offer.moq THEN RAISE EXCEPTION 'MOQ_NOT_MET'; END IF;
      SELECT * INTO _offer_variant
      FROM public.supplier_offer_variants
      WHERE offer_id = _offer.id AND variant_id = _variant.id AND is_active;
      IF _offer_variant.id IS NULL THEN RAISE EXCEPTION 'OFFER_UNAVAILABLE'; END IF;
    END IF;

    SELECT storage_path INTO _image
    FROM public.product_media
    WHERE product_id = _product.id
    ORDER BY is_primary DESC, sort_order
    LIMIT 1;
    _line := jsonb_build_object(
      'listing_id', _listing.id,
      'variant_id', _variant.id,
      'offer_id', _offer.id,
      'offer_variant_id', _offer_variant.id,
      'supplier_id', _offer.organization_id,
      'seller_id', _listing.organization_id,
      'stock_owner_id', coalesce(_offer.organization_id, _listing.organization_id),
      'fulfillment_owner_id', NULL,
      'product_id', _product.id,
      'name', _product.name,
      'sku', _variant.sku,
      'attributes', _variant.attributes,
      'image', _image,
      'modality', _requested_modality,
      'unit_price', _listing.retail_price::text,
      'quantity', _qty,
      'subtotal', round(_listing.retail_price * _qty, 2)::text
    );
    _resolved := _resolved || jsonb_build_array(_line);
    _subtotal := _subtotal + round(_listing.retail_price * _qty, 2);
  END LOOP;

  -- Deterministic owner+variant order avoids multi-item checkout deadlocks.
  FOR _lock IN
    SELECT locked_positions.organization_id, locked_positions.variant_id
    FROM (
      SELECT (item->>'stock_owner_id')::uuid AS organization_id,
             (item->>'variant_id')::uuid AS variant_id
      FROM jsonb_array_elements(_resolved) item
      GROUP BY 1, 2
    ) locked_positions
    ORDER BY locked_positions.organization_id::text, locked_positions.variant_id::text
  LOOP
    PERFORM pg_advisory_xact_lock(
      hashtextextended(_lock.organization_id::text || ':' || _lock.variant_id::text, 0)
    );
  END LOOP;

  -- A missing ledger position means stock is not controlled by the platform.
  -- A present position must satisfy the sum of all requested lines for it.
  FOR _position IN
    SELECT requested_positions.organization_id, requested_positions.variant_id,
           requested_positions.requested_quantity
    FROM (
      SELECT (item->>'stock_owner_id')::uuid AS organization_id,
             (item->>'variant_id')::uuid AS variant_id,
             sum((item->>'quantity')::integer)::integer AS requested_quantity
      FROM jsonb_array_elements(_resolved) item
      GROUP BY 1, 2
    ) requested_positions
    ORDER BY requested_positions.organization_id::text, requested_positions.variant_id::text
  LOOP
    SELECT on_hand - reserved INTO _available
    FROM public.inventory_balances
    WHERE organization_id = _position.organization_id AND variant_id = _position.variant_id;
    IF FOUND AND (_available IS NULL OR _available < _position.requested_quantity) THEN
      RAISE EXCEPTION 'INSUFFICIENT_STOCK';
    END IF;
  END LOOP;

  SELECT p.full_name, u.email::text INTO _buyer_name, _buyer_email
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE u.id = _buyer;
  INSERT INTO public.orders(
    organization_id, store_id, buyer_user_id, buyer_name, buyer_email,
    shipping_address, status, payment_status, currency, subtotal_amount,
    discount_amount, shipping_amount, total_amount, checkout_idempotency_key, delivery_method, checkout_intent_fingerprint
  ) VALUES (
    _store.organization_id, _store.id, _buyer, _buyer_name, _buyer_email,
    CASE WHEN _shipping_address->>'delivery_method'='pickup' THEN NULL ELSE _shipping_address-'delivery_method' END, 'pending_payment', 'pending', 'BRL', _subtotal,
    0, 0, _subtotal, _idempotency_key, _shipping_address->>'delivery_method', _fingerprint
  ) RETURNING id INTO _order_id;

  FOR _row IN SELECT value FROM jsonb_array_elements(_resolved) LOOP
    INSERT INTO public.order_items(
      order_id, organization_id, product_id, variant_id, store_listing_id,
      supplier_offer_id, seller_organization_id, supplier_organization_id,
      stock_owner_organization_id, fulfillment_owner_organization_id,
      commercial_modality, product_name_snapshot, sku_snapshot, image_path_snapshot,
      attributes_snapshot, unit_price, quantity, subtotal_amount,
      discount_amount, shipping_amount, total_amount
    ) VALUES (
      _order_id, _store.organization_id, (_row->>'product_id')::uuid,
      (_row->>'variant_id')::uuid, (_row->>'listing_id')::uuid,
      nullif(_row->>'offer_id','')::uuid, (_row->>'seller_id')::uuid,
      nullif(_row->>'supplier_id','')::uuid, (_row->>'stock_owner_id')::uuid,
      nullif(_row->>'fulfillment_owner_id','')::uuid,
      (_row->>'modality')::public.commercial_modality, _row->>'name', _row->>'sku',
      _row->>'image', _row->'attributes', (_row->>'unit_price')::numeric,
      (_row->>'quantity')::integer, (_row->>'subtotal')::numeric, 0, 0,
      (_row->>'subtotal')::numeric
    ) RETURNING id INTO _order_item_id;

    SELECT EXISTS (
      SELECT 1
      FROM public.inventory_balances
      WHERE organization_id = (_row->>'stock_owner_id')::uuid
        AND variant_id = (_row->>'variant_id')::uuid
    ) INTO _stock_controlled;
    IF _stock_controlled THEN
      INSERT INTO public.inventory_movements(
        organization_id, variant_id, offer_variant_id, movement_type, quantity,
        reason, reference_type, reference_id, created_by
      ) VALUES (
        (_row->>'stock_owner_id')::uuid, (_row->>'variant_id')::uuid,
        nullif(_row->>'offer_variant_id','')::uuid, 'reserve',
        (_row->>'quantity')::integer, 'checkout_reservation', 'order_item',
        _order_item_id::text, _buyer
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object('order_id', _order_id, 'idempotent', false);
EXCEPTION WHEN unique_violation THEN
  SELECT id INTO _existing
  FROM public.orders
  WHERE buyer_user_id = _buyer AND checkout_idempotency_key = _idempotency_key;
  IF _existing IS NOT NULL THEN
    IF NOT EXISTS(SELECT 1 FROM public.orders WHERE id=_existing AND checkout_intent_fingerprint=_fingerprint) THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
    RETURN jsonb_build_object('order_id', _existing, 'idempotent', true);
  END IF;
  RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.configure_shipment(_shipment_id uuid,_expected_version integer,_method text,_origin jsonb,_origin_confirmed boolean,_packages jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE _s public.shipments%ROWTYPE; _oid uuid; _block text; _origin_safe jsonb; _pack jsonb; _item jsonb;
 _package_id uuid; _position integer:=0; _version integer; _fingerprint text; _status text;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 SELECT order_id INTO _oid FROM public.shipments WHERE id=_shipment_id;
 PERFORM id FROM public.orders WHERE id=_oid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'SHIPMENT_NOT_FOUND'; END IF;
 PERFORM id FROM public.payments WHERE order_id=_oid ORDER BY id FOR UPDATE;
 SELECT * INTO _s FROM public.shipments WHERE id=_shipment_id FOR UPDATE;
 _block:=public.order_fulfillment_block(_oid);
 IF _block IS NOT NULL THEN RAISE EXCEPTION '%',_block; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.order_fulfillments WHERE id=_s.fulfillment_id AND status='ready_to_ship' AND stock_consumed_at IS NOT NULL)
 THEN RAISE EXCEPTION 'FULFILLMENT_NOT_READY'; END IF;
 IF _method IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.shipping_methods WHERE code=_method AND active)
 THEN RAISE EXCEPTION 'SHIPPING_METHOD_INVALID'; END IF;
 IF _method IS NOT NULL AND ((_method='pickup') IS DISTINCT FROM (SELECT delivery_method='pickup' FROM public.orders WHERE id=_oid))
 THEN RAISE EXCEPTION 'SHIPPING_METHOD_INVALID'; END IF;
 IF _origin IS NOT NULL THEN
  _origin:=public.normalize_delivery_address(_origin)-'delivery_method';
  IF NOT coalesce(_origin_confirmed,false) OR NOT public.shipping_address_complete(_origin)
  THEN RAISE EXCEPTION 'SHIPPING_ORIGIN_INVALID'; END IF;
  SELECT jsonb_object_agg(key,value) INTO _origin_safe FROM jsonb_each(_origin)
   WHERE key IN ('recipient','postal_code','street','number','complement','district','city','state','country','reference','no_number')
    AND jsonb_typeof(value)='string' AND length(value#>>'{}')<=200;
  IF NOT public.shipping_address_complete(_origin_safe) THEN RAISE EXCEPTION 'SHIPPING_ORIGIN_INVALID'; END IF;
 ELSE _origin_safe:=NULL; END IF;
 IF _packages IS NULL OR jsonb_typeof(_packages)<>'array'
 THEN RAISE EXCEPTION 'PACKAGES_INVALID'; END IF;
 IF jsonb_array_length(_packages)>100 THEN RAISE EXCEPTION 'PACKAGES_INVALID'; END IF;
 -- Fingerprint for configuration retries. It contains no provider tokens or credentials.
 _fingerprint:=encode(sha256(convert_to(jsonb_build_object('method',_method,'origin',_origin_safe,'packages',_packages)::text,'UTF8')),'hex');
 IF _s.configuration_fingerprint=_fingerprint THEN RETURN jsonb_build_object('shipment_id',_s.id,'version',_s.version,'idempotent',true); END IF;
 IF _expected_version IS DISTINCT FROM _s.version THEN RAISE EXCEPTION 'SHIPMENT_VERSION_CONFLICT'; END IF;
 IF _s.status NOT IN ('draft','ready_for_quote') THEN RAISE EXCEPTION 'SHIPMENT_INVALID_TRANSITION'; END IF;
 _version:=_s.version+1;
 PERFORM set_config('bemmais.shipping_write','allowed',true);
 FOR _pack IN SELECT value FROM jsonb_array_elements(_packages) LOOP
  _position:=_position+1;
  IF jsonb_typeof(_pack)<>'object' OR _pack->>'weight_unit' IS DISTINCT FROM 'kg' OR _pack->>'dimension_unit' IS DISTINCT FROM 'cm'
   OR _pack->>'measured' IS DISTINCT FROM 'true'
   OR coalesce(_pack->>'weight','') !~ '^[0-9]{1,4}(\.[0-9]{1,3})?$'
   OR coalesce(_pack->>'length','') !~ '^[0-9]{1,4}(\.[0-9]{1,2})?$'
   OR coalesce(_pack->>'width','') !~ '^[0-9]{1,4}(\.[0-9]{1,2})?$'
   OR coalesce(_pack->>'height','') !~ '^[0-9]{1,4}(\.[0-9]{1,2})?$'
   OR coalesce(_pack->>'quantity','') !~ '^[0-9]{1,3}$'
   OR (_pack->>'weight')::numeric NOT BETWEEN 0.001 AND 1000
   OR (_pack->>'length')::numeric NOT BETWEEN 0.01 AND 1000
   OR (_pack->>'width')::numeric NOT BETWEEN 0.01 AND 1000
   OR (_pack->>'height')::numeric NOT BETWEEN 0.01 AND 1000
   OR (_pack->>'quantity')::integer NOT BETWEEN 1 AND 100
   OR jsonb_typeof(_pack->'items') IS DISTINCT FROM 'array'
  THEN RAISE EXCEPTION 'PACKAGES_INVALID'; END IF;
  IF jsonb_array_length(_pack->'items')=0 THEN RAISE EXCEPTION 'PACKAGES_INVALID'; END IF;
  INSERT INTO public.shipment_packages(shipment_id,revision,position,quantity,weight,length,width,height,measured_by)
  VALUES(_s.id,_version,_position,(_pack->>'quantity')::integer,(_pack->>'weight')::numeric,
   (_pack->>'length')::numeric,(_pack->>'width')::numeric,(_pack->>'height')::numeric,auth.uid()) RETURNING id INTO _package_id;
  FOR _item IN SELECT value FROM jsonb_array_elements(_pack->'items') LOOP
   IF coalesce(_item->>'order_item_id','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(_item->>'quantity','') !~ '^[0-9]{1,6}$' OR (_item->>'quantity')::integer<=0
    OR NOT EXISTS(SELECT 1 FROM public.order_items WHERE id=(_item->>'order_item_id')::uuid AND fulfillment_id=_s.fulfillment_id)
    OR EXISTS(SELECT 1 FROM public.shipment_package_items WHERE package_id=_package_id AND order_item_id=(_item->>'order_item_id')::uuid)
   THEN RAISE EXCEPTION 'PACKAGE_ITEM_INVALID'; END IF;
   INSERT INTO public.shipment_package_items(package_id,order_item_id,quantity) VALUES(_package_id,(_item->>'order_item_id')::uuid,(_item->>'quantity')::integer);
  END LOOP;
 END LOOP;
 IF _position>0 AND EXISTS(SELECT 1 FROM public.order_items oi WHERE oi.fulfillment_id=_s.fulfillment_id
  AND oi.quantity IS DISTINCT FROM (SELECT sum(pi.quantity::bigint*p.quantity) FROM public.shipment_packages p
   JOIN public.shipment_package_items pi ON pi.package_id=p.id WHERE p.shipment_id=_s.id AND p.revision=_version AND pi.order_item_id=oi.id))
 THEN RAISE EXCEPTION 'PACKAGE_ALLOCATION_INVALID'; END IF;
 _status:=CASE WHEN _method IS NOT NULL AND _origin_safe IS NOT NULL AND _position>0
  AND ((SELECT delivery_method='pickup' FROM public.orders WHERE id=_oid) OR public.shipping_address_complete(public.order_effective_delivery_address(_oid))) THEN 'ready_for_quote' ELSE 'draft' END;
 UPDATE public.shipments SET origin_snapshot=_origin_safe,origin_confirmed_by=CASE WHEN _origin_safe IS NOT NULL THEN auth.uid() END,
  origin_confirmed_at=CASE WHEN _origin_safe IS NOT NULL THEN now() END,method_code=_method,status=_status,version=_version,
  configuration_fingerprint=_fingerprint,updated_by=auth.uid(),updated_at=now() WHERE id=_s.id;
 PERFORM set_config('bemmais.shipping_write','',true);
 RETURN jsonb_build_object('shipment_id',_s.id,'version',_version,'idempotent',false);
END $$;

CREATE OR REPLACE FUNCTION public.admin_order_logistics(_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE _block text;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 _block:=public.order_fulfillment_block(_order_id);
 RETURN jsonb_build_object('block',_block,'provider_configured',false,
 'methods',(SELECT coalesce(jsonb_agg(jsonb_build_object('code',code,'label',label) ORDER BY label),'[]') FROM public.shipping_methods WHERE active),
 'eligible',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',f.id,'owner',o.name) ORDER BY f.group_key),'[]')
  FROM public.order_fulfillments f JOIN public.organizations o ON o.id=f.fulfillment_owner_organization_id
  WHERE f.order_id=_order_id AND f.status='ready_to_ship' AND f.stock_consumed_at IS NOT NULL AND _block IS NULL
   AND NOT EXISTS(SELECT 1 FROM public.shipments s WHERE s.fulfillment_id=f.id)),
 'shipments',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'fulfillment_id',s.fulfillment_id,'owner',o.name,
  'supplier',supplier.name,'seller',seller.name,'stock_owner',stock.name,'recipient',public.order_effective_delivery_address(s.order_id),'recipient_original',s.recipient_snapshot,'origin',s.origin_snapshot,
  'method',s.method_code,'status',s.status,'version',s.version,'updated_at',s.updated_at,
  'items',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',oi.id,'name',oi.product_name_snapshot,'sku',oi.sku_snapshot,'quantity',oi.quantity) ORDER BY oi.id),'[]') FROM public.order_items oi WHERE oi.fulfillment_id=s.fulfillment_id),
  'packages',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'quantity',p.quantity,'weight',p.weight::text,'length',p.length::text,'width',p.width::text,'height',p.height::text,
   'weight_unit',p.weight_unit,'dimension_unit',p.dimension_unit,'measured_at',p.measured_at,
   'items',(SELECT coalesce(jsonb_agg(jsonb_build_object('order_item_id',pi.order_item_id,'quantity',pi.quantity) ORDER BY pi.order_item_id),'[]') FROM public.shipment_package_items pi WHERE pi.package_id=p.id)) ORDER BY p.position),'[]')
    FROM public.shipment_packages p WHERE p.shipment_id=s.id AND p.revision=s.version),
  'pending',to_jsonb(array_remove(ARRAY[
   CASE WHEN s.origin_snapshot IS NULL THEN 'ORIGIN_MISSING' END,
   CASE WHEN (SELECT delivery_method<>'pickup' FROM public.orders WHERE id=s.order_id) AND NOT public.shipping_address_complete(public.order_effective_delivery_address(s.order_id)) THEN 'RECIPIENT_INCOMPLETE' END,
   CASE WHEN s.method_code IS NULL THEN 'METHOD_MISSING' END,
   CASE WHEN s.method_code IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.shipping_methods WHERE code=s.method_code AND active) THEN 'SHIPPING_METHOD_INVALID' END,
   CASE WHEN NOT EXISTS(SELECT 1 FROM public.shipment_packages WHERE shipment_id=s.id AND revision=s.version) THEN 'PACKAGES_MISSING' END,
   'PROVIDER_NOT_CONFIGURED'],NULL))) ORDER BY s.created_at),'[]')
 FROM public.shipments s JOIN public.organizations o ON o.id=s.fulfillment_owner_organization_id
 LEFT JOIN public.organizations supplier ON supplier.id=s.supplier_organization_id
 LEFT JOIN public.organizations seller ON seller.id=s.seller_organization_id
 LEFT JOIN public.organizations stock ON stock.id=s.stock_owner_organization_id WHERE s.order_id=_order_id),
 'activity',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id::text,'action',a.action,'actor',a.actor_id,'at',a.occurred_at) ORDER BY a.occurred_at DESC),'[]')
  FROM public.audit_logs a WHERE (a.entity_type='shipments' AND a.entity_id IN(SELECT id::text FROM public.shipments WHERE order_id=_order_id))
   OR (a.entity_type='shipment_packages' AND a.entity_id IN(SELECT p.id::text FROM public.shipment_packages p JOIN public.shipments s ON s.id=p.shipment_id WHERE s.order_id=_order_id))
   OR (a.entity_type='shipment_package_items' AND a.entity_id IN(SELECT pi.id::text FROM public.shipment_package_items pi
    JOIN public.shipment_packages p ON p.id=pi.package_id JOIN public.shipments s ON s.id=p.shipment_id WHERE s.order_id=_order_id))));
END $$;
 -- Preserve the single audit writer while minimizing address PII in future entries.
CREATE OR REPLACE FUNCTION public.audit_row_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE _org uuid; _row jsonb; _before jsonb; _after jsonb; _private text[] := ARRAY[]::text[];
BEGIN
 _row:=to_jsonb(COALESCE(NEW,OLD));
 _org:=CASE WHEN TG_TABLE_NAME='organizations' THEN (_row->>'id')::uuid ELSE (_row->>'organization_id')::uuid END;
 IF TG_OP<>'INSERT' THEN _before:=to_jsonb(OLD); END IF;
 IF TG_OP<>'DELETE' THEN _after:=to_jsonb(NEW); END IF;
 IF TG_TABLE_NAME='orders' THEN _private:=ARRAY['shipping_address','buyer_name','buyer_email'];
 ELSIF TG_TABLE_NAME='shipments' THEN _private:=ARRAY['recipient_snapshot','origin_snapshot'];
 ELSIF TG_TABLE_NAME='order_delivery_address_corrections' THEN _private:=ARRAY['address']; END IF;
 INSERT INTO public.audit_logs(actor_id,organization_id,action,entity_type,entity_id,before_data,after_data)
 VALUES(auth.uid(),_org,lower(TG_OP),TG_TABLE_NAME,coalesce(_row->>'id',_row->>'capability'),_before-_private,_after-_private);
 RETURN COALESCE(NEW,OLD);
END $$;
REVOKE ALL ON FUNCTION public.guard_order_address_snapshot(),public.guard_address_correction() FROM PUBLIC,anon,authenticated;
