-- Payments are individual attempts. Orders remain the commercial record and
-- financial allocation/payout work remains intentionally outside this flow.
ALTER TYPE public.payment_status ADD VALUE IF NOT EXISTS 'processing';
ALTER TYPE public.payment_status ADD VALUE IF NOT EXISTS 'expired';

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES public.orders(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS buyer_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS failure_code text,
  ADD COLUMN IF NOT EXISTS failure_message text,
  ADD COLUMN IF NOT EXISTS provider_metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(provider_metadata) = 'object');

CREATE INDEX IF NOT EXISTS payments_order_created_idx ON public.payments(order_id, created_at DESC)
  WHERE order_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS payments_buyer_order_idempotency_idx
  ON public.payments(buyer_user_id, order_id, idempotency_key)
  WHERE buyer_user_id IS NOT NULL AND order_id IS NOT NULL AND idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS payments_one_paid_order_idx
  ON public.payments(order_id)
  WHERE order_id IS NOT NULL AND status = 'paid';

CREATE TABLE IF NOT EXISTS public.payment_provider_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE RESTRICT,
  provider text NOT NULL CHECK (provider ~ '^[a-z0-9_-]{2,50}$'),
  provider_event_id text NOT NULL CHECK (length(provider_event_id) BETWEEN 1 AND 160),
  event_type text NOT NULL CHECK (length(event_type) BETWEEN 1 AND 100),
  status_before public.payment_status,
  status_after public.payment_status,
  safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(safe_metadata) = 'object'),
  processing_error_code text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider, provider_event_id)
);
CREATE INDEX IF NOT EXISTS payment_provider_events_payment_idx
  ON public.payment_provider_events(payment_id, received_at DESC);

ALTER TABLE public.payment_provider_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payment provider events platform read" ON public.payment_provider_events
  FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "payments admin" ON public.payments;
DROP POLICY IF EXISTS "payments admin upd" ON public.payments;
CREATE POLICY "payments buyer read" ON public.payments FOR SELECT TO authenticated
USING (
  buyer_user_id = auth.uid()
  OR public.is_platform_admin(auth.uid())
  OR (organization_id IS NOT NULL AND public.has_org_permission(auth.uid(), organization_id, 'finance.read'))
);

CREATE OR REPLACE FUNCTION public.payment_transition_allowed(
  _from public.payment_status,
  _to public.payment_status
) RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT _from = _to OR CASE _from
    WHEN 'pending' THEN _to IN ('processing', 'authorized', 'paid', 'failed', 'cancelled', 'expired')
    WHEN 'processing' THEN _to IN ('authorized', 'paid', 'failed', 'cancelled', 'expired')
    WHEN 'authorized' THEN _to IN ('paid', 'failed', 'cancelled', 'expired')
    WHEN 'paid' THEN _to IN ('refunded', 'partially_refunded', 'chargeback')
    ELSE false
  END
$$;

