-- =============================================================================
-- Migración: Pagos multi-día (lotes / batch payments)
--
-- IMPORTANTE ANTES DE APLICAR:
--   Verificar que get_payable_days y vehicle_last_payment en producción coincidan
--   con este texto usando:
--     SELECT pg_get_functiondef('get_payable_days'::regproc);
--     SELECT pg_get_viewdef('vehicle_last_payment', true);
--   CREATE OR REPLACE VIEW solo permite agregar columnas al final, nunca quitarlas
--   o reordenarlas. En este archivo el orden de columnas es 100% idéntico a producción:
--   (plate, owner_name, payment_date, amount, ref_date, today_bogota, days_since,
--    is_overdue, installment_number, proof_url).
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

-- 2. Vista de último pago por vehículo (usa get_payable_days para mora dinámica).
--    FIX batch: proof_url se resuelve vía batch_id cuando la fila más reciente
--    pertenece a un lote (solo batch_index=0 guarda proof_url; las demás lo tienen NULL).
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

  -- FIX: si el pago más reciente es parte de un lote, buscamos proof_url
  -- en la fila con proof_url no nulo de ese batch. Para pagos
  -- individuales (batch_id IS NULL) lo tomamos directo.
  CASE
    WHEN lp.batch_id IS NOT NULL THEN (
      SELECT p2.proof_url
      FROM payments p2
      WHERE p2.batch_id = lp.batch_id
        AND p2.proof_url IS NOT NULL
      ORDER BY p2.batch_index ASC
      LIMIT 1
    )
    ELSE lp.proof_url
  END AS proof_url

FROM
  vehicles v
  LEFT JOIN LATERAL (
    SELECT
      p.payment_date,
      p.amount,
      p.installment_number,
      p.proof_url,
      p.batch_id
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

-- 4. Índice para búsqueda eficiente por batch_id (solo filas de lote)
CREATE INDEX IF NOT EXISTS idx_payments_batch_id
  ON payments(batch_id)
  WHERE batch_id IS NOT NULL;

-- 5. Índices únicos parciales para anti-colisión de fechas a nivel DB.
--    Cierran la ventana de carrera entre el SELECT de Node y el INSERT del RPC.
--    Evitan duplicidad de pagos pending o confirmed para una misma fecha/placa.
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_plate_date_pending_unique
  ON payments(plate, payment_date)
  WHERE status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_plate_date_confirmed_unique
  ON payments(plate, payment_date)
  WHERE status = 'confirmed';

-- 6. RPC transaccional para crear N pagos en un solo commit ACID
--    + chequeo anti-colisión en transacción
--    + avanzar cuotas en operational_advance_schedule
--
--    Correcciones aplicadas:
--      [CRÍTICO] driver_id castea a BIGINT (no UUID): drivers.id es BIGINT en todo
--                el esquema. El cast UUID abortaba cualquier pago con conductor asignado.
--      [BUG]     flag_details usa jsonb_typeof() = 'null' en vez de ->> = 'null':
--                el operador ->> sobre JSON null devuelve NULL de SQL, no el texto
--                'null', por lo que la comparación nunca era TRUE y los lotes
--                sin marca guardaban un literal JSON null en vez de NULL real.
--      [RIESGO]  GET DIAGNOSTICS ROW_COUNT en el UPDATE de cuotas: si una cuota
--                ya estaba 'paid' o el schedule_id no existe, 0 filas -> RAISE
--                aborta el lote completo en lugar de dejar pagos huérfanos sin cuota.
--      [ACID]    Chequeo anti-colisión dentro de la transacción plpgsql antes de
--                insertar cualquier fila, garantizando atomicidad real frente a
--                solicitudes concurrentes.
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
  v_row_count INTEGER;
  v_existing_status TEXT;
BEGIN
  -- 1. Anti-colisión dentro de la transacción ACID:
  --    Verificar que ninguna de las fechas del lote tenga ya un pago activo (pending o confirmed)
  FOR v_payment IN SELECT * FROM jsonb_array_elements(p_payments)
  LOOP
    SELECT status::TEXT INTO v_existing_status
    FROM payments
    WHERE plate = (v_payment->>'plate')
      AND payment_date = (v_payment->>'payment_date')::DATE
      AND status::TEXT IN ('pending', 'confirmed')
    LIMIT 1;

    IF v_existing_status IS NOT NULL THEN
      RAISE EXCEPTION
        'Conflicto de fecha: ya existe un pago (%) para la placa % en la fecha %',
        v_existing_status, (v_payment->>'plate'), (v_payment->>'payment_date');
    END IF;
  END LOOP;

  -- 2. Insertar cada fila del lote
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
      -- FIX CRÍTICO: BIGINT, no UUID. drivers.id es BIGINT en todo el esquema.
      NULLIF(v_payment->>'driver_id', '')::BIGINT,
      (v_payment->>'payment_date')::DATE,
      (v_payment->>'amount')::BIGINT,
      NULLIF(v_payment->>'installment_number', '')::INT,
      NULLIF(v_payment->>'proof_url', ''),
      COALESCE(v_payment->>'status', 'pending')::payment_status,
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
      -- FIX: jsonb_typeof detecta correctamente el escalar JSON null.
      -- ->> sobre null JSON devuelve NULL de SQL (no el string 'null').
      CASE
        WHEN v_payment->'flag_details' IS NULL
          OR jsonb_typeof(v_payment->'flag_details') = 'null'
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

  -- 3. Avanzar cuotas de anticipo operativo (si hay)
  FOR v_update IN SELECT * FROM jsonb_array_elements(p_advance_updates)
  LOOP
    v_schedule_id := (v_update->>'schedule_id')::BIGINT;

    -- FIX: verificar ROW_COUNT. Si la cuota ya estaba 'paid' (carrera)
    -- o el schedule_id no existe, 0 filas -> RAISE fuerza rollback completo.
    UPDATE operational_advance_schedule
    SET
      status    = COALESCE(v_update->>'desired_status', 'paid'),
      paid_date = NULLIF(v_update->>'paid_date', '')::DATE
    WHERE
      id = v_schedule_id
      AND status != 'paid';

    GET DIAGNOSTICS v_row_count = ROW_COUNT;

    IF v_row_count = 0 THEN
      RAISE EXCEPTION
        'Cuota % ya estaba pagada o no existe — lote revertido para evitar inconsistencia',
        v_schedule_id;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'inserted_ids', to_jsonb(v_inserted_ids),
    'batch_id', p_batch_id::TEXT
  );

EXCEPTION WHEN OTHERS THEN
  -- La transacción se revierte automáticamente; relanzamos para que Node reciba el error.
  RAISE;
END;
$$;
