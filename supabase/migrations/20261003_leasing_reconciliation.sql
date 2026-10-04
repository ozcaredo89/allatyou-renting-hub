-- =============================================================================
-- Migration: Reconciliación, Vista Agregada y RPCs Atómicas de Leasing
-- Archivo: supabase/migrations/20261003_leasing_reconciliation.sql
-- =============================================================================

-- 1. Vista segura de resumen agregado de contratos de leasing
CREATE OR REPLACE VIEW public.leasing_contracts_summary_vw AS
SELECT 
  c.id AS contract_id,
  c.plate,
  c.driver_id,
  c.status AS contract_status,
  c.start_date,
  c.financed_capital,
  c.monthly_rate_pct,
  c.daily_maintenance,
  c.daily_admin,
  c.daily_capital_interest,
  (c.daily_maintenance + c.daily_admin + c.daily_capital_interest) AS daily_quota,
  c.start_date_pending_confirmation,
  COUNT(s.id) AS total_installments,
  COUNT(s.id) FILTER (WHERE s.status = 'paid') AS paid_installments,
  COUNT(s.id) FILTER (WHERE s.status != 'paid') AS pending_installments,
  COALESCE(SUM(s.maintenance_paid), 0) AS maintenance_fund_accumulated,
  COALESCE(SUM(s.principal_paid), 0) AS total_principal_paid,
  COALESCE(
    (SELECT s2.balance_expected 
     FROM public.leasing_schedule s2 
     WHERE s2.contract_id = c.id AND s2.status = 'paid' 
     ORDER BY s2.installment_no DESC 
     LIMIT 1),
    c.financed_capital
  ) AS remaining_capital,
  COALESCE(SUM(s.maintenance_paid + s.admin_paid + s.interest_paid + s.principal_paid), 0) AS total_collected,
  MIN(s.due_date) FILTER (WHERE s.status != 'paid') AS next_due_date,
  MAX(s.due_date) AS estimated_end_date
FROM public.leasing_contracts c
LEFT JOIN public.leasing_schedule s ON s.contract_id = c.id
WHERE c.status = 'active'
GROUP BY c.id;

REVOKE ALL ON public.leasing_contracts_summary_vw FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.leasing_contracts_summary_vw TO service_role;

