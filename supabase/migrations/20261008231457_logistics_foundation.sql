-- Preparation only: no provider quote, label, tracking, delivery or inventory writes.
CREATE TABLE public.shipping_methods (
 id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
 code text PRIMARY KEY CHECK(code ~ '^[a-z][a-z0-9_]{1,49}$'),
 label text NOT NULL CHECK(length(label) BETWEEN 2 AND 100),
 active boolean NOT NULL DEFAULT true
);
INSERT INTO public.shipping_methods(code,label) VALUES
 ('carrier','Transportadora'),('provider_postal','Correios via provider'),
 ('pickup','Retirada'),('own_delivery','Entrega própria'),('other','Outra modalidade');
CREATE TABLE public.shipments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 order_id uuid NOT NULL REFERENCES public.orders(id),
 fulfillment_id uuid NOT NULL UNIQUE,
 FOREIGN KEY(fulfillment_id,order_id) REFERENCES public.order_fulfillments(id,order_id),
 fulfillment_owner_organization_id uuid NOT NULL REFERENCES public.organizations(id),
 stock_owner_organization_id uuid REFERENCES public.organizations(id),
 supplier_organization_id uuid REFERENCES public.organizations(id),
 seller_organization_id uuid REFERENCES public.organizations(id),
 recipient_snapshot jsonb,
 origin_snapshot jsonb,
 origin_confirmed_by uuid REFERENCES auth.users(id), origin_confirmed_at timestamptz,
 method_code text REFERENCES public.shipping_methods(code),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','ready_for_quote')),
 version integer NOT NULL DEFAULT 0 CHECK(version>=0), configuration_fingerprint text,
 created_by uuid NOT NULL REFERENCES auth.users(id), updated_by uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX shipments_order_idx ON public.shipments(order_id);
-- Each row may describe identical volumes. Item quantities are PER VOLUME.
-- All revisions remain available for audit; no package history is deleted on editing.
CREATE TABLE public.shipment_packages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), shipment_id uuid NOT NULL REFERENCES public.shipments(id),
 revision integer NOT NULL CHECK(revision>0), position integer NOT NULL CHECK(position>0),
 quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 100),
 weight numeric(10,3) NOT NULL CHECK(weight>0 AND weight<=1000), weight_unit text NOT NULL DEFAULT 'kg' CHECK(weight_unit='kg'),
 length numeric(10,2) NOT NULL CHECK(length>0 AND length<=1000),
 width numeric(10,2) NOT NULL CHECK(width>0 AND width<=1000),
 height numeric(10,2) NOT NULL CHECK(height>0 AND height<=1000), dimension_unit text NOT NULL DEFAULT 'cm' CHECK(dimension_unit='cm'),
 measured_by uuid NOT NULL REFERENCES auth.users(id), measured_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(shipment_id,revision,position)
);
CREATE TABLE public.shipment_package_items (
 id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
 package_id uuid NOT NULL REFERENCES public.shipment_packages(id),
 order_item_id uuid NOT NULL REFERENCES public.order_items(id),
 quantity integer NOT NULL CHECK(quantity>0), PRIMARY KEY(package_id,order_item_id)
);
ALTER TABLE public.shipping_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipment_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipment_package_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.shipping_methods,public.shipments,public.shipment_packages,public.shipment_package_items FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.shipping_methods,public.shipments,public.shipment_packages,public.shipment_package_items TO authenticated;
CREATE POLICY "shipping methods platform" ON public.shipping_methods FOR SELECT TO authenticated USING(public.is_platform_admin(auth.uid()));
CREATE POLICY "shipments platform" ON public.shipments FOR SELECT TO authenticated USING(public.is_platform_admin(auth.uid()));
CREATE POLICY "packages platform" ON public.shipment_packages FOR SELECT TO authenticated USING(public.is_platform_admin(auth.uid()));
CREATE POLICY "package items platform" ON public.shipment_package_items FOR SELECT TO authenticated USING(public.is_platform_admin(auth.uid()));
CREATE TRIGGER audit_shipments AFTER INSERT OR UPDATE ON public.shipments FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
CREATE TRIGGER audit_shipment_packages AFTER INSERT ON public.shipment_packages FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
CREATE TRIGGER audit_shipment_package_items AFTER INSERT ON public.shipment_package_items FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

