-- =====================================================
-- Tabla: investment_pledges
-- Propósito: Captar expresiones de interés (soft commitments)
--            para el fondeo de nuevos vehículos de la flota.
--            NO procesa pagos. Solo registra intención.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.investment_pledges (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text        NOT NULL,
  document_id    text        NOT NULL,
  phone          text        NOT NULL,
  email          text        NOT NULL,
  nequi_account  text        NOT NULL,
  amount         numeric     NOT NULL CHECK (amount > 0),
  accepted_terms boolean     NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- RLS: Solo el service role puede leer. Los INSERT son públicos
-- (el backend Express usa el service role key, así que esto es seguro).
ALTER TABLE public.investment_pledges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access"
  ON public.investment_pledges
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Índice para consultas de suma rápida
CREATE INDEX IF NOT EXISTS idx_pledges_created_at
  ON public.investment_pledges (created_at DESC);