CREATE OR REPLACE FUNCTION public.create_order_payment(
  _order_id uuid,
  _method text,
  _idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _buyer uuid := auth.uid();
  _order public.orders%ROWTYPE;
  _payment public.payments%ROWTYPE;
  _existing uuid;
  _normalized_method text := lower(btrim(_method));
BEGIN
  IF _buyer IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED_PAYMENT'; END IF;
  IF _order_id IS NULL OR nullif(btrim(_idempotency_key), '') IS NULL THEN
    RAISE EXCEPTION 'PAYMENT_IDEMPOTENCY_CONFLICT';
  END IF;
  IF _normalized_method NOT IN ('pix', 'card') THEN RAISE EXCEPTION 'PAYMENT_METHOD_UNSUPPORTED'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('payment:' || _order_id::text, 0));
  SELECT * INTO _order
  FROM public.orders
  WHERE id = _order_id AND buyer_user_id = _buyer
  FOR UPDATE;
  IF _order.id IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED_PAYMENT'; END IF;

  SELECT id INTO _existing
  FROM public.payments
  WHERE buyer_user_id = _buyer AND order_id = _order_id AND idempotency_key = _idempotency_key;
  IF _existing IS NOT NULL THEN
    RETURN jsonb_build_object('payment_id', _existing, 'idempotent', true);
  END IF;
  IF _order.status <> 'pending_payment' OR _order.payment_status = 'paid' OR _order.total_amount <= 0 THEN
    RAISE EXCEPTION 'ORDER_NOT_PAYABLE';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.payments
    WHERE order_id = _order_id AND status IN ('pending', 'processing', 'authorized')
  ) THEN RAISE EXCEPTION 'PAYMENT_IN_PROGRESS'; END IF;
  IF EXISTS (SELECT 1 FROM public.payments WHERE order_id = _order_id AND status = 'paid') THEN
    RAISE EXCEPTION 'PAYMENT_ALREADY_PAID';
  END IF;

  INSERT INTO public.payments(
    organization_id, order_id, buyer_user_id, amount, currency, status, method,
    reference_type, reference_id, idempotency_key
  ) VALUES (
    _order.organization_id, _order.id, _buyer, _order.total_amount, _order.currency,
    'pending', _normalized_method, 'order', _order.id::text, _idempotency_key
  ) RETURNING * INTO _payment;

  RETURN jsonb_build_object(
    'payment_id', _payment.id,
    'order_id', _payment.order_id,
    'amount', _payment.amount::text,
    'currency', _payment.currency,
    'status', _payment.status,
    'idempotent', false
  );
