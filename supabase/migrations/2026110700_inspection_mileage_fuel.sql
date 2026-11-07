-- Migration: Campos para inspección móvil (kilometraje y nivel de combustible)
-- Ticket: #12
-- Permite registrar el odómetro y nivel visual de combustible en cada entrega, recepción o control periódico.

ALTER TABLE public.inspections
  ADD COLUMN IF NOT EXISTS mileage NUMERIC NULL,
  ADD COLUMN IF NOT EXISTS fuel_level TEXT NULL;

-- Restricción opcional para asegurar valores estándar de combustible
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inspections_fuel_level_check'
  ) THEN
    ALTER TABLE public.inspections
      ADD CONSTRAINT inspections_fuel_level_check
      CHECK (fuel_level IS NULL OR fuel_level IN ('empty', '1/4', '1/2', '3/4', 'full'));
  END IF;
END $$;
