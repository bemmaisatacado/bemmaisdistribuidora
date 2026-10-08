-- Operational groups do not represent a carrier/shipment. No shipping event is fabricated.
CREATE TABLE public.order_fulfillments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 order_id uuid NOT NULL REFERENCES public.orders(id),
 group_key text NOT NULL,
 fulfillment_owner_organization_id uuid NOT NULL REFERENCES public.organizations(id),
 stock_owner_organization_id uuid REFERENCES public.organizations(id),
 supplier_organization_id uuid REFERENCES public.organizations(id),
 seller_organization_id uuid REFERENCES public.organizations(id),
 status text NOT NULL DEFAULT 'ready_to_pick' CHECK(status IN ('ready_to_pick','picking','packed','ready_to_ship')),
 created_by uuid NOT NULL REFERENCES auth.users(id),
 updated_by uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 picking_at timestamptz, packed_at timestamptz, stock_consumed_at timestamptz,
 UNIQUE(order_id,group_key), UNIQUE(id,order_id)
);
ALTER TABLE public.order_items ADD COLUMN fulfillment_id uuid;
ALTER TABLE public.order_items ADD CONSTRAINT order_item_fulfillment_order_fk
 FOREIGN KEY(fulfillment_id,order_id) REFERENCES public.order_fulfillments(id,order_id);
CREATE INDEX order_items_fulfillment_idx ON public.order_items(fulfillment_id);
CREATE UNIQUE INDEX inventory_consumption_once_per_reservation_idx
 ON public.inventory_movements(reference_id)
 WHERE movement_type='out' AND reference_type='inventory_reservation_consumption';
ALTER TABLE public.order_fulfillments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_fulfillments FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.order_fulfillments TO authenticated;
CREATE POLICY "fulfillments platform read" ON public.order_fulfillments FOR SELECT TO authenticated
 USING(public.is_platform_admin(auth.uid()));
CREATE TRIGGER audit_order_fulfillments AFTER INSERT OR UPDATE ON public.order_fulfillments
 FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

