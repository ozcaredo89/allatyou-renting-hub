-- Agregar soat_url a la tabla vehicles  
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS soat_url TEXT; 
