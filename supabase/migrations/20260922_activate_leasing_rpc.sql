-- =============================================================================
-- Migration: Activación Atómica de Contratos de Leasing (RPC) y Auditoría de Fechas
-- Archivo: supabase/migrations/20260922_activate_leasing_rpc.sql
-- =============================================================================

-- 1. Columnas de auditoría para fecha de inicio
ALTER TABLE public.leasing_contracts
  ADD COLUMN IF NOT EXISTS original_start_date DATE NULL,
  ADD COLUMN IF NOT EXISTS start_date_confirmed_at TIMESTAMPTZ NULL;

-- 2. RPC transaccional para activar contrato de leasing
CREATE OR REPLACE FUNCTION public.activate_leasing_contract(
  p_contract_id BIGINT,
  p_start_date DATE,
  p_valid_dates JSONB,
  p_schedule JSONB,
  p_signed_url TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_contract RECORD;
  v_active_id BIGINT;
  v_schedule_count INTEGER := 0;
BEGIN
  -- A. Validaciones defensivas de arrays no vacíos
  IF p_schedule IS NULL OR jsonb_typeof(p_schedule) != 'array' OR jsonb_array_length(p_schedule) = 0 THEN
    RAISE EXCEPTION 'EMPTY_SCHEDULE: El cronograma de pagos no puede estar vacío';
  END IF;

  IF p_valid_dates IS NULL OR jsonb_typeof(p_valid_dates) != 'array' OR jsonb_array_length(p_valid_dates) = 0 THEN
    RAISE EXCEPTION 'EMPTY_VALID_DATES: El calendario de fechas de pago no puede estar vacío';
  END IF;

  -- B. Bloqueo pesimista del contrato (previene carreras concurrentes)
  SELECT * INTO v_contract
  FROM public.leasing_contracts
  WHERE id = p_contract_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CONTRACT_NOT_FOUND: Contrato % no encontrado', p_contract_id;
  END IF;

  IF v_contract.status != 'pending' THEN
    RAISE EXCEPTION 'NOT_PENDING: El contrato ya fue procesado o no está pendiente (estado: %)', v_contract.status;
  END IF;

  -- C. Chequeo anti-duplicidad de contrato activo para la misma placa
  SELECT id INTO v_active_id
  FROM public.leasing_contracts
  WHERE plate = v_contract.plate
    AND status = 'active'
    AND id != p_contract_id
  LIMIT 1;

  IF v_active_id IS NOT NULL THEN
    RAISE EXCEPTION 'ALREADY_ACTIVE: Ya existe un contrato activo (#%) para la placa %', v_active_id, v_contract.plate;
  END IF;

  -- D. Idempotencia: limpiar cualquier cuota previa que haya quedado huérfana
  DELETE FROM public.leasing_schedule WHERE contract_id = p_contract_id;

  -- E. Inserción explícita de cuotas omitiendo columnas generadas (id, total_expected)
  --    e ignorando campos en memoria no persistidos (balance_expected)
  INSERT INTO public.leasing_schedule (
    contract_id,
    installment_no,
    due_date,
    maintenance_expected,
    admin_expected,
    interest_expected,
    principal_expected,
    maintenance_paid,
    admin_paid,
    interest_paid,
    principal_paid,
    status
  )
  SELECT
    p_contract_id,
    x.installment_no,
    x.due_date,
    x.maintenance_expected,
    x.admin_expected,
    x.interest_expected,
    x.principal_expected,
    0, 0, 0, 0,
    'pending'
  FROM jsonb_to_recordset(p_schedule) AS x(
    installment_no INTEGER,
    due_date DATE,
    maintenance_expected NUMERIC(14,2),
    admin_expected NUMERIC(14,2),
    interest_expected NUMERIC(14,2),
    principal_expected NUMERIC(14,2)
  );

  GET DIAGNOSTICS v_schedule_count = ROW_COUNT;

  -- F. Actualización del contrato de leasing
  UPDATE public.leasing_contracts
  SET
    status = 'active',
    start_date = p_start_date,
    valid_payment_dates = p_valid_dates,
    signed_contract_url = p_signed_url,
    signed_at = now(),
    start_date_confirmed_at = now(),
    original_start_date = COALESCE(original_start_date, v_contract.start_date)
  WHERE id = p_contract_id;

  -- G. Actualización del vehículo a 'leasing'
  UPDATE public.vehicles
  SET status = 'leasing'
  WHERE plate = v_contract.plate;

  RETURN jsonb_build_object(
    'ok', true,
    'contract_id', p_contract_id,
    'plate', v_contract.plate,
    'schedule_count', v_schedule_count
  );
END;
$$;

-- 3. Restringir permisos de ejecución únicamente a service_role (backend interno)
REVOKE EXECUTE ON FUNCTION public.activate_leasing_contract(BIGINT, DATE, JSONB, JSONB, TEXT) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.activate_leasing_contract(BIGINT, DATE, JSONB, JSONB, TEXT) TO service_role;