CREATE FUNCTION public.fulfillment_transition_allowed(_from text,_to text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $$
 SELECT coalesce((_from='ready_to_pick' AND _to='picking') OR (_from='picking' AND _to='packed')
 OR (_from='packed' AND _to='ready_to_ship'),false)
$$;

-- Reuse supplier fulfillment_mode, never a browser-supplied organization.
-- Explicit historical owner wins. Third-party without an owner stays blocked.
CREATE FUNCTION public.resolved_item_fulfillment_owner(_item_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce(oi.fulfillment_owner_organization_id,
  CASE WHEN sp.fulfillment_mode='supplier' THEN oi.supplier_organization_id
       WHEN sp.fulfillment_mode='bemmais' THEN (SELECT id FROM public.organizations WHERE is_platform)
       WHEN oi.supplier_organization_id IS NULL AND stock.is_platform THEN stock.id
       ELSE NULL END)
 FROM public.order_items oi LEFT JOIN public.supplier_profiles sp ON sp.organization_id=oi.supplier_organization_id
 LEFT JOIN public.organizations stock ON stock.id=oi.stock_owner_organization_id WHERE oi.id=_item_id
$$;

-- Require exactly one matching, verified paid payment, not merely order.status.
CREATE FUNCTION public.order_fulfillment_block(_order_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE _o public.orders%ROWTYPE; _p public.payments%ROWTYPE;
BEGIN
 SELECT * INTO _o FROM public.orders WHERE id=_order_id;
 IF NOT FOUND OR _o.status<>'paid' OR _o.payment_status<>'paid' THEN RETURN 'ORDER_NOT_PAID'; END IF;
 IF (SELECT count(*) FROM public.payments WHERE order_id=_order_id AND status='paid')<>1
 OR EXISTS(SELECT 1 FROM public.payments WHERE order_id=_order_id AND status NOT IN ('paid','failed','expired','cancelled'))
 THEN RETURN 'PAYMENT_UNCERTAIN'; END IF;
 SELECT * INTO _p FROM public.payments WHERE order_id=_order_id AND status='paid';
 IF _p.paid_at IS NULL OR _p.amount IS DISTINCT FROM _o.total_amount
 OR _p.currency IS DISTINCT FROM _o.currency::text OR _p.buyer_user_id IS DISTINCT FROM _o.buyer_user_id
 OR _p.organization_id IS DISTINCT FROM _o.organization_id
 OR NOT EXISTS(SELECT 1 FROM public.payment_provider_events e WHERE e.payment_id=_p.id
  AND e.provider=_p.provider AND e.status_after='paid' AND e.processed_at IS NOT NULL
  AND e.verified_amount=_p.amount AND e.verified_currency=_p.currency)
 THEN RETURN 'PAYMENT_UNVERIFIED'; END IF;
 RETURN NULL;
END $$;

CREATE FUNCTION public.guard_fulfillment_write()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'FULFILLMENT_IMMUTABLE'; END IF;
 IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid())
 OR current_setting('bemmais.fulfillment_order',true) IS DISTINCT FROM NEW.order_id::text
 THEN RAISE EXCEPTION 'FULFILLMENT_RPC_REQUIRED'; END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.order_id IS DISTINCT FROM OLD.order_id OR NEW.group_key IS DISTINCT FROM OLD.group_key
  OR NEW.fulfillment_owner_organization_id IS DISTINCT FROM OLD.fulfillment_owner_organization_id
  OR NEW.stock_owner_organization_id IS DISTINCT FROM OLD.stock_owner_organization_id
  OR NEW.supplier_organization_id IS DISTINCT FROM OLD.supplier_organization_id
  OR NEW.seller_organization_id IS DISTINCT FROM OLD.seller_organization_id
  OR NOT public.fulfillment_transition_allowed(OLD.status,NEW.status)
  THEN RAISE EXCEPTION 'FULFILLMENT_INVALID_TRANSITION'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_fulfillment_write BEFORE INSERT OR UPDATE OR DELETE ON public.order_fulfillments
 FOR EACH ROW EXECUTE FUNCTION public.guard_fulfillment_write();

CREATE FUNCTION public.guard_fulfillment_item()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF OLD.fulfillment_id IS NOT NULL AND
  (to_jsonb(NEW)-ARRAY['fulfillment_status','updated_at']) IS DISTINCT FROM
  (to_jsonb(OLD)-ARRAY['fulfillment_status','updated_at']) THEN RAISE EXCEPTION 'FULFILLMENT_ITEM_IMMUTABLE'; END IF;
 IF NEW.fulfillment_id IS DISTINCT FROM OLD.fulfillment_id
 OR (OLD.fulfillment_id IS NOT NULL AND NEW.fulfillment_status IS DISTINCT FROM OLD.fulfillment_status) THEN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid())
  OR current_setting('bemmais.fulfillment_order',true) IS DISTINCT FROM NEW.order_id::text
  THEN RAISE EXCEPTION 'FULFILLMENT_RPC_REQUIRED'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_fulfillment_item BEFORE UPDATE ON public.order_items
 FOR EACH ROW EXECUTE FUNCTION public.guard_fulfillment_item();

CREATE FUNCTION public.start_order_fulfillment(_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE _block text; _group record; _fid uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 PERFORM id FROM public.orders WHERE id=_order_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
 PERFORM id FROM public.payments WHERE order_id=_order_id ORDER BY id FOR UPDATE;
 PERFORM id FROM public.order_items WHERE order_id=_order_id ORDER BY id FOR UPDATE;
 PERFORM sp.organization_id FROM public.supplier_profiles sp WHERE sp.organization_id IN
  (SELECT supplier_organization_id FROM public.order_items WHERE order_id=_order_id)
  ORDER BY sp.organization_id FOR SHARE;
 _block:=public.order_fulfillment_block(_order_id);
 IF _block IS NOT NULL THEN RAISE EXCEPTION '%',_block; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.order_items WHERE order_id=_order_id)
 OR EXISTS(SELECT 1 FROM public.order_items WHERE order_id=_order_id AND
  (public.resolved_item_fulfillment_owner(id) IS NULL OR (fulfillment_id IS NULL AND fulfillment_status<>'unassigned')))
 THEN RAISE EXCEPTION 'FULFILLMENT_CONTEXT_INVALID'; END IF;
 IF EXISTS(SELECT 1 FROM public.order_fulfillments WHERE order_id=_order_id) THEN
  IF EXISTS(SELECT 1 FROM public.order_items WHERE order_id=_order_id AND fulfillment_id IS NULL)
  THEN RAISE EXCEPTION 'FULFILLMENT_CONTEXT_INVALID'; END IF;
  RETURN jsonb_build_object('order_id',_order_id,'idempotent',true);
 END IF;
 PERFORM set_config('bemmais.fulfillment_order',_order_id::text,true);
 UPDATE public.order_items SET fulfillment_owner_organization_id=public.resolved_item_fulfillment_owner(id)
 WHERE order_id=_order_id AND fulfillment_owner_organization_id IS NULL;
 FOR _group IN
  SELECT fulfillment_owner_organization_id,stock_owner_organization_id,supplier_organization_id,seller_organization_id,
   concat_ws(':',fulfillment_owner_organization_id::text,coalesce(stock_owner_organization_id::text,'none'),
    coalesce(supplier_organization_id::text,'none'),coalesce(seller_organization_id::text,'none')) AS key
  FROM public.order_items WHERE order_id=_order_id
  GROUP BY fulfillment_owner_organization_id,stock_owner_organization_id,supplier_organization_id,seller_organization_id
  ORDER BY fulfillment_owner_organization_id,stock_owner_organization_id,supplier_organization_id,seller_organization_id
 LOOP
  INSERT INTO public.order_fulfillments(order_id,group_key,fulfillment_owner_organization_id,
   stock_owner_organization_id,supplier_organization_id,seller_organization_id,created_by,updated_by)
  VALUES(_order_id,_group.key,_group.fulfillment_owner_organization_id,_group.stock_owner_organization_id,
   _group.supplier_organization_id,_group.seller_organization_id,auth.uid(),auth.uid()) RETURNING id INTO _fid;
  UPDATE public.order_items SET fulfillment_id=_fid,fulfillment_status='pending'
  WHERE order_id=_order_id AND fulfillment_owner_organization_id=_group.fulfillment_owner_organization_id
   AND stock_owner_organization_id IS NOT DISTINCT FROM _group.stock_owner_organization_id
   AND supplier_organization_id IS NOT DISTINCT FROM _group.supplier_organization_id
   AND seller_organization_id IS NOT DISTINCT FROM _group.seller_organization_id;
 END LOOP;
 PERFORM set_config('bemmais.fulfillment_order','',true);
 RETURN jsonb_build_object('order_id',_order_id,'idempotent',false);
END $$;

CREATE FUNCTION public.advance_order_fulfillment(_fulfillment_id uuid,_expected_status text,_target_status text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE _order_id uuid; _f public.order_fulfillments%ROWTYPE; _block text;
 _pos record; _item record; _r public.inventory_movements%ROWTYPE; _balance record;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 SELECT order_id INTO _order_id FROM public.order_fulfillments WHERE id=_fulfillment_id;
 PERFORM id FROM public.orders WHERE id=_order_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'FULFILLMENT_NOT_FOUND'; END IF;
 PERFORM id FROM public.payments WHERE order_id=_order_id ORDER BY id FOR UPDATE;
 PERFORM id FROM public.order_items WHERE order_id=_order_id ORDER BY id FOR UPDATE;
 SELECT * INTO _f FROM public.order_fulfillments WHERE id=_fulfillment_id FOR UPDATE;
 _block:=public.order_fulfillment_block(_order_id);
 IF _block IS NOT NULL THEN RAISE EXCEPTION '%',_block; END IF;
 -- Retry of an already completed step never duplicates ledger or audit writes.
 IF _f.status=_target_status AND public.fulfillment_transition_allowed(_expected_status,_target_status) THEN
  RETURN jsonb_build_object('fulfillment_id',_f.id,'idempotent',true); END IF;
 IF _f.status IS DISTINCT FROM _expected_status OR NOT public.fulfillment_transition_allowed(_f.status,_target_status)
 THEN RAISE EXCEPTION 'FULFILLMENT_INVALID_TRANSITION'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.order_items WHERE fulfillment_id=_f.id)
 THEN RAISE EXCEPTION 'FULFILLMENT_CONTEXT_INVALID'; END IF;
 IF _target_status='ready_to_ship' THEN
  FOR _pos IN SELECT DISTINCT m.organization_id,m.variant_id FROM public.inventory_movements m
   JOIN public.order_items oi ON m.reference_type='order_item' AND m.reference_id=oi.id::text
   WHERE oi.fulfillment_id=_f.id AND m.movement_type='reserve' ORDER BY m.organization_id,m.variant_id
  LOOP PERFORM pg_advisory_xact_lock(hashtextextended(_pos.organization_id::text||':'||_pos.variant_id::text,0)); END LOOP;
  PERFORM set_config('bemmais.fulfillment_order',_order_id::text,true);
  FOR _item IN SELECT * FROM public.order_items WHERE fulfillment_id=_f.id ORDER BY stock_owner_organization_id,variant_id,id LOOP
   SELECT * INTO _r FROM public.inventory_movements WHERE movement_type='reserve'
    AND reference_type='order_item' AND reference_id=_item.id::text;
   -- Existing checkout defines controlled stock by an actual reservation; absent = uncontrolled.
   IF NOT FOUND THEN CONTINUE; END IF;
   IF _r.organization_id IS DISTINCT FROM _item.stock_owner_organization_id OR _r.variant_id IS DISTINCT FROM _item.variant_id
    OR _r.quantity<>_item.quantity THEN RAISE EXCEPTION 'STOCK_POSITION_INVALID'; END IF;
   IF EXISTS(SELECT 1 FROM public.inventory_movements WHERE movement_type='out'
    AND reference_type='inventory_reservation_consumption' AND reference_id=_r.id::text)
   THEN RAISE EXCEPTION 'STOCK_RESERVATION_CONSUMED'; END IF;
   IF EXISTS(SELECT 1 FROM public.inventory_movements WHERE movement_type='release'
    AND reference_type='inventory_reservation_release' AND reference_id=_r.id::text)
   THEN RAISE EXCEPTION 'STOCK_RESERVATION_RELEASED'; END IF;
   SELECT * INTO _balance FROM public.inventory_balances WHERE organization_id=_r.organization_id AND variant_id=_r.variant_id;
   IF NOT FOUND OR _balance.on_hand<_r.quantity OR _balance.reserved<_r.quantity OR _balance.on_hand-_balance.reserved<0
   THEN RAISE EXCEPTION 'STOCK_POSITION_INVALID'; END IF;
   -- Release first so the existing balance guard never sees available reduced twice.
   -- Both entries commit together, or neither does. No historical entry is modified.
   INSERT INTO public.inventory_movements(organization_id,variant_id,offer_variant_id,movement_type,quantity,
    reason,reference_type,reference_id,created_by) VALUES(_r.organization_id,_r.variant_id,_r.offer_variant_id,
    'release',_r.quantity,'physical_consumption','inventory_reservation_release',_r.id::text,auth.uid());
   INSERT INTO public.inventory_movements(organization_id,variant_id,offer_variant_id,movement_type,quantity,
    reason,reference_type,reference_id,created_by) VALUES(_r.organization_id,_r.variant_id,_r.offer_variant_id,
    'out',_r.quantity,'physical_consumption','inventory_reservation_consumption',_r.id::text,auth.uid());
  END LOOP;
 END IF;
 PERFORM set_config('bemmais.fulfillment_order',_order_id::text,true);
 UPDATE public.order_fulfillments SET status=_target_status,updated_by=auth.uid(),updated_at=now(),
  picking_at=CASE WHEN _target_status='picking' THEN now() ELSE picking_at END,
  packed_at=CASE WHEN _target_status='packed' THEN now() ELSE packed_at END,
  stock_consumed_at=CASE WHEN _target_status='ready_to_ship' THEN now() ELSE stock_consumed_at END WHERE id=_f.id;
 PERFORM set_config('bemmais.fulfillment_order','',true);
 RETURN jsonb_build_object('fulfillment_id',_f.id,'idempotent',false);
END $$;

-- Prevent public inventory writers from forging operational reserve-consumption references.
CREATE FUNCTION public.guard_inventory_fulfillment_reference()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE _order_id uuid;
BEGIN
 IF NEW.reference_type='inventory_reservation_consumption' OR
  (NEW.reference_type='inventory_reservation_release' AND NEW.reason='physical_consumption') THEN
  SELECT oi.order_id INTO _order_id FROM public.inventory_movements r JOIN public.order_items oi
   ON r.reference_type='order_item' AND r.reference_id=oi.id::text
   WHERE r.id::text=NEW.reference_id AND r.movement_type='reserve';
  IF _order_id IS NULL OR auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid())
   OR current_setting('bemmais.fulfillment_order',true) IS DISTINCT FROM _order_id::text
  THEN RAISE EXCEPTION 'FULFILLMENT_RPC_REQUIRED'; END IF;
 END IF;
 IF NEW.movement_type='release' AND NEW.reference_type='inventory_reservation_release'
 AND EXISTS(SELECT 1 FROM public.inventory_movements WHERE movement_type='out'
  AND reference_type='inventory_reservation_consumption' AND reference_id=NEW.reference_id)
 THEN RAISE EXCEPTION 'STOCK_RESERVATION_CONSUMED'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_inventory_fulfillment_reference BEFORE INSERT ON public.inventory_movements
 FOR EACH ROW EXECUTE FUNCTION public.guard_inventory_fulfillment_reference();

