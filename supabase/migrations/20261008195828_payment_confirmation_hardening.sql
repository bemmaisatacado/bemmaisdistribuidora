-- No browser/admin can confirm payment. Only a verified backend adapter may
-- use the service-only confirmation boundary. No adapter is enabled today.
REVOKE ALL ON FUNCTION public.process_payment_provider_event(text,text,text,uuid,public.payment_status,text,text,jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.sanitize_payment_metadata(_value jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT coalesce(jsonb_object_agg(lower(key), value), '{}'::jsonb)
  FROM jsonb_each(CASE WHEN jsonb_typeof(_value)='object' THEN _value ELSE '{}'::jsonb END)
  WHERE (lower(key)='event' AND jsonb_typeof(value)='string'
    AND (value #>> '{}') IN ('pending','processing','authorized','paid','failed','cancelled','expired'))
    OR (lower(key)='reason_code' AND jsonb_typeof(value)='string'
    AND (value #>> '{}') IN ('PROVIDER_EVENT_INVALID','PAYMENT_FAILED','PAYMENT_CANCELLED','PAYMENT_EXPIRED'))
    OR (lower(key)='retry' AND jsonb_typeof(value)='number'
      AND CASE WHEN value::text ~ '^[0-9]{1,3}$' THEN (value::text)::numeric <= 100 ELSE false END)
$$;

-- Fixed scalar allowlist excludes secrets at every depth (arrays/objects omitted).
UPDATE public.payments SET provider_metadata=public.sanitize_payment_metadata(provider_metadata)
 WHERE provider_metadata IS DISTINCT FROM public.sanitize_payment_metadata(provider_metadata);
UPDATE public.payment_provider_events SET safe_metadata=public.sanitize_payment_metadata(safe_metadata)
 WHERE safe_metadata IS DISTINCT FROM public.sanitize_payment_metadata(safe_metadata);
ALTER TABLE public.payments ADD CONSTRAINT payments_safe_metadata
 CHECK (provider_metadata=public.sanitize_payment_metadata(provider_metadata));
ALTER TABLE public.payment_provider_events ADD CONSTRAINT provider_events_safe_metadata
 CHECK (safe_metadata=public.sanitize_payment_metadata(safe_metadata));
-- Historical/provider free text must not reach the Order 360 DTO either.
UPDATE public.payments SET
 failure_code=CASE status WHEN 'failed' THEN 'PAYMENT_FAILED' WHEN 'expired' THEN 'PAYMENT_EXPIRED'
   WHEN 'cancelled' THEN 'PAYMENT_CANCELLED' ELSE NULL END,
 failure_message=CASE status WHEN 'failed' THEN 'Não foi possível confirmar o pagamento.'
   WHEN 'expired' THEN 'A tentativa de pagamento expirou.'
   WHEN 'cancelled' THEN 'A tentativa de pagamento foi cancelada.' ELSE NULL END;
ALTER TABLE public.payments ADD CONSTRAINT payments_safe_failure
 CHECK ((failure_code IS NULL OR failure_code IN ('PAYMENT_FAILED','PAYMENT_EXPIRED','PAYMENT_CANCELLED'))
  AND (failure_message IS NULL OR failure_message IN ('Não foi possível confirmar o pagamento.',
    'A tentativa de pagamento expirou.','A tentativa de pagamento foi cancelada.')));

-- A key identifies one intention across buyers/orders; existing conflicts require
-- manual review rather than silently merging/deleting historical attempts.
CREATE UNIQUE INDEX payments_intention_key_idx ON public.payments(btrim(idempotency_key))
 WHERE idempotency_key IS NOT NULL;
ALTER TABLE public.payment_provider_events
 ADD COLUMN verified_amount numeric(12,2), ADD COLUMN verified_currency text;

CREATE OR REPLACE FUNCTION public.create_order_payment(_order_id uuid,_method text,_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
 _buyer uuid:=auth.uid(); _order public.orders%ROWTYPE; _payment public.payments%ROWTYPE;
 _method_key text:=lower(btrim(_method)); _key text:=btrim(_idempotency_key);
BEGIN
 IF _buyer IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED_PAYMENT'; END IF;
 IF _order_id IS NULL OR _key IS NULL OR length(_key) NOT BETWEEN 1 AND 160 THEN
  RAISE EXCEPTION 'PAYMENT_IDEMPOTENCY_CONFLICT'; END IF;
 IF _method_key IS NULL OR _method_key NOT IN ('pix','card') THEN RAISE EXCEPTION 'PAYMENT_METHOD_UNSUPPORTED'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('payment-key:'||_key,0));
 SELECT * INTO _payment FROM public.payments WHERE btrim(idempotency_key)=_key;
 IF _payment.id IS NOT NULL AND (_payment.buyer_user_id IS DISTINCT FROM _buyer OR _payment.order_id IS DISTINCT FROM _order_id) THEN
  RAISE EXCEPTION 'PAYMENT_IDEMPOTENCY_CONFLICT'; END IF;
 -- Lock order before payment in all payment operations.
 SELECT * INTO _order FROM public.orders WHERE id=_order_id AND buyer_user_id=_buyer FOR UPDATE;
 IF _order.id IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED_PAYMENT'; END IF;
 IF _payment.id IS NOT NULL THEN
  IF _payment.method IS DISTINCT FROM _method_key OR _payment.currency IS DISTINCT FROM _order.currency::text
    OR _payment.amount IS DISTINCT FROM _order.total_amount THEN RAISE EXCEPTION 'PAYMENT_IDEMPOTENCY_CONFLICT'; END IF;
  RETURN jsonb_build_object('payment_id',_payment.id,'idempotent',true);
 END IF;
 IF _order.status<>'pending_payment' OR _order.payment_status='paid' OR _order.total_amount<=0 THEN
  RAISE EXCEPTION 'ORDER_NOT_PAYABLE'; END IF;
 IF EXISTS(SELECT 1 FROM public.payments WHERE order_id=_order_id AND status IN ('pending','processing','authorized')) THEN
  RAISE EXCEPTION 'PAYMENT_IN_PROGRESS'; END IF;
 -- Enablement requires a real backend adapter; do not manufacture a charge.
 RAISE EXCEPTION 'PAYMENT_PROVIDER_UNAVAILABLE';
END $$;

CREATE OR REPLACE FUNCTION public.confirm_verified_payment_event(
 _provider text,_provider_event_id text,_event_type text,_payment_id uuid,
 _provider_payment_id text,_amount numeric,_currency text,_mapped_status public.payment_status,
 _safe_metadata jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
 _order_id uuid; _order public.orders%ROWTYPE; _payment public.payments%ROWTYPE;
 _event public.payment_provider_events%ROWTYPE; _event_id uuid;
BEGIN
 IF coalesce(current_setting('request.jwt.claims',true),'{}')::jsonb->>'role' IS DISTINCT FROM 'service_role' THEN
  RAISE EXCEPTION 'UNAUTHORIZED_PAYMENT'; END IF;
 IF _provider IS NULL OR _provider !~ '^[a-z0-9_-]{2,50}$' OR _payment_id IS NULL
  OR _provider_event_id IS NULL OR length(_provider_event_id) NOT BETWEEN 1 AND 160
  OR _event_type IS NULL OR length(_event_type) NOT BETWEEN 1 AND 100
  OR _provider_payment_id IS NULL OR length(_provider_payment_id) NOT BETWEEN 1 AND 160
  OR _amount IS NULL OR _amount<=0 OR _currency IS NULL OR _currency !~ '^[A-Z]{3}$'
  OR _mapped_status IS NULL OR _mapped_status NOT IN ('processing','authorized','paid','failed','cancelled','expired') THEN
  RAISE EXCEPTION 'PROVIDER_EVENT_INVALID'; END IF;
 -- Serialize event identity, then order, then payment. Same order cannot be paid twice.
 PERFORM pg_advisory_xact_lock(hashtextextended('provider-event:'||_provider||':'||_provider_event_id,0));
 SELECT order_id INTO _order_id FROM public.payments WHERE id=_payment_id;
 SELECT * INTO _order FROM public.orders WHERE id=_order_id FOR UPDATE;
 SELECT * INTO _payment FROM public.payments WHERE id=_payment_id FOR UPDATE;
 IF _payment.id IS NULL THEN RAISE EXCEPTION 'PAYMENT_NOT_FOUND'; END IF;
 IF _order.id IS NULL OR _payment.provider IS DISTINCT FROM _provider
  OR _payment.provider_payment_id IS DISTINCT FROM _provider_payment_id
  OR _payment.amount IS DISTINCT FROM _amount OR _payment.currency IS DISTINCT FROM _currency
  OR _order.total_amount IS DISTINCT FROM _amount OR _order.currency::text IS DISTINCT FROM _currency THEN
  RAISE EXCEPTION 'PROVIDER_EVENT_INVALID'; END IF;
 SELECT * INTO _event FROM public.payment_provider_events WHERE provider=_provider AND provider_event_id=_provider_event_id;
 IF _event.id IS NOT NULL THEN
  IF _event.payment_id IS DISTINCT FROM _payment_id OR _event.event_type IS DISTINCT FROM _event_type
    OR _event.verified_amount IS DISTINCT FROM _amount OR _event.verified_currency IS DISTINCT FROM _currency
    OR coalesce(_event.status_after,_event.status_before) IS DISTINCT FROM _mapped_status THEN
    RAISE EXCEPTION 'PROVIDER_EVENT_INVALID'; END IF;
  RETURN jsonb_build_object('payment_id',_payment_id,'idempotent',true,'changed',false);
 END IF;
 IF NOT public.payment_transition_allowed(_payment.status,_mapped_status) THEN
  RAISE EXCEPTION 'PAYMENT_INVALID_TRANSITION'; END IF;
 IF _mapped_status='paid' THEN
  IF _order.status NOT IN ('pending_payment','paid') THEN RAISE EXCEPTION 'ORDER_NOT_PAYABLE'; END IF;
  IF EXISTS(SELECT 1 FROM public.payments WHERE order_id=_order.id AND status='paid' AND id<>_payment.id) THEN
   RAISE EXCEPTION 'PAYMENT_ALREADY_PAID'; END IF;
 END IF;
 INSERT INTO public.payment_provider_events(payment_id,provider,provider_event_id,event_type,status_before,status_after,
   safe_metadata,verified_amount,verified_currency,processed_at)
 VALUES(_payment_id,_provider,_provider_event_id,_event_type,_payment.status,_mapped_status,
   public.sanitize_payment_metadata(_safe_metadata),_amount,_currency,now()) RETURNING id INTO _event_id;
 UPDATE public.payments SET status=_mapped_status,
  paid_at=CASE WHEN _mapped_status='paid' THEN coalesce(paid_at,now()) ELSE paid_at END,
  failure_code=CASE WHEN _mapped_status='failed' THEN 'PAYMENT_FAILED' ELSE NULL END,
  failure_message=CASE WHEN _mapped_status='failed' THEN 'Não foi possível confirmar o pagamento.'
   WHEN _mapped_status='expired' THEN 'A tentativa de pagamento expirou.'
   WHEN _mapped_status='cancelled' THEN 'A tentativa de pagamento foi cancelada.' ELSE NULL END,
  provider_metadata=public.sanitize_payment_metadata(_safe_metadata) WHERE id=_payment_id;
 IF _mapped_status='paid' THEN UPDATE public.orders SET status='paid',payment_status='paid' WHERE id=_order.id; END IF;
 -- Inventory and financial ledgers are untouched. Audit triggers record both updates.
 RETURN jsonb_build_object('payment_id',_payment_id,'idempotent',false,'changed',true);
END $$;

CREATE OR REPLACE FUNCTION public.guard_verified_payment_paid()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.status='paid' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
  IF coalesce(current_setting('request.jwt.claims',true),'{}')::jsonb->>'role' IS DISTINCT FROM 'service_role'
    OR NOT EXISTS(SELECT 1 FROM public.payment_provider_events e WHERE e.payment_id=NEW.id
      AND e.status_after='paid' AND e.processed_at IS NOT NULL AND e.verified_amount=NEW.amount
      AND e.verified_currency=NEW.currency AND e.provider=NEW.provider) THEN
    RAISE EXCEPTION 'UNAUTHORIZED_PAYMENT'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_verified_payment_paid BEFORE INSERT OR UPDATE ON public.payments
 FOR EACH ROW EXECUTE FUNCTION public.guard_verified_payment_paid();
CREATE OR REPLACE FUNCTION public.guard_verified_order_paid()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF (NEW.status='paid' OR NEW.payment_status='paid') AND
   (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status OR OLD.payment_status IS DISTINCT FROM NEW.payment_status) THEN
  IF coalesce(current_setting('request.jwt.claims',true),'{}')::jsonb->>'role' IS DISTINCT FROM 'service_role'
    OR NOT EXISTS(SELECT 1 FROM public.payments p WHERE p.order_id=NEW.id AND p.status='paid'
      AND p.amount=NEW.total_amount AND p.currency=NEW.currency::text) THEN RAISE EXCEPTION 'UNAUTHORIZED_PAYMENT'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_verified_order_paid BEFORE INSERT OR UPDATE ON public.orders
 FOR EACH ROW EXECUTE FUNCTION public.guard_verified_order_paid();

REVOKE ALL ON FUNCTION public.confirm_verified_payment_event(text,text,text,uuid,text,numeric,text,public.payment_status,jsonb)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_verified_payment_event(text,text,text,uuid,text,numeric,text,public.payment_status,jsonb) TO service_role;
REVOKE INSERT,UPDATE,DELETE ON public.payments,public.payment_provider_events FROM anon,authenticated;
GRANT SELECT ON public.payment_provider_events TO authenticated;
