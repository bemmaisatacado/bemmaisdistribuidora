-- Domains are recorded now, but DNS provisioning and verification are deferred
-- to the future Cloudflare storefront integration. Never present a guessed target.
UPDATE public.store_domains
SET verification_status = 'pending',
    verification_data = '{}'::jsonb,
    verified_at = NULL,
    last_error = NULL
WHERE type = 'custom_domain';

CREATE OR REPLACE FUNCTION public.guard_store_domain()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  s public.stores;
  platform_suffix constant text := '.bemmaisdistribuidora.com.br';
BEGIN
  SELECT * INTO s FROM public.stores WHERE id = NEW.store_id;
  IF s.id IS NULL THEN
    RAISE EXCEPTION 'Loja não encontrada';
  END IF;

  NEW.organization_id := s.organization_id;
  NEW.hostname := lower(btrim(NEW.hostname));

  IF NEW.hostname !~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$' THEN
    RAISE EXCEPTION 'Domínio inválido';
  END IF;

  IF NEW.type = 'platform_subdomain' THEN
    IF NEW.hostname <> split_part(NEW.hostname, '.', 1) || platform_suffix THEN
      RAISE EXCEPTION 'O subdomínio deve usar o formato {slug}.bemmaisdistribuidora.com.br';
    END IF;
    IF public.is_reserved_slug(split_part(NEW.hostname, '.', 1)) THEN
      RAISE EXCEPTION 'Subdomínio reservado';
    END IF;
  END IF;

  -- Frontend users can register a hostname only. Verification state belongs to
  -- the future infrastructure integration, never to a manual UI action.
  IF TG_OP = 'INSERT' THEN
    NEW.verification_status := 'pending';
    NEW.verified_at := NULL;
  ELSIF NEW.verification_status IS DISTINCT FROM OLD.verification_status AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'A verificação de domínio será realizada pela infraestrutura BemMais';
  END IF;

  IF NEW.type = 'custom_domain' THEN
    NEW.verification_data := '{}'::jsonb;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.hostname IS DISTINCT FROM OLD.hostname THEN
    RAISE EXCEPTION 'Hostname não pode ser alterado';
  END IF;
  RETURN NEW;
END;
$$;

-- Preserve the append-only ledger and reject every new movement that would
-- make stock in hand, reserved, or available stock invalid. The advisory lock
-- serializes competing reservations for the same organization/SKU.
CREATE OR REPLACE FUNCTION public.guard_inventory_movement_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_on_hand integer;
  current_reserved integer;
  next_on_hand integer;
  next_reserved integer;
BEGIN
  IF NEW.quantity IS NULL OR NEW.quantity = 0 THEN
    RAISE EXCEPTION 'A quantidade da movimentação deve ser diferente de zero';
  END IF;

  IF NEW.movement_type IN ('in', 'out', 'reserve', 'release', 'return') AND NEW.quantity < 0 THEN
    RAISE EXCEPTION 'Use quantidade positiva para este tipo de movimentação';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(NEW.organization_id::text || ':' || NEW.variant_id::text, 0)
  );

  SELECT
    COALESCE(SUM(CASE movement_type
      WHEN 'in' THEN quantity WHEN 'return' THEN quantity
      WHEN 'out' THEN -quantity WHEN 'adjust' THEN quantity ELSE 0 END), 0)::integer,
    COALESCE(SUM(CASE movement_type
      WHEN 'reserve' THEN quantity WHEN 'release' THEN -quantity ELSE 0 END), 0)::integer
  INTO current_on_hand, current_reserved
  FROM public.inventory_movements
  WHERE organization_id = NEW.organization_id AND variant_id = NEW.variant_id;

  next_on_hand := current_on_hand + CASE NEW.movement_type
    WHEN 'in' THEN NEW.quantity WHEN 'return' THEN NEW.quantity
    WHEN 'out' THEN -NEW.quantity WHEN 'adjust' THEN NEW.quantity ELSE 0 END;
  next_reserved := current_reserved + CASE NEW.movement_type
    WHEN 'reserve' THEN NEW.quantity WHEN 'release' THEN -NEW.quantity ELSE 0 END;

  IF next_reserved < 0 THEN
    RAISE EXCEPTION 'Não é possível liberar mais estoque do que o saldo reservado';
  END IF;
  IF next_on_hand < 0 OR next_on_hand - next_reserved < 0 THEN
    RAISE EXCEPTION 'Saldo disponível insuficiente para confirmar esta movimentação';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS t_inventory_balance_guard ON public.inventory_movements;
CREATE TRIGGER t_inventory_balance_guard
BEFORE INSERT ON public.inventory_movements
FOR EACH ROW EXECUTE FUNCTION public.guard_inventory_movement_balance();

