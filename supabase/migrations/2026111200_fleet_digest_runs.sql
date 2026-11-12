-- Migration: Control de envío único diario del resumen de alertas de flota
-- Ticket: #47
-- El cron de GitHub Actions llega con horas de retraso, así que el resumen ya no depende de una
-- ventana horaria: se envía en la primera corrida de cada día (hora Colombia) y se registra aquí
-- para no repetirlo en las corridas siguientes del mismo día.

CREATE TABLE IF NOT EXISTS public.fleet_digest_runs (
  run_date DATE PRIMARY KEY,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  result JSONB NULL
);

-- Solo la usa el backend (service role, que ignora RLS); se bloquea el acceso público vía PostgREST
ALTER TABLE public.fleet_digest_runs ENABLE ROW LEVEL SECURITY;
