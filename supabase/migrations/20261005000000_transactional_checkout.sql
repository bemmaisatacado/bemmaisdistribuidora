-- Authenticated checkout: the browser sends only listing/variant/quantity intent.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS checkout_idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS orders_buyer_idempotency_key_idx ON public.orders(buyer_user_id, checkout_idempotency_key) WHERE buyer_user_id IS NOT NULL AND checkout_idempotency_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.create_storefront_order(
  _store_slug text, _items jsonb, _shipping_address jsonb, _idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  _buyer uuid := auth.uid(); _store public.stores%ROWTYPE; _raw jsonb; _listing public.store_listings%ROWTYPE;
  _product public.products%ROWTYPE; _variant public.product_variants%ROWTYPE; _offer public.supplier_offers%ROWTYPE;
  _offer_variant public.supplier_offer_variants%ROWTYPE; _qty integer; _requested_modality public.commercial_modality;
  _subtotal numeric(12,2) := 0; _order_id uuid; _existing uuid; _image text; _buyer_name text; _buyer_email text;
  _available integer; _resolved jsonb := '[]'::jsonb; _line jsonb; _row jsonb;
BEGIN
  IF _buyer IS NULL THEN RAISE EXCEPTION 'CHECKOUT_AUTH_REQUIRED'; END IF;
  IF nullif(btrim(_idempotency_key),'') IS NULL OR jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items)=0 THEN RAISE EXCEPTION 'EMPTY_CART'; END IF;
  IF _shipping_address IS NULL OR jsonb_typeof(_shipping_address) <> 'object' OR nullif(btrim(_shipping_address->>'recipient'),'') IS NULL OR nullif(btrim(_shipping_address->>'city'),'') IS NULL THEN RAISE EXCEPTION 'ADDRESS_INCOMPLETE'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(_buyer::text || ':' || _idempotency_key, 0));
  SELECT id INTO _existing FROM public.orders WHERE buyer_user_id=_buyer AND checkout_idempotency_key=_idempotency_key;
  IF _existing IS NOT NULL THEN RETURN jsonb_build_object('order_id',_existing,'idempotent',true); END IF;
  SELECT * INTO _store FROM public.stores WHERE slug=lower(btrim(_store_slug)) AND status='published';
  IF _store.id IS NULL THEN RAISE EXCEPTION 'STORE_UNAVAILABLE'; END IF;
  FOR _raw IN SELECT value FROM jsonb_array_elements(_items) LOOP
    BEGIN _qty := (_raw->>'quantity')::integer; EXCEPTION WHEN others THEN RAISE EXCEPTION 'INVALID_ITEM'; END;
    IF _qty < 1 OR _qty > 999 OR coalesce(_raw->>'listingId','') !~* '^[0-9a-f-]{36}$' OR coalesce(_raw->>'variantId','') !~* '^[0-9a-f-]{36}$' THEN RAISE EXCEPTION 'INVALID_ITEM'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(_resolved) x WHERE x->>'listing_id'=_raw->>'listingId' AND x->>'variant_id'=_raw->>'variantId') THEN RAISE EXCEPTION 'INCOMPATIBLE_ITEM'; END IF;
    SELECT * INTO _listing FROM public.store_listings WHERE id=(_raw->>'listingId')::uuid AND store_id=_store.id AND is_published AND visibility='visible' AND retail_price IS NOT NULL;
    IF _listing.id IS NULL THEN RAISE EXCEPTION 'LISTING_UNAVAILABLE'; END IF;
    SELECT * INTO _product FROM public.products WHERE id=_listing.product_id AND status IN ('approved','active');
    IF _product.id IS NULL THEN RAISE EXCEPTION 'LISTING_UNAVAILABLE'; END IF;
    SELECT * INTO _variant FROM public.product_variants WHERE id=(_raw->>'variantId')::uuid AND product_id=_product.id;
    IF _variant.id IS NULL THEN RAISE EXCEPTION 'INVALID_VARIANT'; END IF;
    IF NOT _variant.is_active THEN RAISE EXCEPTION 'VARIANT_INACTIVE'; END IF;
    IF nullif(_raw->>'modality','') IS NOT NULL AND _raw->>'modality' IS DISTINCT FROM _listing.modality::text THEN RAISE EXCEPTION 'INVALID_MODALITY'; END IF;
    _requested_modality := _listing.modality;
    IF _listing.offer_id IS NOT NULL THEN
      SELECT * INTO _offer FROM public.supplier_offers WHERE id=_listing.offer_id AND product_id=_product.id AND status IN ('approved','active');
      IF _offer.id IS NULL THEN RAISE EXCEPTION 'OFFER_UNAVAILABLE'; END IF;
      IF NOT (_requested_modality = ANY(_offer.modalities)) THEN RAISE EXCEPTION 'INVALID_MODALITY'; END IF;
      IF _qty < _offer.moq THEN RAISE EXCEPTION 'MOQ_NOT_MET'; END IF;
      SELECT * INTO _offer_variant FROM public.supplier_offer_variants WHERE offer_id=_offer.id AND variant_id=_variant.id AND is_active;
      IF _offer_variant.id IS NULL THEN RAISE EXCEPTION 'OFFER_UNAVAILABLE'; END IF;
      SELECT b.on_hand-b.reserved INTO _available FROM public.inventory_balances b WHERE b.organization_id=_offer.organization_id AND b.variant_id=_variant.id;
      IF _available IS NOT NULL AND _available < _qty THEN RAISE EXCEPTION 'INVENTORY_UNAVAILABLE'; END IF;
    END IF;
    SELECT m.storage_path INTO _image FROM public.product_media m WHERE m.product_id=_product.id ORDER BY m.is_primary DESC,m.sort_order LIMIT 1;
    _line := jsonb_build_object('listing_id',_listing.id,'variant_id',_variant.id,'offer_id',_offer.id,'supplier_id',_offer.organization_id,'seller_id',_listing.organization_id,'stock_owner_id',coalesce(_offer.organization_id,_listing.organization_id),'fulfillment_owner_id',NULL,'product_id',_product.id,'name',_product.name,'sku',_variant.sku,'attributes',_variant.attributes,'image',_image,'modality',_requested_modality,'unit_price',_listing.retail_price::text,'quantity',_qty,'subtotal',round(_listing.retail_price*_qty,2)::text);
    _resolved := _resolved || jsonb_build_array(_line); _subtotal := _subtotal + round(_listing.retail_price*_qty,2);
  END LOOP;
  SELECT p.full_name, u.email::text INTO _buyer_name,_buyer_email FROM auth.users u LEFT JOIN public.profiles p ON p.id=u.id WHERE u.id=_buyer;
  INSERT INTO public.orders(organization_id,store_id,buyer_user_id,buyer_name,buyer_email,shipping_address,status,payment_status,currency,subtotal_amount,discount_amount,shipping_amount,total_amount,checkout_idempotency_key)
  VALUES(_store.organization_id,_store.id,_buyer,_buyer_name,_buyer_email,_shipping_address,'pending_payment','pending','BRL',_subtotal,0,0,_subtotal,_idempotency_key) RETURNING id INTO _order_id;
  FOR _row IN SELECT value FROM jsonb_array_elements(_resolved) LOOP
    INSERT INTO public.order_items(order_id,organization_id,product_id,variant_id,store_listing_id,supplier_offer_id,seller_organization_id,supplier_organization_id,stock_owner_organization_id,fulfillment_owner_organization_id,commercial_modality,product_name_snapshot,sku_snapshot,image_path_snapshot,attributes_snapshot,unit_price,quantity,subtotal_amount,discount_amount,shipping_amount,total_amount)
    VALUES(_order_id,_store.organization_id,(_row->>'product_id')::uuid,(_row->>'variant_id')::uuid,(_row->>'listing_id')::uuid,nullif(_row->>'offer_id','')::uuid,(_row->>'seller_id')::uuid,nullif(_row->>'supplier_id','')::uuid,(_row->>'stock_owner_id')::uuid,nullif(_row->>'fulfillment_owner_id','')::uuid,(_row->>'modality')::public.commercial_modality,_row->>'name',_row->>'sku',_row->>'image',_row->'attributes',(_row->>'unit_price')::numeric,(_row->>'quantity')::integer,(_row->>'subtotal')::numeric,0,0,(_row->>'subtotal')::numeric);
  END LOOP;
  RETURN jsonb_build_object('order_id',_order_id,'idempotent',false);
EXCEPTION WHEN unique_violation THEN
  SELECT id INTO _existing FROM public.orders WHERE buyer_user_id=_buyer AND checkout_idempotency_key=_idempotency_key;
  IF _existing IS NOT NULL THEN RETURN jsonb_build_object('order_id',_existing,'idempotent',true); END IF;
  RAISE;
END $$;
REVOKE ALL ON FUNCTION public.create_storefront_order(text,jsonb,jsonb,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_storefront_order(text,jsonb,jsonb,text) TO authenticated;
