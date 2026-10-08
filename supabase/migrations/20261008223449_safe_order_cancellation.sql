-- Cancellation is operational, never a refund or a stock exit.
ALTER TABLE public.orders
 ADD COLUMN cancellation_reason text,
 ADD COLUMN cancelled_at timestamptz,
 ADD COLUMN cancelled_by uuid REFERENCES auth.users(id);
ALTER TABLE public.orders ADD CONSTRAINT orders_cancellation_record
 CHECK ((cancelled_at IS NULL AND cancelled_by IS NULL AND cancellation_reason IS NULL)
 OR (cancelled_at IS NOT NULL AND cancelled_by IS NOT NULL AND cancellation_reason IS NOT NULL
 AND length(btrim(cancellation_reason)) BETWEEN 3 AND 1000));

CREATE FUNCTION public.order_cancellation_block(_status public.order_status,
 _payment public.payment_status, _items public.order_fulfillment_status[],
 _attempts public.payment_status[], _financial boolean)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $$
 SELECT CASE
 WHEN _status NOT IN ('draft','pending_payment','cancelled') THEN 'ORDER_NOT_CANCELLABLE'
 WHEN _payment NOT IN ('pending','failed','expired','cancelled') OR _financial THEN 'ORDER_FINANCIAL_BLOCK'
 WHEN EXISTS(SELECT 1 FROM unnest(_attempts) s WHERE s NOT IN ('failed','expired','cancelled')) THEN 'ORDER_PAYMENT_UNCERTAIN'
 WHEN EXISTS(SELECT 1 FROM unnest(_items) s WHERE s NOT IN ('unassigned','cancelled')) THEN 'ORDER_FULFILLMENT_BLOCK'
 ELSE NULL END
$$;

