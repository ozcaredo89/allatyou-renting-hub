-- ==========================================================================
-- MIGRATION: Contract Generation Infrastructure
-- Archivo: supabase/migrations/20260721_contract_generation.sql
-- ==========================================================================

BEGIN;

-- -----------------------------------------------------------------------
-- 1. Tabla config_financials
--    Guarda el Interés Bancario Corriente (IBC) certificado mensualmente.
--    Los cambios se INSERT, nunca UPDATE — historial completo de tasas.
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.config_financials (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ibc_monthly_pct NUMERIC(6,4) NOT NULL CHECK (ibc_monthly_pct > 0),
  valid_from      DATE          NOT NULL,
  valid_until     DATE,
  source          TEXT,         -- ej: "Superfinanciera Circular 002 de 2026"
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  created_by      TEXT          -- usuario que lo registró
);

-- Índice para buscar el IBC vigente a una fecha dada
CREATE INDEX IF NOT EXISTS idx_config_financials_valid_from
  ON public.config_financials(valid_from DESC);

-- Insertar valor inicial de referencia (ajustar al real antes de producción)
INSERT INTO public.config_financials (ibc_monthly_pct, valid_from, source, created_by)
  VALUES (2.14, '2026-07-01', 'Valor de referencia — actualizar con dato real Superfinanciera', 'system')
  ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------
-- 2. Secuencias atómicas para número de contrato y pagaré
--    Nunca leer max()+1 en app: usar nextval() de estas secuencias nativas.
-- -----------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.seq_contract_number
  START WITH 1 INCREMENT BY 1 NO CYCLE;

CREATE SEQUENCE IF NOT EXISTS public.seq_pagare_number
  START WITH 1 INCREMENT BY 1 NO CYCLE;

-- RPC wrappers: el backend llama supabase.rpc('next_contract_number')
-- que internamente usa nextval() — operación atómica sin condición de carrera.
CREATE OR REPLACE FUNCTION public.next_contract_number()
RETURNS BIGINT LANGUAGE SQL SECURITY DEFINER AS $$
  SELECT nextval('public.seq_contract_number');
$$;

CREATE OR REPLACE FUNCTION public.next_pagare_number()
RETURNS BIGINT LANGUAGE SQL SECURITY DEFINER AS $$
  SELECT nextval('public.seq_pagare_number');
$$;



-- -----------------------------------------------------------------------
-- 3. Tabla leasing_contract_versions
--    Trazabilidad de cada documento generado.
--    raw_json_payload NO incluye PII (cédula/email/tel/geocerca) — solo
--    comprador_id (FK a drivers) + datos financieros no sensibles.
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.leasing_contract_versions (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  contract_id      BIGINT        NOT NULL REFERENCES public.leasing_contracts(id)
                                   ON DELETE CASCADE,
  numero_contrato  TEXT          NOT NULL,   -- ej: AY-2026-0001
  numero_pagare    TEXT          NOT NULL,
  template_version TEXT          NOT NULL,   -- SHA256 del contrato.html usado
  docx_s3_key      TEXT,                     -- key en R2/S3
  pdf_s3_key       TEXT,                     -- key en R2/S3
  generated_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
  generated_by     TEXT,                     -- usuario o "system"
  -- Datos de auditoría NO-PII
  audit_payload    JSONB         NOT NULL DEFAULT '{}'::jsonb,
  -- ^ contiene: comprador_id, plate, purchase_price, down_payment,
  --   monthly_rate_pct, daily_maintenance, daily_admin, start_date,
  --   total_installments — NUNCA cédula/email/teléfono/geocerca en texto plano
  CONSTRAINT uq_contract_versions_numero UNIQUE (numero_contrato)
);

CREATE INDEX IF NOT EXISTS idx_leasing_contract_versions_contract_id
  ON public.leasing_contract_versions(contract_id);

-- -----------------------------------------------------------------------
-- 4. TODO(revisar-pii-conductores):
--    Este módulo asume que la protección de cédula/teléfono/email del
--    conductor (comprador) se resuelve a nivel de la tabla drivers
--    existente, no aquí. Si en el futuro se requiere cifrado en reposo
--    para esos campos, hacerlo en una migración separada sobre la tabla
--    drivers, con migración de datos existentes.
-- -----------------------------------------------------------------------

COMMIT;
