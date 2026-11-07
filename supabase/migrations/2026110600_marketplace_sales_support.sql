-- Migración: Soporte para venta de vehículos en Marketplace
-- Permite clasificar vehículos entre alquiler ('rent'), venta ('sale') o ambos ('both'),
-- e incluir el precio de venta (sale_price).

ALTER TABLE public.marketplace_cars 
  ADD COLUMN IF NOT EXISTS listing_type TEXT DEFAULT 'rent',
  ADD COLUMN IF NOT EXISTS sale_price NUMERIC DEFAULT NULL;

-- Asegurar que registros existentes tengan listing_type = 'rent' por defecto
UPDATE public.marketplace_cars 
SET listing_type = 'rent' 
WHERE listing_type IS NULL;