EXCEPTION WHEN unique_violation THEN
  SELECT id INTO _existing
  FROM public.payments
  WHERE buyer_user_id = _buyer AND order_id = _order_id AND idempotency_key = _idempotency_key;
  IF _existing IS NOT NULL THEN
    RETURN jsonb_build_object('payment_id', _existing, 'idempotent', true);
  END IF;
  RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.process_payment_provider_event(
  _provider text,
  _provider_event_id text,
  _event_type text,
  _payment_id uuid,
  _mapped_status public.payment_status,
  _provider_payment_id text DEFAULT NULL,
  _failure_code text DEFAULT NULL,
  _safe_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _payment public.payments%ROWTYPE;
  _order public.orders%ROWTYPE;
  _event_id uuid;
  _existing_event_payment_id uuid;
  _normalized_provider text := lower(btrim(_provider));
BEGIN
  -- Real gateway adapters must authenticate and verify their webhook before
  -- calling this function. Until an adapter exists this operation is platform-only.
  IF NOT public.is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'UNAUTHORIZED_PAYMENT'; END IF;
  IF _payment_id IS NULL OR _normalized_provider !~ '^[a-z0-9_-]{2,50}$'
     OR nullif(btrim(_provider_event_id), '') IS NULL
     OR nullif(btrim(_event_type), '') IS NULL
     OR jsonb_typeof(_safe_metadata) <> 'object'
     OR _safe_metadata ?| ARRAY['cvv', 'pan', 'card_number', 'token', 'secret', 'signature'] THEN
    RAISE EXCEPTION 'PROVIDER_EVENT_INVALID';
  END IF;

  SELECT * INTO _payment FROM public.payments WHERE id = _payment_id FOR UPDATE;
  IF _payment.id IS NULL THEN RAISE EXCEPTION 'PAYMENT_NOT_FOUND'; END IF;
  IF _payment.provider IS NOT NULL AND _payment.provider <> _normalized_provider THEN
    RAISE EXCEPTION 'PROVIDER_EVENT_INVALID';
  END IF;

  INSERT INTO public.payment_provider_events(
    payment_id, provider, provider_event_id, event_type, status_before, safe_metadata
  ) VALUES (
    _payment.id, _normalized_provider, btrim(_provider_event_id), btrim(_event_type), _payment.status, _safe_metadata
  ) ON CONFLICT (provider, provider_event_id) DO NOTHING
  RETURNING id INTO _event_id;
  IF _event_id IS NULL THEN
    SELECT payment_id INTO _existing_event_payment_id
    FROM public.payment_provider_events
    WHERE provider = _normalized_provider AND provider_event_id = btrim(_provider_event_id);
    IF _existing_event_payment_id IS DISTINCT FROM _payment.id THEN
      RAISE EXCEPTION 'PROVIDER_EVENT_INVALID';
    END IF;
    RETURN jsonb_build_object('payment_id', _payment.id, 'idempotent', true, 'changed', false);
  END IF;

  IF NOT public.payment_transition_allowed(_payment.status, _mapped_status) THEN
    UPDATE public.payment_provider_events
    SET processing_error_code = 'PAYMENT_INVALID_TRANSITION', processed_at = now()
    WHERE id = _event_id;
    RETURN jsonb_build_object('payment_id', _payment.id, 'idempotent', false, 'changed', false);
  END IF;

  IF _mapped_status = 'paid' THEN
    SELECT * INTO _order FROM public.orders WHERE id = _payment.order_id FOR UPDATE;
    IF _order.id IS NULL OR _order.status = 'cancelled' THEN RAISE EXCEPTION 'ORDER_NOT_PAYABLE'; END IF;
    IF EXISTS (
      SELECT 1 FROM public.payments
      WHERE order_id = _order.id AND status = 'paid' AND id <> _payment.id
    ) THEN RAISE EXCEPTION 'PAYMENT_ALREADY_PAID'; END IF;
  END IF;

  UPDATE public.payments
  SET provider = _normalized_provider,
      provider_payment_id = coalesce(nullif(btrim(_provider_payment_id), ''), provider_payment_id),
      status = _mapped_status,
      paid_at = CASE WHEN _mapped_status = 'paid' THEN coalesce(paid_at, now()) ELSE paid_at END,
      failure_code = CASE WHEN _mapped_status IN ('failed', 'cancelled', 'expired')
        AND coalesce(_failure_code, '') ~ '^[A-Z0-9_]{1,80}$' THEN _failure_code ELSE NULL END,
      failure_message = CASE
        WHEN _mapped_status = 'failed' THEN 'Não foi possível confirmar o pagamento.'
        WHEN _mapped_status = 'cancelled' THEN 'A tentativa de pagamento foi cancelada.'
        WHEN _mapped_status = 'expired' THEN 'A tentativa de pagamento expirou.'
        ELSE NULL
      END,
      provider_metadata = _safe_metadata
  WHERE id = _payment.id;

  IF _mapped_status = 'paid' THEN
    UPDATE public.orders
    SET status = 'paid', payment_status = 'paid'
    WHERE id = _order.id;
  END IF;
  UPDATE public.payment_provider_events
  SET status_after = _mapped_status, processed_at = now()
  WHERE id = _event_id;
  RETURN jsonb_build_object('payment_id', _payment.id, 'idempotent', false, 'changed', true, 'status', _mapped_status);
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
    'payments',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'status',p.status,'provider',p.provider,'method',p.method,'amount',p.amount::text,'provider_payment_id',p.provider_payment_id,'failure_code',p.failure_code,'failure_message',p.failure_message,'paid_at',p.paid_at,'created_at',p.created_at,'updated_at',p.updated_at) ORDER BY p.created_at DESC),'[]'::jsonb) FROM public.payments p WHERE p.order_id=_order_id),
    'activity',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id::text,'action',a.action,'entity_type',a.entity_type,'actor_name',pr.full_name,'occurred_at',a.occurred_at) ORDER BY a.occurred_at DESC),'[]'::jsonb) FROM public.audit_logs a LEFT JOIN public.profiles pr ON pr.id=a.actor_id WHERE (a.entity_type='orders' AND a.entity_id=_order_id::text) OR (a.entity_type='order_items' AND a.entity_id IN (SELECT id::text FROM public.order_items WHERE order_id=_order_id)) OR (a.entity_type='payments' AND a.after_data->>'order_id'=_order_id::text))
  ) END;
$$;

DROP TRIGGER IF EXISTS audit_payment_provider_events ON public.payment_provider_events;
CREATE TRIGGER audit_payment_provider_events
AFTER INSERT OR UPDATE ON public.payment_provider_events
FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

REVOKE ALL ON FUNCTION public.create_order_payment(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_payment_provider_event(text, text, text, uuid, public.payment_status, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_order_payment(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_payment_provider_event(text, text, text, uuid, public.payment_status, text, text, jsonb) TO authenticated;
