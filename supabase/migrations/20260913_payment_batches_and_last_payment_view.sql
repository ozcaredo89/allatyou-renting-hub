-- =============================================================================
-- Migración: Pagos multi-día (lotes / batch payments)
-- 
-- Incluye:
--   1. Versionar get_payable_days (función auxiliar para mora dinámica)
--   2. Versionar vehicle_last_payment (vista de última fecha de pago)
--   3. Nuevas columnas en payments: batch_id, batch_index, batch_total_days
--   4. Índice para búsqueda eficiente por lote
--   5. RPC transaccional create_payment_batch
-- =============================================================================

-- 1. Función auxiliar: cuenta días efectivos a pagar descontando Pico y Placa / Calendario
CREATE OR REPLACE FUNCTION public.get_payable_days(p_plate TEXT, p_start_date DATE, p_end_date DATE)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_days INTEGER := 0;
  v_curr DATE;
  v_last_digit INTEGER;
  v_is_no_pay BOOLEAN;
  v_dow INTEGER;
BEGIN
  -- Si el rango es inválido o no ha pasado tiempo
  IF p_end_date <= p_start_date THEN
    RETURN 0;
  END IF;

  -- Obtener el último dígito de la placa (formato ABC123)
  v_last_digit := CAST(SUBSTRING(p_plate FROM '[0-9]$') AS INTEGER);

  -- Empezamos a contar desde el día siguiente al último pago
  v_curr := p_start_date + 1;
  
  WHILE v_curr <= p_end_date LOOP
    v_is_no_pay := FALSE;
    v_dow := EXTRACT(ISODOW FROM v_curr); -- 1 (Lunes) a 7 (Domingo)
    
    -- A) Chequeo Reglas Semanales (Pico y Placa)
    IF EXISTS (
      SELECT 1 FROM no_pay_rules 
      WHERE city = 'Cali' 
        AND weekday = v_dow 
        AND v_curr >= CAST(active_from AS DATE) AND v_curr <= CAST(active_to AS DATE) 
        AND v_last_digit = ANY(ends_in)
    ) THEN
      v_is_no_pay := TRUE;
    END IF;
    
    -- B) Chequeo Calendario (Feriados o Excepciones de No Pago)
    IF EXISTS (
      SELECT 1 FROM no_pay_calendar
      WHERE city = 'Cali' AND CAST(date AS DATE) = v_curr
      AND (applies_to_scope = 'all' OR (applies_to_scope = 'plates' AND p_plate = ANY(applies_to)))
    ) THEN
      v_is_no_pay := TRUE;
    END IF;

    -- Si no es día exento, se cuenta como día a pagar
    IF NOT v_is_no_pay THEN
      v_days := v_days + 1;
    END IF;
    
    v_curr := v_curr + 1;
  END LOOP;

  RETURN v_days;
END;
$$;

-- 2. Vista de último pago por vehículo (usa get_payable_days para mora dinámica)
CREATE OR REPLACE VIEW public.vehicle_last_payment
WITH (security_invoker = true) AS
SELECT
  v.plate,
  v.owner_name,
  lp.payment_date,
  lp.amount,
  COALESCE(lp.payment_date, v.created_at::date) AS ref_date,
  (now() AT TIME ZONE 'America/Bogota'::text)::date AS today_bogota,
  
  -- Días pagables reales desde el último pago (descontando Pico y Placa)
  public.get_payable_days(
    v.plate,
    COALESCE(lp.payment_date, v.created_at::date),
    (now() AT TIME ZONE 'America/Bogota'::text)::date
  ) AS days_since,
  
  -- Es mora si debe 2 días pagables o más
  public.get_payable_days(
    v.plate,
    COALESCE(lp.payment_date, v.created_at::date),
    (now() AT TIME ZONE 'America/Bogota'::text)::date
  ) >= 2 AS is_overdue,
  
  lp.installment_number,
  lp.proof_url
FROM
  vehicles v
  LEFT JOIN LATERAL (
    SELECT
      p.payment_date,
      p.amount,
      p.installment_number,
      p.proof_url
    FROM
      payments p
    WHERE
      p.plate = v.plate
    ORDER BY
      p.payment_date DESC,
      p.created_at DESC
    LIMIT 1
  ) lp ON true;

