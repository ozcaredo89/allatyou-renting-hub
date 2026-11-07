-- =============================================================================
-- Migración: la mora no cuenta los días en que el carro no tenía conductor asignado
-- (pagos.md §1 y §6 "Resolver días en mora", decisión 2026-10-17).
--
-- Solo cambia el cuerpo de get_payable_days (misma firma), que es lo que usa la vista
-- vehicle_last_payment para days_since / is_overdue. La vista no se toca.
--
-- Un día D (hora Colombia) tiene conductor si existe una fila de vehicle_assignments
-- de la placa con start_date <= D y (end_date IS NULL o end_date >= D), comparando en
-- días de America/Bogota. El día de la entrega cuenta para los dos conductores
-- (ej. UGP771: Juan Camilo Millán hasta el 16-oct 7 PM, Santiago Londoño desde ese día).
--
-- Si la placa no tiene ninguna fila en vehicle_assignments (historial anterior a la tabla),
-- se usa vehicles.current_driver_id: con conductor cuentan todos los días, sin conductor
-- ninguno. Es el mismo criterio de driverOnDate (src/lib/advanceOwnership.ts).
-- =============================================================================

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
  v_has_history BOOLEAN;
  v_has_current_driver BOOLEAN;
BEGIN
  -- Si el rango es inválido o no ha pasado tiempo
  IF p_end_date <= p_start_date THEN
    RETURN 0;
  END IF;

  -- Obtener el último dígito de la placa (formato ABC123)
  v_last_digit := CAST(SUBSTRING(p_plate FROM '[0-9]$') AS INTEGER);

  -- Historial de asignaciones de la placa (si no hay, se usa el conductor actual)
  v_has_history := EXISTS (
    SELECT 1 FROM vehicle_assignments WHERE plate = p_plate AND driver_id IS NOT NULL
  );
  v_has_current_driver := EXISTS (
    SELECT 1 FROM vehicles WHERE plate = p_plate AND current_driver_id IS NOT NULL
  );

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

    -- C) Día sin conductor asignado (hora Colombia): no es mora
    IF NOT v_is_no_pay THEN
      IF v_has_history THEN
        IF NOT EXISTS (
          SELECT 1 FROM vehicle_assignments a
          WHERE a.plate = p_plate
            AND a.driver_id IS NOT NULL
            AND (a.start_date AT TIME ZONE 'America/Bogota')::date <= v_curr
            AND (a.end_date IS NULL OR (a.end_date AT TIME ZONE 'America/Bogota')::date >= v_curr)
        ) THEN
          v_is_no_pay := TRUE;
        END IF;
      ELSIF NOT v_has_current_driver THEN
        v_is_no_pay := TRUE;
      END IF;
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

-- Índice para la consulta por placa y fechas de asignación
CREATE INDEX IF NOT EXISTS idx_vehicle_assignments_plate_dates
  ON vehicle_assignments(plate, start_date, end_date);

-- =============================================================================
-- Día resuelto como "descuento en liquidación" (pagos.md §6, decisión 2026-10-17).
-- Fila marcador en payments: confirmed, amount = 0 y reparto en 0 (no suma a ingresos),
-- receipt_status = 'liquidation_debt', driver_id = conductor que debe el día.
--   liquidation_debt_amount = canon del día + recargo máximo ($15.000; en leasing sin recargo)
--   liquidation_id          = liquidación que la descontó; NULL = deuda pendiente del conductor
-- =============================================================================
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS liquidation_debt_amount BIGINT NULL,
  ADD COLUMN IF NOT EXISTS liquidation_id UUID NULL REFERENCES liquidations(id);

CREATE INDEX IF NOT EXISTS idx_payments_liquidation_debt_pending
  ON payments(driver_id)
  WHERE receipt_status = 'liquidation_debt' AND liquidation_id IS NULL;
