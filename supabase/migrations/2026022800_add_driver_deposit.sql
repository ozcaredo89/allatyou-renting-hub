-- Agregar campos de Depósito a la tabla de conductores
ALTER TABLE public.drivers
ADD COLUMN IF NOT EXISTS deposit_amount NUMERIC DEFAULT 300000,
ADD COLUMN IF NOT EXISTS deposit_receipt_url TEXT;