CREATE FUNCTION public.admin_order_cancellation_context(_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE _o public.orders%ROWTYPE; _block text;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 SELECT * INTO _o FROM public.orders WHERE id=_order_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
 SELECT public.order_cancellation_block(_o.status,_o.payment_status,
  ARRAY(SELECT fulfillment_status FROM public.order_items WHERE order_id=_order_id),
  ARRAY(SELECT status FROM public.payments WHERE order_id=_order_id),
  EXISTS(SELECT 1 FROM public.payment_allocations a JOIN public.payments p ON p.id=a.payment_id WHERE p.order_id=_order_id)
  OR EXISTS(SELECT 1 FROM public.ledger_entries l WHERE (l.reference_type='order' AND l.reference_id=_order_id::text)
    OR (l.reference_type='payment' AND l.reference_id IN(SELECT id::text FROM public.payments WHERE order_id=_order_id)))) INTO _block;
 IF _block IS NULL AND EXISTS(SELECT 1 FROM public.inventory_movements m WHERE m.movement_type='out'
  AND ((m.reference_type='order' AND m.reference_id=_order_id::text)
  OR (m.reference_type='order_item' AND m.reference_id IN(SELECT id::text FROM public.order_items WHERE order_id=_order_id)))) THEN
  _block:='ORDER_FULFILLMENT_BLOCK'; END IF;
 RETURN jsonb_build_object('block',_block,'cancelled_at',_o.cancelled_at,
  'cancelled_by',_o.cancelled_by,'reason',_o.cancellation_reason,
  'can_cancel',_block IS NULL AND _o.status IN ('draft','pending_payment'));
END $$;

CREATE FUNCTION public.cancel_order(_order_id uuid,_expected_status public.order_status,_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE _o public.orders%ROWTYPE; _actor uuid:=auth.uid(); _reason_key text:=btrim(_reason);
 _block text; _position record; _item record; _release jsonb; _released integer:=0;
BEGIN
 IF _actor IS NULL OR NOT public.is_platform_admin(_actor) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 IF _reason_key IS NULL OR length(_reason_key) NOT BETWEEN 3 AND 1000 THEN RAISE EXCEPTION 'CANCELLATION_REASON_REQUIRED'; END IF;
 -- Same order-first lock as payment creation/confirmation. No payment can win halfway through cancellation.
 SELECT * INTO _o FROM public.orders WHERE id=_order_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
 PERFORM id FROM public.payments WHERE order_id=_order_id ORDER BY id FOR UPDATE;
 PERFORM id FROM public.order_items WHERE order_id=_order_id ORDER BY id FOR UPDATE;
 SELECT public.order_cancellation_block(_o.status,_o.payment_status,
  ARRAY(SELECT fulfillment_status FROM public.order_items WHERE order_id=_order_id),
  ARRAY(SELECT status FROM public.payments WHERE order_id=_order_id),
  EXISTS(SELECT 1 FROM public.payment_allocations a JOIN public.payments p ON p.id=a.payment_id WHERE p.order_id=_order_id)
  OR EXISTS(SELECT 1 FROM public.ledger_entries l WHERE (l.reference_type='order' AND l.reference_id=_order_id::text)
    OR (l.reference_type='payment' AND l.reference_id IN(SELECT id::text FROM public.payments WHERE order_id=_order_id)))) INTO _block;
 IF _block IS NOT NULL THEN RAISE EXCEPTION '%',_block; END IF;
 IF _o.status='cancelled' THEN
  IF _o.cancelled_at IS NULL THEN RAISE EXCEPTION 'ORDER_LEGACY_CANCELLED'; END IF;
  IF _o.cancellation_reason IS DISTINCT FROM _reason_key THEN RAISE EXCEPTION 'CANCELLATION_IDEMPOTENCY_CONFLICT'; END IF;
  RETURN jsonb_build_object('order_id',_o.id,'idempotent',true,'released',0);
 END IF;
 IF _expected_status IS NULL OR _o.status IS DISTINCT FROM _expected_status THEN RAISE EXCEPTION 'ORDER_STATUS_CONFLICT'; END IF;
 -- Every controlled owner/SKU locked in the same lexical order used by checkout.
 FOR _position IN
  SELECT DISTINCT m.organization_id,m.variant_id FROM public.inventory_movements m
  JOIN public.order_items oi ON m.reference_type='order_item' AND m.reference_id=oi.id::text
  WHERE oi.order_id=_order_id AND m.movement_type='reserve'
  ORDER BY m.organization_id,m.variant_id
 LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended(_position.organization_id::text||':'||_position.variant_id::text,0));
 END LOOP;
 IF EXISTS(SELECT 1 FROM public.inventory_movements m WHERE m.movement_type='out'
  AND ((m.reference_type='order' AND m.reference_id=_order_id::text)
  OR (m.reference_type='order_item' AND m.reference_id IN(SELECT id::text FROM public.order_items WHERE order_id=_order_id)))) THEN
  RAISE EXCEPTION 'ORDER_FULFILLMENT_BLOCK'; END IF;
 PERFORM set_config('bemmais.cancel_order',_order_id::text,true);
 UPDATE public.orders SET status='cancelled',cancellation_reason=_reason_key,
  cancelled_at=now(),cancelled_by=_actor WHERE id=_order_id;
 FOR _item IN
  SELECT oi.id,m.organization_id,m.variant_id FROM public.order_items oi
  JOIN public.inventory_movements m ON m.reference_type='order_item' AND m.reference_id=oi.id::text AND m.movement_type='reserve'
  WHERE oi.order_id=_order_id ORDER BY m.organization_id,m.variant_id,oi.id
 LOOP
  -- Reuse append-only, unique/idempotent release and existing balance guard.
  _release:=public.release_order_item_reservation(_item.id);
  IF _release->>'released'='true' THEN _released:=_released+1; END IF;
 END LOOP;
 UPDATE public.order_items SET fulfillment_status='cancelled' WHERE order_id=_order_id AND fulfillment_status='unassigned';
 PERFORM set_config('bemmais.cancel_order','',true);
 -- Any exception rolls back order, items, releases and trigger-written audit records.
 RETURN jsonb_build_object('order_id',_o.id,'idempotent',false,'released',_released);
END $$;

-- Harden the existing release entry point too: legacy/manual cancelled orders
-- cannot bypass financial gates. Order-first locks match cancellation/payments.
CREATE OR REPLACE FUNCTION public.release_order_item_reservation(_order_item_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE _o public.orders%ROWTYPE; _reservation public.inventory_movements%ROWTYPE;
 _order_id uuid; _release_id bigint; _block text;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 SELECT order_id INTO _order_id FROM public.order_items WHERE id=_order_item_id;
 SELECT * INTO _o FROM public.orders WHERE id=_order_id FOR UPDATE;
 IF _o.status IS DISTINCT FROM 'cancelled'::public.order_status OR _o.cancelled_at IS NULL THEN
  RAISE EXCEPTION 'RESERVATION_RELEASE_NOT_ALLOWED'; END IF;
 PERFORM id FROM public.payments WHERE order_id=_order_id ORDER BY id FOR UPDATE;
 SELECT public.order_cancellation_block(_o.status,_o.payment_status,
  ARRAY(SELECT fulfillment_status FROM public.order_items WHERE order_id=_order_id),
  ARRAY(SELECT status FROM public.payments WHERE order_id=_order_id),
  EXISTS(SELECT 1 FROM public.payment_allocations a JOIN public.payments p ON p.id=a.payment_id WHERE p.order_id=_order_id)
  OR EXISTS(SELECT 1 FROM public.ledger_entries l WHERE (l.reference_type='order' AND l.reference_id=_order_id::text)
    OR (l.reference_type='payment' AND l.reference_id IN(SELECT id::text FROM public.payments WHERE order_id=_order_id)))) INTO _block;
 IF _block IS NOT NULL THEN RAISE EXCEPTION '%',_block; END IF;
 SELECT * INTO _reservation FROM public.inventory_movements WHERE movement_type='reserve'
  AND reference_type='order_item' AND reference_id=_order_item_id::text;
 IF NOT FOUND THEN RAISE EXCEPTION 'STOCK_RESERVATION_NOT_FOUND'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_reservation.organization_id::text||':'||_reservation.variant_id::text,0));
 SELECT id INTO _release_id FROM public.inventory_movements WHERE movement_type='release'
  AND reference_type='inventory_reservation_release' AND reference_id=_reservation.id::text;
 IF FOUND THEN RETURN jsonb_build_object('released',false,'idempotent',true); END IF;
 INSERT INTO public.inventory_movements(organization_id,variant_id,offer_variant_id,movement_type,quantity,
  reason,reference_type,reference_id,created_by)
 VALUES(_reservation.organization_id,_reservation.variant_id,_reservation.offer_variant_id,'release',_reservation.quantity,
  'cancelled_order_release','inventory_reservation_release',_reservation.id::text,auth.uid()) RETURNING id INTO _release_id;
 RETURN jsonb_build_object('reservation_id',_reservation.id,'release_id',_release_id,'released',true,'idempotent',false);
