-- Stock stays ledger-backed. A reservation is an append-only inventory movement,
-- never a mutable stock column. The checkout function acquires transaction-scoped
-- advisory locks ordered by stock owner and variant before it re-reads balances.
-- The inventory guard uses the same lock key, so every stock mutation serializes
-- on the exact stock position instead of a platform-wide lock.

CREATE UNIQUE INDEX IF NOT EXISTS inventory_reserve_once_per_order_item_idx
  ON public.inventory_movements(reference_type, reference_id)
  WHERE movement_type = 'reserve' AND reference_type = 'order_item';

CREATE UNIQUE INDEX IF NOT EXISTS inventory_release_once_per_reservation_idx
  ON public.inventory_movements(reference_type, reference_id)
  WHERE movement_type = 'release' AND reference_type = 'inventory_reservation_release';

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
BEGIN
  IF _buyer IS NULL THEN RAISE EXCEPTION 'CHECKOUT_AUTH_REQUIRED'; END IF;
  IF nullif(btrim(_idempotency_key),'') IS NULL
     OR jsonb_typeof(_items) <> 'array'
     OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'EMPTY_CART';
  END IF;
  IF _shipping_address IS NULL OR jsonb_typeof(_shipping_address) <> 'object'
     OR nullif(btrim(_shipping_address->>'recipient'),'') IS NULL
     OR nullif(btrim(_shipping_address->>'city'),'') IS NULL THEN
    RAISE EXCEPTION 'ADDRESS_INCOMPLETE';
  END IF;

  -- Serializes repeated requests from the same buyer before any commercial work.
  PERFORM pg_advisory_xact_lock(hashtextextended(_buyer::text || ':' || _idempotency_key, 0));
  SELECT id INTO _existing
  FROM public.orders
  WHERE buyer_user_id = _buyer AND checkout_idempotency_key = _idempotency_key;
  IF _existing IS NOT NULL THEN
    RETURN jsonb_build_object('order_id', _existing, 'idempotent', true);
  END IF;

  SELECT * INTO _store
  FROM public.stores
  WHERE slug = lower(btrim(_store_slug)) AND status = 'published';
  IF _store.id IS NULL THEN RAISE EXCEPTION 'STORE_UNAVAILABLE'; END IF;

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
    discount_amount, shipping_amount, total_amount, checkout_idempotency_key
  ) VALUES (
    _store.organization_id, _store.id, _buyer, _buyer_name, _buyer_email,
    _shipping_address, 'pending_payment', 'pending', 'BRL', _subtotal,
    0, 0, _subtotal, _idempotency_key
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
    RETURN jsonb_build_object('order_id', _existing, 'idempotent', true);
  END IF;
  RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_order_item_reservation(_order_item_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _reservation public.inventory_movements%ROWTYPE;
  _order_status public.order_status;
  _release_id bigint;
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  SELECT m.* INTO _reservation
  FROM public.inventory_movements m
  WHERE m.movement_type = 'reserve'
    AND m.reference_type = 'order_item'
    AND m.reference_id = _order_item_id::text;
  IF _reservation.id IS NULL THEN
    RAISE EXCEPTION 'STOCK_RESERVATION_NOT_FOUND';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(_reservation.organization_id::text || ':' || _reservation.variant_id::text, 0)
  );
  SELECT o.status INTO _order_status
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE oi.id = _order_item_id;
  IF _order_status IS DISTINCT FROM 'cancelled'::public.order_status THEN
    RAISE EXCEPTION 'RESERVATION_RELEASE_NOT_ALLOWED';
  END IF;

  SELECT id INTO _release_id
  FROM public.inventory_movements
  WHERE movement_type = 'release'
    AND reference_type = 'inventory_reservation_release'
    AND reference_id = _reservation.id::text;
  IF _release_id IS NOT NULL THEN
    RETURN jsonb_build_object('reservation_id', _reservation.id, 'released', false, 'idempotent', true);
  END IF;

  INSERT INTO public.inventory_movements(
    organization_id, variant_id, offer_variant_id, movement_type, quantity,
    reason, reference_type, reference_id, created_by
  ) VALUES (
    _reservation.organization_id, _reservation.variant_id, _reservation.offer_variant_id,
    'release', _reservation.quantity, 'cancelled_order_release',
    'inventory_reservation_release', _reservation.id::text, auth.uid()
  ) RETURNING id INTO _release_id;
  RETURN jsonb_build_object('reservation_id', _reservation.id, 'release_id', _release_id, 'released', true, 'idempotent', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_order_360(_order_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE WHEN NOT public.is_platform_admin(auth.uid()) THEN NULL ELSE jsonb_build_object(
    'order', (SELECT jsonb_build_object('id',o.id,'order_number',o.order_number,'status',o.status,'payment_status',o.payment_status,'fulfillment_status',CASE WHEN count(oi.id)=0 OR bool_and(oi.fulfillment_status='unassigned') THEN 'unassigned' WHEN bool_and(oi.fulfillment_status='fulfilled') THEN 'fulfilled' WHEN bool_and(oi.fulfillment_status='cancelled') THEN 'cancelled' ELSE 'pending' END,'currency',o.currency,'subtotal_amount',o.subtotal_amount::text,'discount_amount',o.discount_amount::text,'shipping_amount',o.shipping_amount::text,'total_amount',o.total_amount::text,'buyer_name',o.buyer_name,'buyer_email',o.buyer_email,'organization_name',org.name,'store_name',s.name,'shipping_address',o.shipping_address,'created_at',o.created_at,'updated_at',o.updated_at) FROM public.orders o LEFT JOIN public.stores s ON s.id=o.store_id LEFT JOIN public.organizations org ON org.id=o.organization_id LEFT JOIN public.order_items oi ON oi.order_id=o.id WHERE o.id=_order_id GROUP BY o.id,org.name,s.name),
    'items', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',oi.id,'product_id',oi.product_id,'variant_id',oi.variant_id,'product_name_snapshot',oi.product_name_snapshot,'sku_snapshot',oi.sku_snapshot,'image_path_snapshot',oi.image_path_snapshot,'attributes_snapshot',oi.attributes_snapshot,'quantity',oi.quantity,'unit_price',oi.unit_price::text,'subtotal_amount',oi.subtotal_amount::text,'discount_amount',oi.discount_amount::text,'shipping_amount',oi.shipping_amount::text,'total_amount',oi.total_amount::text,'commercial_modality',oi.commercial_modality,'fulfillment_status',oi.fulfillment_status,'supplier_name',supplier.name,'seller_name',seller.name,'stock_owner_name',stock.name,'fulfillment_owner_name',fulfillment.name,'stock_reservation_status',CASE WHEN reservation.id IS NULL THEN 'not_controlled' WHEN release.id IS NULL THEN 'reserved' ELSE 'released' END) ORDER BY oi.created_at),'[]'::jsonb) FROM public.order_items oi LEFT JOIN public.organizations supplier ON supplier.id=oi.supplier_organization_id LEFT JOIN public.organizations seller ON seller.id=oi.seller_organization_id LEFT JOIN public.organizations stock ON stock.id=oi.stock_owner_organization_id LEFT JOIN public.organizations fulfillment ON fulfillment.id=oi.fulfillment_owner_organization_id LEFT JOIN LATERAL (SELECT m.id FROM public.inventory_movements m WHERE m.movement_type='reserve' AND m.reference_type='order_item' AND m.reference_id=oi.id::text LIMIT 1) reservation ON true LEFT JOIN LATERAL (SELECT m.id FROM public.inventory_movements m WHERE m.movement_type='release' AND m.reference_type='inventory_reservation_release' AND m.reference_id=reservation.id::text LIMIT 1) release ON true WHERE oi.order_id=_order_id),
    'payments',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'status',p.status,'provider',p.provider,'method',p.method,'amount',p.amount::text,'provider_payment_id',p.provider_payment_id,'paid_at',p.paid_at,'created_at',p.created_at) ORDER BY p.created_at DESC),'[]'::jsonb) FROM public.payments p WHERE p.reference_id=_order_id::text),
    'activity',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id::text,'action',a.action,'entity_type',a.entity_type,'actor_name',pr.full_name,'occurred_at',a.occurred_at) ORDER BY a.occurred_at DESC),'[]'::jsonb) FROM public.audit_logs a LEFT JOIN public.profiles pr ON pr.id=a.actor_id WHERE (a.entity_type='orders' AND a.entity_id=_order_id::text) OR (a.entity_type='order_items' AND a.entity_id IN (SELECT id::text FROM public.order_items WHERE order_id=_order_id)) OR (a.entity_type='inventory_movements' AND a.after_data->>'reference_id' IN (SELECT id::text FROM public.order_items WHERE order_id=_order_id)))
  ) END;
$$;

REVOKE ALL ON FUNCTION public.create_storefront_order(text,jsonb,jsonb,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_order_item_reservation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_storefront_order(text,jsonb,jsonb,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_order_item_reservation(uuid) TO authenticated;
