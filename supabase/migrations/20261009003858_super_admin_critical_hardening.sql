-- Block 11. Incremental only; apply and verify in an isolated environment first.
-- Private implementation cannot be reached through the public Data API.
CREATE SCHEMA IF NOT EXISTS bemmais_private;
REVOKE ALL ON SCHEMA bemmais_private FROM PUBLIC, anon, authenticated, service_role;
ALTER FUNCTION public.store_draft_snapshot_base(uuid) SET SCHEMA bemmais_private;
REVOKE ALL ON FUNCTION bemmais_private.store_draft_snapshot_base(uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.store_draft_snapshot(_store_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE _org uuid; _snapshot jsonb;
BEGIN
 SELECT organization_id INTO _org FROM public.stores WHERE id=_store_id;
 IF auth.uid() IS NULL OR _org IS NULL OR NOT (
  public.is_platform_admin(auth.uid()) OR (
   public.has_org_permission(auth.uid(),_org,'stores.manage') AND EXISTS(
    SELECT 1 FROM public.organization_capabilities
    WHERE organization_id=_org AND capability='operate_store' AND enabled)))
 THEN RAISE EXCEPTION 'STORE_FORBIDDEN'; END IF;
 _snapshot := bemmais_private.store_draft_snapshot_base(_store_id);
 RETURN jsonb_set(_snapshot,'{listings}',coalesce((
  SELECT jsonb_agg(jsonb_set(item,'{product,content_blocks}',coalesce((
   SELECT jsonb_agg(jsonb_build_object('id',b.id,'type',b.type,'position',b.position,'config',b.config) ORDER BY b.position)
   FROM public.product_content_blocks b WHERE b.product_id=(item->>'product_id')::uuid AND b.is_visible),'[]'::jsonb)))
  FROM jsonb_array_elements(_snapshot->'listings') item),'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.store_draft_snapshot(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.store_draft_snapshot(uuid) TO authenticated;

-- SECURITY INVOKER is deliberate: current_user identifies the executing DB role,
-- not a client-settable GUC. Only table-owner RPCs may write publication fields.
CREATE FUNCTION public.guard_store_protected_write()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE _owner name;
BEGIN
 SELECT pg_get_userbyid(relowner) INTO _owner FROM pg_class WHERE oid='public.stores'::regclass;
 IF current_user=_owner THEN RETURN NEW; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'draft' OR NEW.published_snapshot IS NOT NULL OR NEW.published_at IS NOT NULL
   OR NEW.published_by IS NOT NULL OR NEW.published_revision<>0 OR NEW.draft_revision<>0
  THEN RAISE EXCEPTION 'STORE_PUBLICATION_RPC_REQUIRED'; END IF;
 ELSIF NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.id IS DISTINCT FROM OLD.id
  OR NEW.slug IS DISTINCT FROM OLD.slug
  OR NEW.status IS DISTINCT FROM OLD.status OR NEW.published_snapshot IS DISTINCT FROM OLD.published_snapshot
  OR NEW.published_at IS DISTINCT FROM OLD.published_at OR NEW.published_by IS DISTINCT FROM OLD.published_by
  OR NEW.published_revision IS DISTINCT FROM OLD.published_revision
  OR NEW.draft_revision IS DISTINCT FROM OLD.draft_revision
 THEN RAISE EXCEPTION 'STORE_PUBLICATION_RPC_REQUIRED'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER a_store_protected_write BEFORE INSERT OR UPDATE ON public.stores
 FOR EACH ROW EXECUTE FUNCTION public.guard_store_protected_write();
REVOKE ALL ON FUNCTION public.guard_store_protected_write() FROM PUBLIC,anon,authenticated,service_role;

-- Store: BEFORE, return NEW with one revision. Children: AFTER, update parent.
CREATE OR REPLACE FUNCTION public.mark_store_draft_revision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE _target uuid; _old_target uuid;
BEGIN
 IF TG_TABLE_NAME='stores' THEN
  IF (to_jsonb(NEW)-ARRAY['draft_revision','updated_at']) IS DISTINCT FROM
     (to_jsonb(OLD)-ARRAY['draft_revision','updated_at']) THEN
   NEW.draft_revision := OLD.draft_revision+1;
  END IF;
  RETURN NEW;
 END IF;
 IF TG_OP='DELETE' THEN _target:=(to_jsonb(OLD)->>'store_id')::uuid;
 ELSE _target:=(to_jsonb(NEW)->>'store_id')::uuid; END IF;
 IF TG_OP='UPDATE' THEN
  IF (to_jsonb(NEW)-'updated_at') IS NOT DISTINCT FROM (to_jsonb(OLD)-'updated_at') THEN RETURN NEW; END IF;
  _old_target:=(to_jsonb(OLD)->>'store_id')::uuid;
 END IF;
 UPDATE public.stores SET draft_revision=draft_revision+1 WHERE id=_target;
 IF _old_target IS DISTINCT FROM _target AND _old_target IS NOT NULL THEN
  UPDATE public.stores SET draft_revision=draft_revision+1 WHERE id=_old_target;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER t_store_draft_revision ON public.stores;
CREATE TRIGGER t_store_draft_revision BEFORE UPDATE OF name,slug,logo_url,favicon_url,description,theme,seo,storefront_config
 ON public.stores FOR EACH ROW EXECUTE FUNCTION public.mark_store_draft_revision();
REVOKE ALL ON FUNCTION public.mark_store_draft_revision() FROM PUBLIC,anon,authenticated,service_role;

-- Existing publish_store remains the only way to build a published projection.
-- Administrative suspension never replaces the historical published snapshot.
CREATE FUNCTION public.change_store_status(_store_id uuid,_status text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE _s public.stores%ROWTYPE;
BEGIN
 SELECT * INTO _s FROM public.stores WHERE id=_store_id FOR UPDATE;
 IF auth.uid() IS NULL OR _s.id IS NULL OR NOT (
  public.is_platform_admin(auth.uid()) OR (
   public.has_org_permission(auth.uid(),_s.organization_id,'stores.manage') AND EXISTS(
    SELECT 1 FROM public.organization_capabilities WHERE organization_id=_s.organization_id AND capability='operate_store' AND enabled)))
 THEN RAISE EXCEPTION 'STORE_FORBIDDEN'; END IF;
 IF _status='published' THEN
  RETURN public.publish_store(_store_id);
 END IF;
 IF _status IS NULL OR _status NOT IN ('draft','suspended','archived') THEN RAISE EXCEPTION 'STORE_INVALID_STATUS'; END IF;
 UPDATE public.stores SET status=_status::public.store_status WHERE id=_store_id;
 RETURN jsonb_build_object('store_id',_store_id,'status',_status);
END $$;
REVOKE ALL ON FUNCTION public.change_store_status(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.change_store_status(uuid,text) TO authenticated;

-- Reserve/release are never generic adjustments. RPC execution uses the table
-- owner; authenticated writers cannot forge this identity or operational refs.
CREATE FUNCTION public.guard_inventory_operational_movement()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE _owner name; _r public.inventory_movements%ROWTYPE; _i public.order_items%ROWTYPE;
BEGIN
 SELECT pg_get_userbyid(relowner) INTO _owner FROM pg_class WHERE oid='public.inventory_movements'::regclass;
 IF NEW.movement_type IN ('reserve','release') OR NEW.reference_type IN
  ('order_item','inventory_reservation_release','inventory_reservation_consumption') THEN
  IF current_user<>_owner THEN RAISE EXCEPTION 'INVENTORY_OPERATIONAL_RPC_REQUIRED'; END IF;
 END IF;
 IF NEW.movement_type='reserve' THEN
  SELECT * INTO _i FROM public.order_items WHERE id::text=NEW.reference_id;
  IF NEW.reference_type IS DISTINCT FROM 'order_item' OR _i.id IS NULL
   OR NEW.organization_id IS DISTINCT FROM _i.stock_owner_organization_id
   OR NEW.variant_id IS DISTINCT FROM _i.variant_id OR NEW.quantity IS DISTINCT FROM _i.quantity
  THEN RAISE EXCEPTION 'STOCK_POSITION_INVALID'; END IF;
 ELSIF NEW.movement_type='release' THEN
  SELECT * INTO _r FROM public.inventory_movements WHERE id::text=NEW.reference_id AND movement_type='reserve' AND reference_type='order_item';
  IF NEW.reference_type IS DISTINCT FROM 'inventory_reservation_release' OR _r.id IS NULL
   OR NEW.organization_id IS DISTINCT FROM _r.organization_id OR NEW.variant_id IS DISTINCT FROM _r.variant_id
   OR NEW.quantity IS DISTINCT FROM _r.quantity OR NEW.offer_variant_id IS DISTINCT FROM _r.offer_variant_id
  THEN RAISE EXCEPTION 'STOCK_POSITION_INVALID'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(_r.organization_id::text||':'||_r.variant_id::text,0));
  IF EXISTS(SELECT 1 FROM public.inventory_movements WHERE movement_type='out'
   AND reference_type='inventory_reservation_consumption' AND reference_id=_r.id::text)
  THEN RAISE EXCEPTION 'STOCK_RESERVATION_CONSUMED'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER a_inventory_operational_movement BEFORE INSERT ON public.inventory_movements
 FOR EACH ROW EXECUTE FUNCTION public.guard_inventory_operational_movement();
REVOKE ALL ON FUNCTION public.guard_inventory_operational_movement() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.guard_store_domain()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE s public.stores; platform_suffix constant text := '.bemmaisdistribuidora.com.br';
BEGIN
  SELECT * INTO s FROM public.stores WHERE id = NEW.store_id;
  IF s.id IS NULL THEN RAISE EXCEPTION 'Loja não encontrada'; END IF;
  NEW.organization_id := s.organization_id;
  NEW.hostname := public.normalize_hostname(NEW.hostname);
  IF NEW.type = 'platform_subdomain' THEN
    IF NEW.hostname <> s.slug || platform_suffix OR public.is_reserved_slug(split_part(NEW.hostname, '.', 1)) THEN
      RAISE EXCEPTION 'O subdomínio deve usar o slug seguro da loja';
    END IF;
    NEW.status := 'active'; NEW.verification_status := 'active'; NEW.verified_at := coalesce(NEW.verified_at, now());
  ELSE
    IF NEW.hostname LIKE '%.' || 'bemmaisdistribuidora.com.br' THEN RAISE EXCEPTION 'Use PLATFORM_SUBDOMAIN para endereços BemMais'; END IF;
    IF TG_OP = 'INSERT' THEN
      NEW.status := 'pending_configuration'; NEW.verification_status := 'pending'; NEW.verified_at := NULL; NEW.provider := NULL; NEW.provider_reference := NULL; NEW.verification_data := '{}'::jsonb;
    ELSIF auth.uid() IS NOT NULL AND (NEW.status IS DISTINCT FROM OLD.status OR NEW.verification_status IS DISTINCT FROM OLD.verification_status OR NEW.verified_at IS DISTINCT FROM OLD.verified_at OR NEW.provider IS DISTINCT FROM OLD.provider OR NEW.provider_reference IS DISTINCT FROM OLD.provider_reference) THEN
      RAISE EXCEPTION 'A verificação de domínio depende da infraestrutura BemMais';
    END IF;
    IF NEW.status = 'active' AND (NEW.verification_status <> 'active' OR NEW.verified_at IS NULL OR nullif(NEW.provider, '') IS NULL) THEN
      RAISE EXCEPTION 'Domínio personalizado não pode ficar ativo sem verificação do provider';
    END IF;
  END IF;
  IF TG_OP='UPDATE' AND (NEW.store_id IS DISTINCT FROM OLD.store_id OR NEW.type IS DISTINCT FROM OLD.type)
  THEN RAISE EXCEPTION 'DOMAIN_IDENTITY_IMMUTABLE'; END IF;
  IF TG_OP='UPDATE' AND NEW.hostname IS DISTINCT FROM OLD.hostname AND NOT (
    NEW.type='platform_subdomain' AND NEW.hostname=s.slug||platform_suffix AND
    current_user=(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.store_domains'::regclass))
  THEN RAISE EXCEPTION 'DOMAIN_HOSTNAME_IMMUTABLE'; END IF;
  IF NEW.is_primary AND NEW.status <> 'active' THEN RAISE EXCEPTION 'Somente domínio ativo pode ser principal'; END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.change_store_slug(_store_id uuid, _slug text, _confirmed boolean DEFAULT false)
RETURNS public.stores LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE s public.stores; result public.stores;
BEGIN
  SELECT * INTO s FROM public.stores WHERE id = _store_id FOR UPDATE;
  IF s.id IS NULL THEN RAISE EXCEPTION 'Loja não encontrada'; END IF;
  IF NOT (public.is_platform_admin(auth.uid()) OR public.has_org_permission(auth.uid(), s.organization_id, 'stores.manage')) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF s.status = 'published' AND NOT _confirmed THEN RAISE EXCEPTION 'Confirme a alteração do endereço publicado'; END IF;
  PERFORM set_config('app.slug_change_confirmed', CASE WHEN _confirmed THEN 'true' ELSE 'false' END, true);
  UPDATE public.stores SET slug = _slug WHERE id = _store_id RETURNING * INTO result;
  -- Consistent with checkout: store first, managed domains by ID.
  PERFORM id FROM public.store_domains WHERE store_id=_store_id ORDER BY id FOR UPDATE;
  UPDATE public.store_domains SET hostname = result.slug || '.bemmaisdistribuidora.com.br'
    WHERE store_id = _store_id AND type = 'platform_subdomain';
  IF NOT FOUND THEN
    INSERT INTO public.store_domains (store_id, organization_id, hostname, type, status, verification_status, is_primary)
    VALUES (result.id, result.organization_id, result.slug || '.bemmaisdistribuidora.com.br', 'platform_subdomain', 'active', 'active',
      NOT EXISTS (SELECT 1 FROM public.store_domains WHERE store_id = _store_id AND is_primary));
  END IF;
  RETURN result;
END $$;


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
     OR jsonb_typeof(_items) IS DISTINCT FROM 'array'
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
  WHERE slug = lower(btrim(_store_slug)) AND status = 'published' FOR SHARE NOWAIT;
  IF _store.id IS NULL THEN RAISE EXCEPTION 'STORE_UNAVAILABLE'; END IF;
  IF _shipping_address->>'delivery_method'='pickup' AND NOT _store.allow_pickup THEN RAISE EXCEPTION 'PICKUP_UNAVAILABLE'; END IF;

  -- SHARE locks protect every authoritative commercial read through commit.
  -- NOWAIT avoids waiting behind editors holding child rows then parent rows.
  -- Deterministic table order, UUID order within tables; stock locks follow.
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(_items) item WHERE
   coalesce(item->>'listingId','') !~* '^[0-9a-f-]{36}$' OR
   coalesce(item->>'variantId','') !~* '^[0-9a-f-]{36}$') THEN RAISE EXCEPTION 'INVALID_ITEM'; END IF;
  PERFORM l.id FROM public.store_listings l WHERE l.id IN
   (SELECT (item->>'listingId')::uuid FROM jsonb_array_elements(_items) item) ORDER BY l.id FOR SHARE NOWAIT;
  PERFORM p.id FROM public.products p WHERE p.id IN
   (SELECT product_id FROM public.store_listings WHERE id IN
    (SELECT (item->>'listingId')::uuid FROM jsonb_array_elements(_items) item)) ORDER BY p.id FOR SHARE NOWAIT;
  PERFORM v.id FROM public.product_variants v WHERE v.id IN
   (SELECT (item->>'variantId')::uuid FROM jsonb_array_elements(_items) item) ORDER BY v.id FOR SHARE NOWAIT;
  PERFORM o.id FROM public.supplier_offers o WHERE o.id IN
   (SELECT offer_id FROM public.store_listings WHERE id IN
    (SELECT (item->>'listingId')::uuid FROM jsonb_array_elements(_items) item)) ORDER BY o.id FOR SHARE NOWAIT;
  PERFORM ov.id FROM public.supplier_offer_variants ov WHERE ov.offer_id IN
   (SELECT offer_id FROM public.store_listings WHERE id IN
    (SELECT (item->>'listingId')::uuid FROM jsonb_array_elements(_items) item))
   AND ov.variant_id IN (SELECT (item->>'variantId')::uuid FROM jsonb_array_elements(_items) item)
   ORDER BY ov.id FOR SHARE NOWAIT;

  FOR _raw IN SELECT value FROM jsonb_array_elements(_items) LOOP
    BEGIN
      _qty := (_raw->>'quantity')::integer;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'INVALID_ITEM';
    END;
    IF _qty IS NULL OR _qty < 1 OR _qty > 999
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
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN
  RAISE EXCEPTION 'CHECKOUT_CONCURRENT_CHANGE';
WHEN invalid_text_representation THEN
  RAISE EXCEPTION 'INVALID_ITEM';
WHEN unique_violation THEN
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
