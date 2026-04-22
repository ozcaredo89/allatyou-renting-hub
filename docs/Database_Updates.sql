-- ============================================================
-- Database_Updates.sql
-- Corrección de lógica financiera: Utilidad Real vs Flujo de Caja
-- Ejecutar manualmente en Supabase SQL Editor
-- Fecha: 2026-04-21
-- ============================================================

-- Actualizar la vista vehicle_month_profit para desagregar ingresos
-- y añadir provisión de mantenimiento diario (6000 COP por pago confirmado).
--
-- Columnas nuevas:
--   pure_income          → Ingreso neto (delivery + credit regular, SIN depósitos ni anticipos)
--   deposits_total       → Suma de insurance_amount (depósito diario)
--   advances_total       → Suma de credit_installment_amount para pagos con installment
--   maintenance_provision→ 6000 × número de pagos confirmados del mes
--
-- Fórmula de utilidad:
--   profit = pure_income - expense - maintenance_provision + adjustments

-- NOTA: CREATE OR REPLACE no permite renombrar columnas en PostgreSQL.
-- Usamos DROP + CREATE. CASCADE elimina vistas dependientes
-- (ej. vehicle_cumulative_profit) que se deben recrear después.
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
      -- Ingreso neto: total menos depósitos y menos anticipos (cuando aplica)
      SUM(
        amount
        - COALESCE(insurance_amount, 0)
        - CASE
            WHEN installment_number IS NOT NULL
              THEN COALESCE(credit_installment_amount, 0)
            ELSE 0
          END
      )::numeric(12,2) AS pure_income,
      -- Depósitos: porción de seguro/ahorro del conductor
      SUM(COALESCE(insurance_amount, 0))::numeric(12,2) AS deposits_total,
      -- Anticipos: pagos de cuotas de crédito (solo pagos con installment)
      SUM(
        CASE
          WHEN installment_number IS NOT NULL
            THEN COALESCE(credit_installment_amount, 0)
          ELSE 0
        END
      )::numeric(12,2) AS advances_total,
      -- Conteo de pagos confirmados para provisión de mantenimiento
      COUNT(*)::integer AS payment_count
    FROM payments
    WHERE status = 'confirmed'
    GROUP BY
      plate,
      date_trunc('month', payment_date::timestamp with time zone)::date
  )
SELECT
  b.plate,
  b.month,
  COALESCE(ib.pure_income, 0)::numeric(12,2)                AS pure_income,
  COALESCE(ib.deposits_total, 0)::numeric(12,2)              AS deposits_total,
  COALESCE(ib.advances_total, 0)::numeric(12,2)              AS advances_total,
  (COALESCE(ib.payment_count, 0) * 6000)::numeric(12,2)      AS maintenance_provision,
  COALESCE(x.total_expense, 0)::numeric(12,2)                AS expense,
  COALESCE(a.total_adjustments, 0)::numeric(12,2)            AS adjustments,
  (
    COALESCE(ib.pure_income, 0)
    - COALESCE(x.total_expense, 0)
    - (COALESCE(ib.payment_count, 0) * 6000)
    + COALESCE(a.total_adjustments, 0)
  )::numeric(12,2) AS profit
FROM base b
LEFT JOIN income_breakdown ib ON ib.plate = b.plate AND ib.month = b.month
LEFT JOIN vehicle_month_expense x ON x.plate = b.plate AND x.month = b.month
LEFT JOIN vehicle_month_adjustments a ON a.plate = b.plate AND a.month = b.month;

-- ============================================================
-- Recrear vehicle_cumulative_profit (eliminada por CASCADE)
-- Suma acumulada de profit por vehículo, ordenado por mes.
-- ============================================================
CREATE VIEW public.vehicle_cumulative_profit
WITH (security_invoker = true) AS
SELECT
  plate,
  month,
  SUM(profit) OVER (PARTITION BY plate ORDER BY month)::numeric(12,2) AS cum_profit
FROM public.vehicle_month_profit;