-- 3. Nuevas columnas en payments para soporte de lotes
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS batch_id UUID NULL,
  ADD COLUMN IF NOT EXISTS batch_index INT NULL,
  ADD COLUMN IF NOT EXISTS batch_total_days INT NULL;

-- 4. Índice para búsqueda eficiente por batch_id (solo filas que pertenecen a un lote)
CREATE INDEX IF NOT EXISTS idx_payments_batch_id
  ON payments(batch_id)
  WHERE batch_id IS NOT NULL;

-- 5. RPC transaccional para crear N pagos en un solo commit ACID
--    + avanzar cuotas en operational_advance_schedule
--
--    p_batch_id: UUID del lote (generado por Node antes de llamar)
--    p_payments: JSONB array de objetos con todos los campos de cada fila de payments
--    p_advance_updates: JSONB array de { schedule_id, desired_status, paid_date }
--                       para actualizar cuotas de anticipo operativo en la misma TX
CREATE OR REPLACE FUNCTION public.create_payment_batch(
  p_batch_id UUID,
  p_payments JSONB,
  p_advance_updates JSONB DEFAULT '[]'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_payment JSONB;
  v_update  JSONB;
  v_inserted_ids BIGINT[] := '{}';
  v_new_id BIGINT;
  v_schedule_id BIGINT;
BEGIN
  -- Insertar cada fila del lote
  FOR v_payment IN SELECT * FROM jsonb_array_elements(p_payments)
  LOOP
    INSERT INTO payments (
      payer_name,
      plate,
      driver_id,
      payment_date,
      amount,
      installment_number,
      proof_url,
      status,
      insurance_amount,
      maintenance_amount,
      delivery_amount,
      credit_installment_amount,
      installment_status,
      installment_shortfall,
      reference_number,
      provider_name,
      receipt_date,
      receipt_status,
      flag_details,
      batch_id,
      batch_index,
      batch_total_days
    ) VALUES (
      (v_payment->>'payer_name'),
      (v_payment->>'plate'),
      NULLIF(v_payment->>'driver_id', '')::UUID,
      (v_payment->>'payment_date')::DATE,
      (v_payment->>'amount')::BIGINT,
      NULLIF(v_payment->>'installment_number', '')::INT,
      NULLIF(v_payment->>'proof_url', ''),
      COALESCE(v_payment->>'status', 'pending'),
      COALESCE((v_payment->>'insurance_amount')::BIGINT, 0),
      COALESCE((v_payment->>'maintenance_amount')::BIGINT, 0),
      COALESCE((v_payment->>'delivery_amount')::BIGINT, 0),
      COALESCE((v_payment->>'credit_installment_amount')::BIGINT, 0),
      NULLIF(v_payment->>'installment_status', ''),
      NULLIF(v_payment->>'installment_shortfall', '')::INT,
      NULLIF(v_payment->>'reference_number', ''),
      NULLIF(v_payment->>'provider_name', ''),
      NULLIF(v_payment->>'receipt_date', '')::DATE,
      COALESCE(v_payment->>'receipt_status', 'unverified'),
      CASE WHEN v_payment->'flag_details' IS NULL OR v_payment->>'flag_details' = 'null'
           THEN NULL
           ELSE (v_payment->'flag_details')::JSONB
      END,
      p_batch_id,
      (v_payment->>'batch_index')::INT,
      (v_payment->>'batch_total_days')::INT
    )
    RETURNING id INTO v_new_id;

    v_inserted_ids := array_append(v_inserted_ids, v_new_id);
  END LOOP;

  -- Avanzar cuotas de anticipo operativo (si hay)
  FOR v_update IN SELECT * FROM jsonb_array_elements(p_advance_updates)
  LOOP
    v_schedule_id := (v_update->>'schedule_id')::BIGINT;
    
    -- Solo actualizar si la cuota no está ya marcada como pagada (protección)
    UPDATE operational_advance_schedule
    SET
      status    = COALESCE(v_update->>'desired_status', 'paid'),
      paid_date = NULLIF(v_update->>'paid_date', '')::DATE
    WHERE
      id = v_schedule_id
      AND status != 'paid';
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'inserted_ids', to_jsonb(v_inserted_ids),
    'batch_id', p_batch_id::TEXT
  );

EXCEPTION WHEN OTHERS THEN
  -- La transacción se revierte automáticamente al lanzar la excepción
  RAISE;
END;
$$;
