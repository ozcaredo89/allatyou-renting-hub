-- Migration: Chequeo de coraza del ramal eléctrico y fugas de refrigerante en inspección
-- Ticket: #57

ALTER TABLE public.inspections
  ADD COLUMN IF NOT EXISTS electrical_harness_status TEXT NULL,
  ADD COLUMN IF NOT EXISTS coolant_leaks_status TEXT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inspections_electrical_harness_check'
  ) THEN
    ALTER TABLE public.inspections
      ADD CONSTRAINT inspections_electrical_harness_check
      CHECK (electrical_harness_status IS NULL OR electrical_harness_status IN ('good', 'damaged'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inspections_coolant_leaks_check'
  ) THEN
    ALTER TABLE public.inspections
      ADD CONSTRAINT inspections_coolant_leaks_check
      CHECK (coolant_leaks_status IS NULL OR coolant_leaks_status IN ('no_leaks', 'leak_detected'));
  END IF;
END $$;
