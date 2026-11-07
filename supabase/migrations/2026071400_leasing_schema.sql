-- ==========================================================================
-- MIGRATION: Leasing / Rent-to-Own Schema
-- Archivo: supabase/migrations/20260714_leasing_schema.sql
-- Ejecución: Safe & Additive — no destruye tablas ni columnas existentes
-- ==========================================================================

BEGIN;

-- -----------------------------------------------------------------------
-- 1. Añadir 'leasing' al CHECK de status en vehicles
--    (Asumiendo que el check se llama vehicles_status_check; ajustar si difiere)
-- -----------------------------------------------------------------------
DO $$
BEGIN
  -- Intenta eliminar el constraint viejo si existe, para recrearlo con el nuevo valor
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.vehicles'::regclass
      AND conname = 'vehicles_status_check'
  ) THEN
    ALTER TABLE public.vehicles DROP CONSTRAINT vehicles_status_check;
  END IF;
END;
$$;

ALTER TABLE public.vehicles
  ADD CONSTRAINT vehicles_status_check
    CHECK (status IN ('active', 'maintenance', 'inactive', 'leasing', 'sold'));

-- -----------------------------------------------------------------------
-- 2. Tabla de contratos de leasing
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.leasing_contracts (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  plate                 TEXT        NOT NULL REFERENCES public.vehicles(plate)
                                      ON UPDATE CASCADE ON DELETE RESTRICT,
  driver_id             BIGINT      REFERENCES public.drivers(id)
                                      ON DELETE SET NULL,
  -- Financieros
  purchase_price        NUMERIC(14,2) NOT NULL CHECK (purchase_price > 0),
  down_payment          NUMERIC(14,2) NOT NULL DEFAULT 0
                                      CHECK (down_payment >= 0),
  financed_capital      NUMERIC(14,2) GENERATED ALWAYS AS
                          (purchase_price - down_payment) STORED,
  monthly_rate_pct      NUMERIC(6,4)  NOT NULL CHECK (monthly_rate_pct >= 0),
  -- Rubros diarios fijos
  daily_maintenance     NUMERIC(10,2) NOT NULL DEFAULT 10000
                                      CHECK (daily_maintenance >= 0),
  daily_admin           NUMERIC(10,2) NOT NULL DEFAULT 11000
                                      CHECK (daily_admin >= 0),
  -- Fechas
  start_date            DATE          NOT NULL,
  projected_end_date    DATE,
  -- Estado
  status                TEXT          NOT NULL DEFAULT 'active'
                                      CHECK (status IN ('active', 'closed', 'default')),
  -- Documento del contrato firmado
  contract_pdf_url      TEXT,
  notes                 TEXT,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT now(),

  -- Solo un contrato activo por vehículo a la vez
  CONSTRAINT uq_leasing_contracts_one_active_per_plate
    EXCLUDE USING btree (plate WITH =)
    WHERE (status = 'active')
);

CREATE INDEX IF NOT EXISTS idx_leasing_contracts_plate
  ON public.leasing_contracts(plate);
CREATE INDEX IF NOT EXISTS idx_leasing_contracts_driver_id
  ON public.leasing_contracts(driver_id);
CREATE INDEX IF NOT EXISTS idx_leasing_contracts_status
  ON public.leasing_contracts(status);

-- Trigger: actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION public.fn_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leasing_contracts_updated_at ON public.leasing_contracts;
CREATE TRIGGER trg_leasing_contracts_updated_at
  BEFORE UPDATE ON public.leasing_contracts
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- -----------------------------------------------------------------------
-- 3. Cronograma de cuotas con desglose completo por rubro
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.leasing_schedule (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  contract_id           BIGINT        NOT NULL REFERENCES public.leasing_contracts(id)
                                        ON DELETE CASCADE,
  installment_no        INTEGER       NOT NULL CHECK (installment_no > 0),
  due_date              DATE          NOT NULL,

  -- ---- Montos esperados (calculados al generar el cronograma) ----
  maintenance_expected  NUMERIC(14,2) NOT NULL DEFAULT 0,
  admin_expected        NUMERIC(14,2) NOT NULL DEFAULT 0,
  interest_expected     NUMERIC(14,2) NOT NULL DEFAULT 0,
  principal_expected    NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_expected        NUMERIC(14,2) GENERATED ALWAYS AS
                          (maintenance_expected + admin_expected +
                           interest_expected + principal_expected) STORED,

  -- ---- Montos recibidos (actualizados por la cascada de pagos) ----
  maintenance_paid      NUMERIC(14,2) NOT NULL DEFAULT 0
                                      CHECK (maintenance_paid >= 0),
  admin_paid            NUMERIC(14,2) NOT NULL DEFAULT 0
                                      CHECK (admin_paid >= 0),
  interest_paid         NUMERIC(14,2) NOT NULL DEFAULT 0
                                      CHECK (interest_paid >= 0),
  principal_paid        NUMERIC(14,2) NOT NULL DEFAULT 0
                                      CHECK (principal_paid >= 0),

  -- ---- Estado ----
  status                TEXT          NOT NULL DEFAULT 'pending'
                                      CHECK (status IN ('pending', 'partially_paid', 'paid')),
  paid_at               TIMESTAMPTZ,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT uq_leasing_schedule_contract_installment
    UNIQUE (contract_id, installment_no)
);

CREATE INDEX IF NOT EXISTS idx_leasing_schedule_contract_id
  ON public.leasing_schedule(contract_id);
CREATE INDEX IF NOT EXISTS idx_leasing_schedule_due_date
  ON public.leasing_schedule(due_date);
CREATE INDEX IF NOT EXISTS idx_leasing_schedule_status
  ON public.leasing_schedule(status);

DROP TRIGGER IF EXISTS trg_leasing_schedule_updated_at ON public.leasing_schedule;
CREATE TRIGGER trg_leasing_schedule_updated_at
  BEFORE UPDATE ON public.leasing_schedule
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- -----------------------------------------------------------------------
-- 4. Tabla pivote de distribución de pagos (trazabilidad completa)
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_distributions (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  payment_id            BIGINT        NOT NULL REFERENCES public.payments(id)
                                        ON DELETE CASCADE,
  schedule_id           BIGINT        NOT NULL REFERENCES public.leasing_schedule(id)
                                        ON DELETE CASCADE,
  -- El rubro al que se aplicó este monto
  bucket                TEXT          NOT NULL
                                      CHECK (bucket IN ('maintenance', 'admin', 'interest', 'principal')),
  amount_applied        NUMERIC(14,2) NOT NULL CHECK (amount_applied > 0),
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_distributions_payment_id
  ON public.payment_distributions(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_distributions_schedule_id
  ON public.payment_distributions(schedule_id);

COMMIT;