CREATE FUNCTION public.guard_order_with_fulfillment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.status='cancelled' AND EXISTS(SELECT 1 FROM public.order_fulfillments WHERE order_id=NEW.id)
 THEN RAISE EXCEPTION 'ORDER_FULFILLMENT_BLOCK'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_order_with_fulfillment BEFORE UPDATE ON public.orders
 FOR EACH ROW EXECUTE FUNCTION public.guard_order_with_fulfillment();

CREATE FUNCTION public.admin_order_fulfillments(_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE _block text;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 _block:=public.order_fulfillment_block(_order_id);
 IF _block IS NULL AND (NOT EXISTS(SELECT 1 FROM public.order_items WHERE order_id=_order_id)
  OR EXISTS(SELECT 1 FROM public.order_items WHERE order_id=_order_id AND public.resolved_item_fulfillment_owner(id) IS NULL))
 THEN _block:='FULFILLMENT_CONTEXT_INVALID'; END IF;
 RETURN jsonb_build_object('block',_block,'can_start',_block IS NULL AND NOT EXISTS(SELECT 1 FROM public.order_fulfillments WHERE order_id=_order_id),
 'groups',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',f.id,'status',f.status,'owner',owner.name,
  'stock_owner',stock.name,'supplier',supplier.name,'seller',seller.name,'created_at',f.created_at,
  'updated_at',f.updated_at,'stock_consumed_at',f.stock_consumed_at,'updated_by',f.updated_by,
  'items',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',oi.id,'name',oi.product_name_snapshot,'sku',oi.sku_snapshot,
    'quantity',oi.quantity,'reservation',CASE WHEN r.id IS NULL THEN 'not_controlled'
      WHEN c.id IS NOT NULL THEN 'consumed' WHEN rel.id IS NOT NULL THEN 'released' ELSE 'reserved' END) ORDER BY oi.id),'[]'::jsonb)
   FROM public.order_items oi LEFT JOIN public.inventory_movements r ON r.movement_type='reserve' AND r.reference_type='order_item' AND r.reference_id=oi.id::text
   LEFT JOIN public.inventory_movements rel ON rel.movement_type='release' AND rel.reference_type='inventory_reservation_release' AND rel.reference_id=r.id::text
   LEFT JOIN public.inventory_movements c ON c.movement_type='out' AND c.reference_type='inventory_reservation_consumption' AND c.reference_id=r.id::text
   WHERE oi.fulfillment_id=f.id)) ORDER BY f.group_key),'[]'::jsonb)
  FROM public.order_fulfillments f JOIN public.organizations owner ON owner.id=f.fulfillment_owner_organization_id
  LEFT JOIN public.organizations stock ON stock.id=f.stock_owner_organization_id
  LEFT JOIN public.organizations supplier ON supplier.id=f.supplier_organization_id
  LEFT JOIN public.organizations seller ON seller.id=f.seller_organization_id WHERE f.order_id=_order_id),
 'activity',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'action',a.action,'actor',a.actor_id,'at',a.occurred_at) ORDER BY a.occurred_at DESC),'[]'::jsonb)
  FROM public.audit_logs a WHERE a.entity_type='order_fulfillments' AND a.entity_id IN(SELECT id::text FROM public.order_fulfillments WHERE order_id=_order_id)));
END $$;

REVOKE ALL ON FUNCTION public.order_fulfillment_block(uuid),public.resolved_item_fulfillment_owner(uuid),public.guard_fulfillment_write(),public.guard_fulfillment_item(),
 public.guard_inventory_fulfillment_reference(),public.guard_order_with_fulfillment() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.start_order_fulfillment(uuid),public.advance_order_fulfillment(uuid,text,text),public.admin_order_fulfillments(uuid)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.start_order_fulfillment(uuid),public.advance_order_fulfillment(uuid,text,text),public.admin_order_fulfillments(uuid)
 TO authenticated;
