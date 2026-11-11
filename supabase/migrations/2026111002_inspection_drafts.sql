-- Migration: Inspecciones en borrador compartibles, cronómetro y prueba de ruta
-- Ticket: #28
-- Permite guardar una inspección a medias, pasarla por WhatsApp (enlace con token) para que
-- otra persona la continúe, medir cuánto dura la revisión y registrar si hubo prueba de ruta.

ALTER TABLE public.inspections
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS continue_token UUID NULL,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS duration_seconds INTEGER NULL,
  ADD COLUMN IF NOT EXISTS road_test BOOLEAN NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inspections_status_check'
  ) THEN
    ALTER TABLE public.inspections
      ADD CONSTRAINT inspections_status_check
      CHECK (status IN ('draft', 'completed'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS inspections_continue_token_key
  ON public.inspections (continue_token)
  WHERE continue_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS inspections_status_idx
  ON public.inspections (status);
