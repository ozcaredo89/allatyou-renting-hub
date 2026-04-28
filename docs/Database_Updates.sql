-- ============================================================
-- Database_Updates.sql
-- Corrección de lógica financiera: Utilidad Real vs Flujo de Caja
-- Ejecutar manualmente en Supabase SQL Editor
-- Fecha: 2026-04-21
-- ============================================================

-- ============================================================
-- PASO 1: Agregar columna maintenance_amount a la tabla payments
-- ============================================================
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS maintenance_amount numeric(14,2) DEFAULT 0;

-- ============================================================
-- PASO 2: Recrear la vista vehicle_month_profit
-- DROP CASCADE elimina dependientes (ej. vehicle_cumulative_profit)
-- ============================================================
DROP VIEW IF EXISTS public.vehicle_month_profit CASCADE;

CREATE VIEW public.vehicle_month_profit
WITH (security_invoker = true) AS
WITH
  base AS (
    SELECT u.plate, u.month
    FROM (
      SELECT plate, month FROM vehicle_month_income
      UNION
      SELECT plate, month FROM vehicle_month_expense
      UNION
      SELECT plate, month FROM vehicle_month_adjustments
    ) u
  ),
  income_breakdown AS (
    SELECT
      plate,
      date_trunc('month', payment_date::timestamp with time zone)::date AS month,
      -- Ingreso neto: solo delivery_amount (ingreso operativo real)
      SUM(COALESCE(delivery_amount, 0))::numeric(12,2) AS pure_income,
      -- Depósitos: porción de seguro/ahorro del conductor (5000 diarios)
      SUM(COALESCE(insurance_amount, 0))::numeric(12,2) AS deposits_total,
      -- Provisión de mantenimiento: viene directo de la columna (6000 diarios)
      SUM(COALESCE(maintenance_amount, 0))::numeric(12,2) AS maintenance_provision,
      -- Anticipos: pagos de cuotas de crédito (solo pagos con installment)
      SUM(
        CASE
          WHEN installment_number IS NOT NULL
            THEN COALESCE(credit_installment_amount, 0)
          ELSE 0
        END
      )::numeric(12,2) AS advances_total
    FROM payments
    WHERE status = 'confirmed'
    GROUP BY
      plate,
      date_trunc('month', payment_date::timestamp with time zone)::date
  )
SELECT
  b.plate,
  b.month,
  COALESCE(ib.pure_income, 0)::numeric(12,2)             AS pure_income,
  COALESCE(ib.deposits_total, 0)::numeric(12,2)           AS deposits_total,
  COALESCE(ib.advances_total, 0)::numeric(12,2)           AS advances_total,
  COALESCE(ib.maintenance_provision, 0)::numeric(12,2)    AS maintenance_provision,
  COALESCE(x.total_expense, 0)::numeric(12,2)             AS expense,
  COALESCE(a.total_adjustments, 0)::numeric(12,2)         AS adjustments,
  (
    COALESCE(ib.pure_income, 0)
    - COALESCE(x.total_expense, 0)
    + COALESCE(a.total_adjustments, 0)
  )::numeric(12,2) AS profit
FROM base b
LEFT JOIN income_breakdown ib ON ib.plate = b.plate AND ib.month = b.month
LEFT JOIN vehicle_month_expense x ON x.plate = b.plate AND x.month = b.month
LEFT JOIN vehicle_month_adjustments a ON a.plate = b.plate AND a.month = b.month;

-- ============================================================
-- PASO 3: Recrear vehicle_cumulative_profit (eliminada por CASCADE)
-- Suma acumulada de profit por vehículo, ordenado por mes.
-- ============================================================
CREATE VIEW public.vehicle_cumulative_profit
WITH (security_invoker = true) AS
SELECT
  plate,
  month,
  SUM(profit) OVER (PARTITION BY plate ORDER BY month)::numeric(12,2) AS cum_profit
FROM public.vehicle_month_profit;

-- ============================================================
-- PASO 4: Recrear vehicle_breakeven_status (eliminada por CASCADE)
-- Calcula inversión, restante, % recuperado y si el vehículo
-- ya se "liberó" (la utilidad acumulada superó la inversión).
-- ============================================================
CREATE VIEW public.vehicle_breakeven_status
WITH (security_invoker = true) AS
SELECT
  c.plate,
  COALESCE(i.investment_total, 0)::numeric(12,2) AS investment_total,
  GREATEST(COALESCE(i.investment_total, 0) - c.cum_profit, 0)::numeric(12,2) AS remaining,
  CASE
    WHEN COALESCE(i.investment_total, 0) > 0
      THEN LEAST(c.cum_profit / i.investment_total * 100, 100)
    ELSE 0
  END::numeric(6,2) AS pct_recovered,
  c.cum_profit >= COALESCE(i.investment_total, 0) AS is_released
FROM (
  -- Último mes acumulado por placa
  SELECT DISTINCT ON (plate)
    plate,
    cum_profit
  FROM public.vehicle_cumulative_profit
  ORDER BY plate, month DESC
) c
LEFT JOIN public.vehicle_investment_total i ON i.plate = c.plate;

-- ============================================================
-- PASO 5: Módulo de Rutas Bajo Demanda (Subasta Inversa)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.trips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_phone TEXT NOT NULL,
    client_email TEXT,
    origin_address TEXT NOT NULL,
    origin_lat NUMERIC(10, 7) NOT NULL,
    origin_lng NUMERIC(10, 7) NOT NULL,
    dest_address TEXT NOT NULL,
    dest_lat NUMERIC(10, 7) NOT NULL,
    dest_lng NUMERIC(10, 7) NOT NULL,
    distance_km NUMERIC(6, 2),
    pickup_time TIMESTAMP WITH TIME ZONE,
    recurrence TEXT DEFAULT 'none',
    status TEXT DEFAULT 'pending', -- pending, assigned, completed
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.trip_offers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID REFERENCES public.trips(id) ON DELETE CASCADE,
    driver_name TEXT NOT NULL,
    driver_phone TEXT NOT NULL,
    offer_amount NUMERIC(12, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Políticas RLS opcionales (Asegúrate de configurar según el entorno)
-- Por ahora se permite escritura para que funcione la demo.
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable insert for public" ON public.trips FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable read for all" ON public.trips FOR SELECT USING (true);
CREATE POLICY "Enable update for all" ON public.trips FOR UPDATE USING (true);

ALTER TABLE public.trip_offers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable insert for public" ON public.trip_offers FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable read for all" ON public.trip_offers FOR SELECT USING (true);

ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS waypoints JSONB DEFAULT '[]'::jsonb;