CREATE OR REPLACE FUNCTION public.admin_ops_queue()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN jsonb_build_object(
    'offers_pending', (SELECT count(*) FROM public.supplier_offers WHERE status = 'pending_review'),
    'products_pending', (SELECT count(*) FROM public.products WHERE status = 'pending_review'),
    'orgs_pending', (SELECT count(*) FROM public.organizations WHERE status = 'pending'),
    'payments_problem', (SELECT count(*) FROM public.payments WHERE status IN ('failed','chargeback')),
    'payouts_pending', (SELECT count(*) FROM public.payouts WHERE status IN ('pending','processing','failed')),
    'accounts_pending', (SELECT count(*) FROM public.payment_accounts WHERE status = 'pending'),
    'suppliers_without_account', (SELECT count(DISTINCT c.organization_id) FROM public.organization_capabilities c
      WHERE c.capability = 'supply_products' AND c.enabled
        AND NOT EXISTS (SELECT 1 FROM public.payment_accounts pa WHERE pa.organization_id = c.organization_id AND pa.status = 'active')),
    'stock_critical', (SELECT count(*) FROM public.inventory_balances WHERE on_hand - reserved <= 0)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_supplier_queues()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE res jsonb;
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT jsonb_build_object(
    'onboarding', coalesce((SELECT jsonb_agg(x) FROM (
      SELECT o.id,o.name FROM public.supplier_relationships r JOIN public.organizations o ON o.id=r.organization_id
      WHERE r.relationship_status='onboarding' ORDER BY r.updated_at LIMIT 50) x),'[]'::jsonb),
    'offers_pending', coalesce((SELECT jsonb_agg(x) FROM (
      SELECT o.id,o.name,p.name AS detail FROM public.supplier_offers s JOIN public.organizations o ON o.id=s.organization_id JOIN public.products p ON p.id=s.product_id
      WHERE s.status='pending_review' ORDER BY s.submitted_at NULLS LAST LIMIT 50) x),'[]'::jsonb),
    'no_payout', coalesce((SELECT jsonb_agg(x) FROM (
      SELECT o.id,o.name FROM public.organizations o WHERE NOT o.is_platform AND public.is_supplier_org(o.id) AND o.status='active'
        AND NOT EXISTS (SELECT 1 FROM public.payment_accounts a WHERE a.organization_id=o.id AND a.status='active') ORDER BY o.name LIMIT 50) x),'[]'::jsonb),
    'stock_zero', coalesce((SELECT jsonb_agg(x) FROM (
      SELECT o.id,o.name,v.sku AS detail FROM public.inventory_balances b JOIN public.organizations o ON o.id=b.organization_id JOIN public.product_variants v ON v.id=b.variant_id
      WHERE public.is_supplier_org(o.id) AND b.on_hand - b.reserved = 0 LIMIT 50) x),'[]'::jsonb),
    'stock_adjustment_required', coalesce((SELECT jsonb_agg(x) FROM (
      SELECT o.id,o.name, v.sku || ' · saldo disponível: ' || (b.on_hand - b.reserved)::text AS detail
      FROM public.inventory_balances b JOIN public.organizations o ON o.id=b.organization_id JOIN public.product_variants v ON v.id=b.variant_id
      WHERE public.is_supplier_org(o.id) AND b.on_hand - b.reserved < 0 LIMIT 50) x),'[]'::jsonb),
    'followups_late', coalesce((SELECT jsonb_agg(x) FROM (
      SELECT o.id,o.name,f.title AS detail FROM public.customer_followups f JOIN public.organizations o ON o.id=f.organization_id
      WHERE public.is_supplier_org(o.id) AND f.status='open' AND f.due_at<current_date
      UNION ALL
      SELECT o.id,o.name,r.next_action FROM public.supplier_relationships r JOIN public.organizations o ON o.id=r.organization_id
      WHERE r.next_action IS NOT NULL AND r.next_action_at<current_date LIMIT 50) x),'[]'::jsonb),
    'incomplete', coalesce((SELECT jsonb_agg(x) FROM (
      SELECT o.id,o.name FROM public.organizations o WHERE NOT o.is_platform AND public.is_supplier_org(o.id)
        AND (o.document IS NULL OR (o.email IS NULL AND o.whatsapp IS NULL) OR NOT EXISTS (SELECT 1 FROM public.supplier_profiles p WHERE p.organization_id=o.id))
      ORDER BY o.created_at LIMIT 50) x),'[]'::jsonb)
  ) INTO res;
  RETURN res;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_inventory_movement_balance() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_store_domain() FROM PUBLIC, anon, authenticated;
