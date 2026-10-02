-- Product Master lifecycle is enforced in the database, not by frontend button visibility.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS rejection_reason text;

CREATE OR REPLACE FUNCTION public.guard_product_lifecycle_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND (OLD.status IS DISTINCT FROM NEW.status OR OLD.rejection_reason IS DISTINCT FROM NEW.rejection_reason)
     AND current_setting('app.product_lifecycle_transition', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'Use a transição operacional de Product Master para alterar o status';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS t_product_lifecycle_guard ON public.products;
CREATE TRIGGER t_product_lifecycle_guard
BEFORE UPDATE OF status, rejection_reason ON public.products
FOR EACH ROW EXECUTE FUNCTION public.guard_product_lifecycle_status();

CREATE OR REPLACE FUNCTION public.transition_product_lifecycle(
  _product_id uuid,
  _expected_status public.catalog_status,
  _target_status public.catalog_status,
  _reason text DEFAULT NULL
)
RETURNS public.catalog_status
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _product public.products%ROWTYPE;
  _active_variant_count integer;
  _invalid_identifier_count integer;
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas a plataforma pode alterar o lifecycle do Product Master';
  END IF;

  SELECT * INTO _product FROM public.products WHERE id = _product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product Master não encontrado'; END IF;
  IF _product.status IS DISTINCT FROM _expected_status THEN
    RAISE EXCEPTION 'O status foi alterado em outra sessão. Atualize o produto antes de continuar.';
  END IF;

  IF NOT (
    (_product.status = 'draft' AND _target_status = 'pending_review') OR
    (_product.status = 'pending_review' AND _target_status IN ('approved', 'rejected')) OR
    (_product.status = 'approved' AND _target_status = 'active') OR
    (_product.status = 'rejected' AND _target_status = 'draft') OR
    (_product.status = 'active' AND _target_status IN ('paused', 'archived')) OR
    (_product.status = 'paused' AND _target_status IN ('active', 'archived'))
  ) THEN
    RAISE EXCEPTION 'Transição de lifecycle inválida: % para %', _product.status, _target_status;
  END IF;

  IF _target_status = 'rejected' AND nullif(btrim(coalesce(_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Informe o motivo da rejeição';
  END IF;

  IF _target_status = 'active' THEN
    IF nullif(btrim(_product.name), '') IS NULL THEN RAISE EXCEPTION 'Informe o nome do produto antes de ativar'; END IF;
    IF _product.category_id IS NULL THEN RAISE EXCEPTION 'Selecione uma categoria antes de ativar'; END IF;
    SELECT count(*), count(*) FILTER (WHERE nullif(btrim(sku), '') IS NULL OR nullif(btrim(internal_code), '') IS NULL)
      INTO _active_variant_count, _invalid_identifier_count
    FROM public.product_variants
    WHERE product_id = _product.id AND is_active;
    IF _active_variant_count = 0 THEN RAISE EXCEPTION 'Mantenha pelo menos uma variante/SKU ativa'; END IF;
    IF _invalid_identifier_count > 0 THEN RAISE EXCEPTION 'Toda variante ativa precisa ter SKU BemMais e código interno'; END IF;
  END IF;

  PERFORM set_config('app.product_lifecycle_transition', 'true', true);
  UPDATE public.products
  SET status = _target_status,
      rejection_reason = CASE WHEN _target_status = 'rejected' THEN btrim(_reason) ELSE rejection_reason END
  WHERE id = _product.id AND status = _expected_status;

  RETURN _target_status;
END;
$$;

REVOKE ALL ON FUNCTION public.transition_product_lifecycle(uuid, public.catalog_status, public.catalog_status, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transition_product_lifecycle(uuid, public.catalog_status, public.catalog_status, text) TO authenticated;

DROP TRIGGER IF EXISTS audit_product_lifecycle ON public.products;
CREATE TRIGGER audit_product_lifecycle
AFTER UPDATE OF status ON public.products
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.audit_row_change();
