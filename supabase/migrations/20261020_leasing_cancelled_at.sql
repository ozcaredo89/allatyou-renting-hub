-- Migration: fecha real de cancelación de un contrato de leasing.
-- updated_at no sirve para esto: un trigger lo mueve en cualquier UPDATE (ej. editar notes).
-- Los contratos cancelados antes de esta migración quedan con cancelled_at = NULL.
ALTER TABLE public.leasing_contracts
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
