CREATE TABLE IF NOT EXISTS public.chat_sessions (
  id text PRIMARY KEY,
  history jsonb DEFAULT '[]'::jsonb NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Habilitar RLS si aplica, o dejarlo público para el servicio, pero como se accede desde backend no es estrictamente necesario,
-- solo aseguramos la estructura.
