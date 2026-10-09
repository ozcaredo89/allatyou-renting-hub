-- ==========================================================================
-- MIGRATION: Leasing Maintenance Debits (Notas Débito de Mantenimiento)
-- Archivo: supabase/migrations/20261009_leasing_maintenance_debits.sql
-- ==========================================================================

BEGIN;

-- 1. Tabla de Notas Débito de Mantenimiento
CREATE TABLE IF NOT EXISTS public.leasing_maintenance_debits (
  id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  contract_id             BIGINT        NOT NULL REFERENCES public.leasing_contracts(id) ON DELETE CASCADE,
  expense_id              BIGINT        REFERENCES public.expenses(id) ON DELETE SET NULL,
  plate                   TEXT          NOT NULL REFERENCES public.vehicles(plate) ON UPDATE CASCADE ON DELETE RESTRICT,
  driver_id               BIGINT        REFERENCES public.drivers(id) ON DELETE SET NULL,
  total_expense_amount    NUMERIC(14,2) NOT NULL CHECK (total_expense_amount > 0),
  amount_deducted         NUMERIC(14,2) NOT NULL CHECK (amount_deducted >= 0),
  balance_before          NUMERIC(14,2) NOT NULL,
  balance_after           NUMERIC(14,2) NOT NULL,
  excess_amount           NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (excess_amount >= 0),
  excess_payment_method   TEXT          CHECK (excess_payment_method IN ('cash', 'advance', 'none') OR excess_payment_method IS NULL),
  advance_id              BIGINT        REFERENCES public.operational_advances(id) ON DELETE SET NULL,
  notes                   TEXT,
  created_at              TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leasing_maint_debits_contract ON public.leasing_maintenance_debits(contract_id);
CREATE INDEX IF NOT EXISTS idx_leasing_maint_debits_plate ON public.leasing_maintenance_debits(plate);
CREATE INDEX IF NOT EXISTS idx_leasing_maint_debits_expense ON public.leasing_maintenance_debits(expense_id);
CREATE INDEX IF NOT EXISTS idx_leasing_maint_debits_advance ON public.leasing_maintenance_debits(advance_id);

GRANT ALL ON public.leasing_maintenance_debits TO service_role;
GRANT SELECT ON public.leasing_maintenance_debits TO authenticated;

-- 2. Vista agregada actualizada con fondo gastado y saldo disponible
DROP VIEW IF EXISTS public.leasing_contracts_summary_vw CASCADE;
CREATE VIEW public.leasing_contracts_summary_vw AS
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
  COALESCE((
    SELECT SUM(d.amount_deducted)
    FROM public.leasing_maintenance_debits d
    WHERE d.contract_id = c.id
  ), 0) AS maintenance_fund_spent,
  (COALESCE(SUM(s.maintenance_paid), 0) - COALESCE((
    SELECT SUM(d.amount_deducted)
    FROM public.leasing_maintenance_debits d
    WHERE d.contract_id = c.id
  ), 0)) AS maintenance_fund_available,
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

-- 3. RPC Atómica: create_leasing_maintenance_debit
CREATE OR REPLACE FUNCTION public.create_leasing_maintenance_debit(
  p_contract_id BIGINT,
  p_expense_id BIGINT,
  p_plate TEXT,
  p_total_expense NUMERIC,
  p_excess_method TEXT,
  p_advance_id BIGINT,
  p_notes TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_contract RECORD;
  v_accumulated NUMERIC := 0;
  v_spent NUMERIC := 0;
  v_available NUMERIC := 0;
  v_deducted NUMERIC := 0;
  v_balance_after NUMERIC := 0;
  v_excess NUMERIC := 0;
  v_debit_id BIGINT;
BEGIN
  -- 1. Validar y bloquear el contrato
  SELECT * INTO v_contract
  FROM public.leasing_contracts
  WHERE id = p_contract_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CONTRACT_NOT_FOUND: Contrato de leasing % no encontrado', p_contract_id;
  END IF;

  -- 2. Calcular acumulado histórico de mantenimiento
  SELECT COALESCE(SUM(maintenance_paid), 0) INTO v_accumulated
  FROM public.leasing_schedule
  WHERE contract_id = p_contract_id;

  -- 3. Calcular total ya debitado anteriormente
  SELECT COALESCE(SUM(amount_deducted), 0) INTO v_spent
  FROM public.leasing_maintenance_debits
  WHERE contract_id = p_contract_id;

  v_available := GREATEST(0, v_accumulated - v_spent);

  IF v_available <= 0 AND p_total_expense > 0 THEN
    -- El fondo está en 0, todo es excedente
    v_deducted := 0;
    v_balance_after := 0;
    v_excess := p_total_expense;
  ELSE
    -- El fondo tiene saldo: deducir hasta donde alcance
    v_deducted := LEAST(v_available, p_total_expense);
    v_balance_after := v_available - v_deducted;
    v_excess := GREATEST(0, p_total_expense - v_deducted);
  END IF;

  -- 4. Insertar la Nota Débito
  INSERT INTO public.leasing_maintenance_debits (
    contract_id,
    expense_id,
    plate,
    driver_id,
    total_expense_amount,
    amount_deducted,
    balance_before,
    balance_after,
    excess_amount,
    excess_payment_method,
    advance_id,
    notes
  )
  VALUES (
    p_contract_id,
    p_expense_id,
    p_plate,
    v_contract.driver_id,
    p_total_expense,
    v_deducted,
    v_available,
    v_balance_after,
    v_excess,
    p_excess_method,
    p_advance_id,
    p_notes
  )
  RETURNING id INTO v_debit_id;

  RETURN jsonb_build_object(
    'debit_note_id', v_debit_id,
    'contract_id', p_contract_id,
    'plate', p_plate,
    'driver_id', v_contract.driver_id,
    'total_expense_amount', p_total_expense,
    'amount_deducted', v_deducted,
    'balance_before', v_available,
    'balance_after', v_balance_after,
    'excess_amount', v_excess,
    'excess_payment_method', p_excess_method,
    'advance_id', p_advance_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_leasing_maintenance_debit FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_leasing_maintenance_debit TO service_role;

COMMIT;
