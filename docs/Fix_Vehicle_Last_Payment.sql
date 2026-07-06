-- ==============================================================================
-- FIX: Cálculo dinámico de días en mora descontando Pico y Placa / Calendario
-- ==============================================================================

-- 1. Crear una función auxiliar que cuente los días efectivos a pagar
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

  -- Obtener el último dígito de la placa (asumiendo formato ABC123)
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

-- 2. Reemplazar la vista para que use la nueva función
CREATE OR REPLACE VIEW public.vehicle_last_payment
WITH (security_invoker = true) AS
SELECT
  v.plate,
  v.owner_name,
  lp.payment_date,
  lp.amount,
  COALESCE(lp.payment_date, v.created_at::date) AS ref_date,
  (now() AT TIME ZONE 'America/Bogota'::text)::date AS today_bogota,
  
  -- Reemplazamos la resta simple por la función dinámica
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