-- 2. RPC Atómica: match_leasing_payment
CREATE OR REPLACE FUNCTION public.match_leasing_payment(
  p_schedule_id BIGINT,
  p_payment_id BIGINT,
  p_maint_applied NUMERIC,
  p_admin_applied NUMERIC,
  p_int_applied NUMERIC,
  p_prin_applied NUMERIC,
  p_notes TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_schedule RECORD;
  v_payment RECORD;
  v_already_applied NUMERIC := 0;
  v_net_available NUMERIC := 0;
  v_total_to_apply NUMERIC := 0;
  v_falta_maint NUMERIC;
  v_falta_admin NUMERIC;
  v_falta_int NUMERIC;
  v_falta_prin NUMERIC;
  v_new_maint NUMERIC;
  v_new_admin NUMERIC;
  v_new_int NUMERIC;
  v_new_prin NUMERIC;
  v_new_status TEXT;
  v_contract_id BIGINT;
  v_remaining_pending INT;
BEGIN
  p_maint_applied := COALESCE(p_maint_applied, 0);
  p_admin_applied := COALESCE(p_admin_applied, 0);
  p_int_applied := COALESCE(p_int_applied, 0);
  p_prin_applied := COALESCE(p_prin_applied, 0);
  v_total_to_apply := p_maint_applied + p_admin_applied + p_int_applied + p_prin_applied;

  IF v_total_to_apply <= 0 THEN
    RAISE EXCEPTION 'ZERO_AMOUNT: El total a aplicar debe ser mayor a 0';
  END IF;

  -- Bloqueo pesimista de la cuota
  SELECT * INTO v_schedule
  FROM public.leasing_schedule
  WHERE id = p_schedule_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SCHEDULE_NOT_FOUND: Cuota % no encontrada', p_schedule_id;
  END IF;

  v_contract_id := v_schedule.contract_id;

  -- Bloqueo pesimista del pago
  SELECT * INTO v_payment
  FROM public.payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYMENT_NOT_FOUND: Pago % no encontrado', p_payment_id;
  END IF;

  -- Calcular saldo libre disponible del pago (usando el amount total del pago)
  SELECT COALESCE(SUM(amount_applied), 0) INTO v_already_applied
  FROM public.payment_distributions
  WHERE payment_id = p_payment_id;

  v_net_available := v_payment.amount - v_already_applied;

  -- Tolerancia de $1
  IF v_total_to_apply > (v_net_available + 1.0) THEN
    RAISE EXCEPTION 'EXCEEDS_PAYMENT_BALANCE: Monto a aplicar (%) excede el saldo libre disponible del pago (%)', v_total_to_apply, v_net_available;
  END IF;

  -- Validar que ningún rubro exceda lo faltante
  v_falta_maint := GREATEST(0, v_schedule.maintenance_expected - v_schedule.maintenance_paid);
  v_falta_admin := GREATEST(0, v_schedule.admin_expected - v_schedule.admin_paid);
  v_falta_int := GREATEST(0, v_schedule.interest_expected - v_schedule.interest_paid);
  v_falta_prin := GREATEST(0, v_schedule.principal_expected - v_schedule.principal_paid);

  IF p_maint_applied > (v_falta_maint + 1.0) THEN
    RAISE EXCEPTION 'EXCEEDS_MAINT: Abono mantenimiento (%) excede faltante (%)', p_maint_applied, v_falta_maint;
  END IF;
  IF p_admin_applied > (v_falta_admin + 1.0) THEN
    RAISE EXCEPTION 'EXCEEDS_ADMIN: Abono admin (%) excede faltante (%)', p_admin_applied, v_falta_admin;
  END IF;
  IF p_int_applied > (v_falta_int + 1.0) THEN
    RAISE EXCEPTION 'EXCEEDS_INTEREST: Abono interés (%) excede faltante (%)', p_int_applied, v_falta_int;
  END IF;
  IF p_prin_applied > (v_falta_prin + 1.0) THEN
    RAISE EXCEPTION 'EXCEEDS_PRINCIPAL: Abono capital (%) excede faltante (%)', p_prin_applied, v_falta_prin;
  END IF;

  -- Insertar distribuciones
  IF p_maint_applied > 0 THEN
    INSERT INTO public.payment_distributions (payment_id, schedule_id, bucket, amount_applied)
    VALUES (p_payment_id, p_schedule_id, 'maintenance', p_maint_applied);
  END IF;
  IF p_admin_applied > 0 THEN
    INSERT INTO public.payment_distributions (payment_id, schedule_id, bucket, amount_applied)
    VALUES (p_payment_id, p_schedule_id, 'admin', p_admin_applied);
  END IF;
  IF p_int_applied > 0 THEN
    INSERT INTO public.payment_distributions (payment_id, schedule_id, bucket, amount_applied)
    VALUES (p_payment_id, p_schedule_id, 'interest', p_int_applied);
  END IF;
  IF p_prin_applied > 0 THEN
    INSERT INTO public.payment_distributions (payment_id, schedule_id, bucket, amount_applied)
    VALUES (p_payment_id, p_schedule_id, 'principal', p_prin_applied);
  END IF;

  -- Actualizar cuota
  v_new_maint := v_schedule.maintenance_paid + p_maint_applied;
  v_new_admin := v_schedule.admin_paid + p_admin_applied;
  v_new_int := v_schedule.interest_paid + p_int_applied;
  v_new_prin := v_schedule.principal_paid + p_prin_applied;

  IF (v_new_maint >= v_schedule.maintenance_expected - 0.5) AND
     (v_new_admin >= v_schedule.admin_expected - 0.5) AND
     (v_new_int >= v_schedule.interest_expected - 0.5) AND
     (v_new_prin >= v_schedule.principal_expected - 0.5) THEN
    v_new_status := 'paid';
  ELSE
    v_new_status := 'partially_paid';
  END IF;

  UPDATE public.leasing_schedule
  SET
    maintenance_paid = v_new_maint,
    admin_paid = v_new_admin,
    interest_paid = v_new_int,
    principal_paid = v_new_prin,
    status = v_new_status,
    paid_at = CASE WHEN v_new_status = 'paid' AND paid_at IS NULL THEN v_payment.payment_date::timestamptz ELSE paid_at END,
    notes = CASE 
      WHEN p_notes IS NOT NULL AND trim(p_notes) != '' THEN 
        CASE WHEN notes IS NULL OR notes = '' THEN p_notes ELSE notes || ' | ' || p_notes END
      ELSE notes 
    END
  WHERE id = p_schedule_id;

  -- Evaluar cierre de contrato
  IF v_new_status = 'paid' THEN
    SELECT COUNT(*) INTO v_remaining_pending
    FROM public.leasing_schedule
    WHERE contract_id = v_contract_id AND status != 'paid';

    IF v_remaining_pending = 0 THEN
      UPDATE public.leasing_contracts SET status = 'closed' WHERE id = v_contract_id;
      UPDATE public.vehicles SET status = 'active' WHERE plate = v_payment.plate;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'schedule_id', p_schedule_id,
    'payment_id', p_payment_id,
    'status', v_new_status,
    'total_applied', v_total_to_apply
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.match_leasing_payment(BIGINT, BIGINT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_leasing_payment(BIGINT, BIGINT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT) TO service_role;

-- 3. RPC Atómica: unmatch_leasing_payment
CREATE OR REPLACE FUNCTION public.unmatch_leasing_payment(
  p_schedule_id BIGINT,
  p_payment_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_schedule RECORD;
  v_maint_rev NUMERIC := 0;
  v_admin_rev NUMERIC := 0;
  v_int_rev NUMERIC := 0;
  v_prin_rev NUMERIC := 0;
  v_new_maint NUMERIC;
  v_new_admin NUMERIC;
  v_new_int NUMERIC;
  v_new_prin NUMERIC;
  v_new_status TEXT;
  v_contract RECORD;
BEGIN
  -- Bloqueo pesimista de la cuota
  SELECT * INTO v_schedule
  FROM public.leasing_schedule
  WHERE id = p_schedule_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SCHEDULE_NOT_FOUND: Cuota % no encontrada', p_schedule_id;
  END IF;

  -- Sumar las distribuciones asociadas a este pago y cuota
  SELECT 
    COALESCE(SUM(amount_applied) FILTER (WHERE bucket = 'maintenance'), 0),
    COALESCE(SUM(amount_applied) FILTER (WHERE bucket = 'admin'), 0),
    COALESCE(SUM(amount_applied) FILTER (WHERE bucket = 'interest'), 0),
    COALESCE(SUM(amount_applied) FILTER (WHERE bucket = 'principal'), 0)
  INTO v_maint_rev, v_admin_rev, v_int_rev, v_prin_rev
  FROM public.payment_distributions
  WHERE schedule_id = p_schedule_id AND payment_id = p_payment_id;

  IF (v_maint_rev + v_admin_rev + v_int_rev + v_prin_rev) = 0 THEN
    RETURN jsonb_build_object('ok', true, 'message', 'No distribuciones encontradas');
  END IF;

  -- Eliminar las distribuciones
  DELETE FROM public.payment_distributions
  WHERE schedule_id = p_schedule_id AND payment_id = p_payment_id;

  -- Actualizar cuota
  v_new_maint := GREATEST(0, v_schedule.maintenance_paid - v_maint_rev);
  v_new_admin := GREATEST(0, v_schedule.admin_paid - v_admin_rev);
  v_new_int := GREATEST(0, v_schedule.interest_paid - v_int_rev);
  v_new_prin := GREATEST(0, v_schedule.principal_paid - v_prin_rev);

  IF (v_new_maint + v_new_admin + v_new_int + v_new_prin) <= 0.01 THEN
    v_new_status := 'pending';
  ELSE
    v_new_status := 'partially_paid';
  END IF;

  UPDATE public.leasing_schedule
  SET
    maintenance_paid = v_new_maint,
    admin_paid = v_new_admin,
    interest_paid = v_new_int,
    principal_paid = v_new_prin,
    status = v_new_status,
    paid_at = CASE WHEN v_new_status != 'paid' THEN NULL ELSE paid_at END
  WHERE id = p_schedule_id;

  -- Reabrir contrato si estaba cerrado
  SELECT * INTO v_contract
  FROM public.leasing_contracts
  WHERE id = v_schedule.contract_id;

  IF v_contract.status = 'closed' THEN
    UPDATE public.leasing_contracts SET status = 'active' WHERE id = v_contract.id;
    UPDATE public.vehicles SET status = 'leasing' WHERE plate = v_contract.plate;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'schedule_id', p_schedule_id,
    'payment_id', p_payment_id,
    'status', v_new_status,
    'reverted_total', (v_maint_rev + v_admin_rev + v_int_rev + v_prin_rev)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.unmatch_leasing_payment(BIGINT, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.unmatch_leasing_payment(BIGINT, BIGINT) TO service_role;