END $$;

CREATE FUNCTION public.guard_operational_order_cancellation()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.status='cancelled' AND OLD.status IS DISTINCT FROM NEW.status THEN
  IF current_setting('bemmais.cancel_order',true) IS DISTINCT FROM NEW.id::text
    OR auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid())
    OR NEW.cancelled_by IS DISTINCT FROM auth.uid() OR NEW.cancelled_at IS NULL THEN
   RAISE EXCEPTION 'ORDER_CANCELLATION_RPC_REQUIRED'; END IF;
 END IF;
 IF OLD.cancelled_at IS NOT NULL AND (NEW.status IS DISTINCT FROM OLD.status
   OR NEW.cancellation_reason IS DISTINCT FROM OLD.cancellation_reason
   OR NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at OR NEW.cancelled_by IS DISTINCT FROM OLD.cancelled_by) THEN
  RAISE EXCEPTION 'ORDER_CANCELLATION_IMMUTABLE'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_operational_order_cancellation BEFORE UPDATE ON public.orders
 FOR EACH ROW EXECUTE FUNCTION public.guard_operational_order_cancellation();

-- Existing financial writers must share the order lock: no allocation/ledger
-- insertion may race into an order after its cancellation checks have completed.
CREATE FUNCTION public.guard_cancelled_order_financial_reference()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE _order_id uuid; _status public.order_status;
BEGIN
 IF TG_TABLE_NAME='payment_allocations' THEN
  SELECT order_id INTO _order_id FROM public.payments WHERE id=NEW.payment_id;
 ELSE
  IF NEW.reference_type='order' THEN
   SELECT id INTO _order_id FROM public.orders WHERE id::text=NEW.reference_id;
  ELSIF NEW.reference_type='payment' THEN
   SELECT order_id INTO _order_id FROM public.payments WHERE id::text=NEW.reference_id;
  END IF;
 END IF;
 IF _order_id IS NOT NULL THEN
  SELECT status INTO _status FROM public.orders WHERE id=_order_id FOR UPDATE;
  IF _status='cancelled' THEN RAISE EXCEPTION 'ORDER_FINANCIAL_BLOCK'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_cancelled_order_allocation BEFORE INSERT ON public.payment_allocations
 FOR EACH ROW EXECUTE FUNCTION public.guard_cancelled_order_financial_reference();
CREATE TRIGGER guard_cancelled_order_ledger BEFORE INSERT ON public.ledger_entries
 FOR EACH ROW EXECUTE FUNCTION public.guard_cancelled_order_financial_reference();
REVOKE ALL ON FUNCTION public.guard_cancelled_order_financial_reference() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.cancel_order(uuid,public.order_status,text),public.admin_order_cancellation_context(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cancel_order(uuid,public.order_status,text),public.admin_order_cancellation_context(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.order_cancellation_block(public.order_status,public.payment_status,public.order_fulfillment_status[],public.payment_status[],boolean) FROM PUBLIC,anon,authenticated;
