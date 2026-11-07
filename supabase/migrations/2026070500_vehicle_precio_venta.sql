-- Agregar precio_venta a la tabla vehicles
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS precio_venta NUMERIC;