CREATE FUNCTION public.shipping_address_complete(_address jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $$
 SELECT coalesce(jsonb_typeof(_address)='object'
  AND length(btrim(_address->>'recipient')) BETWEEN 1 AND 200
  AND (_address->>'postal_code') ~ '^[0-9]{8}$'
  AND length(btrim(_address->>'street')) BETWEEN 1 AND 200
  AND length(btrim(_address->>'number')) BETWEEN 1 AND 30
  AND length(btrim(_address->>'district')) BETWEEN 1 AND 100
  AND length(btrim(_address->>'city')) BETWEEN 1 AND 100
  AND (_address->>'state') ~ '^[A-Z]{2}$'
  AND (_address->>'country')='BR',false)
$$;
CREATE FUNCTION public.shipping_transition_allowed(_from text,_to text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $$
 SELECT coalesce((_from=_to AND _from IN ('draft','ready_for_quote'))
  OR (_from='draft' AND _to='ready_for_quote') OR (_from='ready_for_quote' AND _to='draft'),false)
$$;
CREATE FUNCTION public.guard_shipping_write()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_OP='DELETE' OR (TG_TABLE_NAME IN ('shipment_packages','shipment_package_items') AND TG_OP='UPDATE')
 THEN RAISE EXCEPTION 'SHIPPING_HISTORY_IMMUTABLE'; END IF;
 IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid())
  OR current_setting('bemmais.shipping_write',true) IS DISTINCT FROM 'allowed'
 THEN RAISE EXCEPTION 'SHIPPING_RPC_REQUIRED'; END IF;
 IF TG_TABLE_NAME='shipment_package_items' THEN
  IF NOT EXISTS(SELECT 1 FROM public.shipment_packages p
   JOIN public.shipments s ON s.id=p.shipment_id JOIN public.order_items oi ON oi.fulfillment_id=s.fulfillment_id
   WHERE p.id=NEW.package_id AND oi.id=NEW.order_item_id) THEN RAISE EXCEPTION 'PACKAGE_ITEM_INVALID'; END IF;
 END IF;
 IF TG_TABLE_NAME='shipments' AND TG_OP='UPDATE' THEN
  IF (to_jsonb(NEW)-ARRAY['origin_snapshot','origin_confirmed_by','origin_confirmed_at','method_code','status','version',
   'configuration_fingerprint','updated_by','updated_at']) IS DISTINCT FROM
   (to_jsonb(OLD)-ARRAY['origin_snapshot','origin_confirmed_by','origin_confirmed_at','method_code','status','version',
   'configuration_fingerprint','updated_by','updated_at'])
   OR NOT public.shipping_transition_allowed(OLD.status,NEW.status)
  THEN RAISE EXCEPTION 'SHIPMENT_IMMUTABLE'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_shipping_write BEFORE INSERT OR UPDATE OR DELETE ON public.shipments FOR EACH ROW EXECUTE FUNCTION public.guard_shipping_write();
CREATE TRIGGER guard_package_write BEFORE INSERT OR UPDATE OR DELETE ON public.shipment_packages FOR EACH ROW EXECUTE FUNCTION public.guard_shipping_write();
CREATE TRIGGER guard_package_item_write BEFORE INSERT OR UPDATE OR DELETE ON public.shipment_package_items FOR EACH ROW EXECUTE FUNCTION public.guard_shipping_write();
CREATE TRIGGER shipping_methods_audit AFTER INSERT OR UPDATE ON public.shipping_methods FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

CREATE FUNCTION public.prepare_fulfillment_shipment(_fulfillment_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE _oid uuid; _f public.order_fulfillments%ROWTYPE; _s uuid; _block text; _address jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 SELECT order_id INTO _oid FROM public.order_fulfillments WHERE id=_fulfillment_id;
 SELECT shipping_address INTO _address FROM public.orders WHERE id=_oid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'FULFILLMENT_NOT_FOUND'; END IF;
 PERFORM id FROM public.payments WHERE order_id=_oid ORDER BY id FOR UPDATE;
 PERFORM id FROM public.order_items WHERE order_id=_oid ORDER BY id FOR UPDATE;
 SELECT * INTO _f FROM public.order_fulfillments WHERE id=_fulfillment_id FOR UPDATE;
 _block:=public.order_fulfillment_block(_oid);
 IF _block IS NOT NULL THEN RAISE EXCEPTION '%',_block; END IF;
 IF _f.status<>'ready_to_ship' OR _f.stock_consumed_at IS NULL OR _f.fulfillment_owner_organization_id IS NULL
  OR NOT EXISTS(SELECT 1 FROM public.order_items WHERE fulfillment_id=_f.id)
 THEN RAISE EXCEPTION 'FULFILLMENT_NOT_READY'; END IF;
 SELECT id INTO _s FROM public.shipments WHERE fulfillment_id=_f.id;
 IF FOUND THEN RETURN jsonb_build_object('shipment_id',_s,'idempotent',true); END IF;
 PERFORM set_config('bemmais.shipping_write','allowed',true);
 INSERT INTO public.shipments(order_id,fulfillment_id,fulfillment_owner_organization_id,stock_owner_organization_id,
  supplier_organization_id,seller_organization_id,recipient_snapshot,created_by,updated_by)
 VALUES(_oid,_f.id,_f.fulfillment_owner_organization_id,_f.stock_owner_organization_id,_f.supplier_organization_id,
  _f.seller_organization_id,_address,auth.uid(),auth.uid()) RETURNING id INTO _s;
 PERFORM set_config('bemmais.shipping_write','',true);
 RETURN jsonb_build_object('shipment_id',_s,'idempotent',false);
END $$;

CREATE FUNCTION public.configure_shipment(_shipment_id uuid,_expected_version integer,_method text,_origin jsonb,_origin_confirmed boolean,_packages jsonb)
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
 IF _origin IS NOT NULL THEN
  IF NOT coalesce(_origin_confirmed,false) OR NOT public.shipping_address_complete(_origin)
  THEN RAISE EXCEPTION 'SHIPPING_ORIGIN_INVALID'; END IF;
  SELECT jsonb_object_agg(key,value) INTO _origin_safe FROM jsonb_each(_origin)
   WHERE key IN ('recipient','postal_code','street','number','complement','district','city','state','country')
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
  AND public.shipping_address_complete(_s.recipient_snapshot) THEN 'ready_for_quote' ELSE 'draft' END;
 UPDATE public.shipments SET origin_snapshot=_origin_safe,origin_confirmed_by=CASE WHEN _origin_safe IS NOT NULL THEN auth.uid() END,
  origin_confirmed_at=CASE WHEN _origin_safe IS NOT NULL THEN now() END,method_code=_method,status=_status,version=_version,
  configuration_fingerprint=_fingerprint,updated_by=auth.uid(),updated_at=now() WHERE id=_s.id;
 PERFORM set_config('bemmais.shipping_write','',true);
 RETURN jsonb_build_object('shipment_id',_s.id,'version',_version,'idempotent',false);
END $$;

CREATE FUNCTION public.admin_order_logistics(_order_id uuid)
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
  'supplier',supplier.name,'seller',seller.name,'stock_owner',stock.name,'recipient',s.recipient_snapshot,'origin',s.origin_snapshot,
  'method',s.method_code,'status',s.status,'version',s.version,'updated_at',s.updated_at,
  'items',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',oi.id,'name',oi.product_name_snapshot,'sku',oi.sku_snapshot,'quantity',oi.quantity) ORDER BY oi.id),'[]') FROM public.order_items oi WHERE oi.fulfillment_id=s.fulfillment_id),
  'packages',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'quantity',p.quantity,'weight',p.weight::text,'length',p.length::text,'width',p.width::text,'height',p.height::text,
   'weight_unit',p.weight_unit,'dimension_unit',p.dimension_unit,'measured_at',p.measured_at,
   'items',(SELECT coalesce(jsonb_agg(jsonb_build_object('order_item_id',pi.order_item_id,'quantity',pi.quantity) ORDER BY pi.order_item_id),'[]') FROM public.shipment_package_items pi WHERE pi.package_id=p.id)) ORDER BY p.position),'[]')
    FROM public.shipment_packages p WHERE p.shipment_id=s.id AND p.revision=s.version),
  'pending',to_jsonb(array_remove(ARRAY[
   CASE WHEN s.origin_snapshot IS NULL THEN 'ORIGIN_MISSING' END,
   CASE WHEN NOT public.shipping_address_complete(s.recipient_snapshot) THEN 'RECIPIENT_INCOMPLETE' END,
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
CREATE FUNCTION public.configure_shipping_method(_code text,_label text,_active boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 IF _code IS NULL OR _code !~ '^[a-z][a-z0-9_]{1,49}$' OR _label IS NULL OR length(btrim(_label)) NOT BETWEEN 2 AND 100 OR _active IS NULL
 THEN RAISE EXCEPTION 'SHIPPING_METHOD_INVALID'; END IF;
 INSERT INTO public.shipping_methods(code,label,active) VALUES(_code,btrim(_label),_active)
 ON CONFLICT(code) DO UPDATE SET label=EXCLUDED.label,active=EXCLUDED.active;
END $$;
REVOKE ALL ON FUNCTION public.configure_shipping_method(text,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.configure_shipping_method(text,text,boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.guard_shipping_write() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.prepare_fulfillment_shipment(uuid),public.configure_shipment(uuid,integer,text,jsonb,boolean,jsonb),public.admin_order_logistics(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.prepare_fulfillment_shipment(uuid),public.configure_shipment(uuid,integer,text,jsonb,boolean,jsonb),public.admin_order_logistics(uuid) TO authenticated;
