-- ===========================================================================
-- MIGRATION: Tabla de Simulaciones de Amortización (Leasing Pre-contratos)
-- Archivo: supabase/migrations/20260720_leasing_simulations.sql
-- Solo guarda los parámetros de entrada, no el cronograma completo.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.leasing_simulations (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  plate                 TEXT          NOT NULL,   -- puede no tener FK aún (sin placa = simulación manual)
  purchase_price        NUMERIC(14,2) NOT NULL,
  down_payment          NUMERIC(14,2) NOT NULL DEFAULT 0,
  monthly_rate_pct      NUMERIC(6,4)  NOT NULL,
  daily_quota           NUMERIC(10,2) NOT NULL,   -- cuota a capital + interés
  daily_maintenance     NUMERIC(10,2) NOT NULL DEFAULT 10000,
  daily_admin           NUMERIC(10,2) NOT NULL DEFAULT 11000,
  start_date            DATE          NOT NULL,
  notes                 TEXT,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leasing_simulations_plate
  ON public.leasing_simulations(plate);
CREATE INDEX IF NOT EXISTS idx_leasing_simulations_created_at
  ON public.leasing_simulations(created_at DESC);

-- ===========================================================================
-- SEED: 7 simulaciones conocidas (ajustadas a fecha de hoy)
-- Datos extraídos de los PDFs proporcionados.
-- start_date = hoy para que puedan activarse sin inconsistencias de fechas.
-- ===========================================================================

INSERT INTO public.leasing_simulations
  (plate, purchase_price, down_payment, monthly_rate_pct, daily_quota, daily_maintenance, daily_admin, start_date, notes)
VALUES
  -- Placa JKR132 — Capital $31M, cuota $70k, tasa 3.5%
  ('JKR132', 31000000, 0, 3.5, 70000, 10000, 11000, CURRENT_DATE, 'Simulación importada del PDF — fecha ajustada a hoy'),

  -- Placa JKR249 — Capital $31M, cuota $70k, tasa 3.5%
  ('JKR249', 31000000, 0, 3.5, 70000, 10000, 11000, CURRENT_DATE, 'Simulación importada del PDF — fecha ajustada a hoy'),

  -- Placa JHW889 — Capital $39M, cuota $70k, tasa 3.5%
  ('JHW889', 39000000, 0, 3.5, 70000, 10000, 11000, CURRENT_DATE, 'Simulación importada del PDF — fecha ajustada a hoy');

-- Nota: Agrega las otras 4 placas con el mismo formato cuando las tengas disponibles.
