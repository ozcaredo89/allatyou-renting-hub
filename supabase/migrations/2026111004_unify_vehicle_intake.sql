-- Ticket #38: captación única de vehículos.
-- `vehicle_applications` pasa a ser la única tabla de captación (formulario de /#propietarios y /rent-your-car)
-- y la fuente del catálogo público /rent. `marketplace_cars` queda retirada (se conserva como histórico).
--
-- Reglas: alquilar = administración AllAtYou; vender = publicación en catálogo con contacto del dueño;
-- both = ambas. Solo lo `approved` + `published_in_catalog` aparece en el catálogo.

-- 1) Nuevas columnas de modalidad y publicación
ALTER TABLE public.vehicle_applications
  ADD COLUMN IF NOT EXISTS listing_type TEXT NOT NULL DEFAULT 'rent',
  ADD COLUMN IF NOT EXISTS sale_price NUMERIC DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS transmission TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS accepts_public_contact BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS published_in_catalog BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS legacy_marketplace_car_id BIGINT DEFAULT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vehicle_applications_listing_type_check'
  ) THEN
    ALTER TABLE public.vehicle_applications
      ADD CONSTRAINT vehicle_applications_listing_type_check
      CHECK (listing_type IN ('rent', 'sale', 'both'));
  END IF;
END $$;

-- 2) Campos que solo aplican a alquiler (o que no existen en registros del marketplace) pasan a opcionales
ALTER TABLE public.vehicle_applications ALTER COLUMN availability_type DROP NOT NULL;
ALTER TABLE public.vehicle_applications ALTER COLUMN expected_daily_rent DROP NOT NULL;
ALTER TABLE public.vehicle_applications ALTER COLUMN appointment_date DROP NOT NULL;
ALTER TABLE public.vehicle_applications ALTER COLUMN color DROP NOT NULL;

CREATE INDEX IF NOT EXISTS vehicle_applications_catalog_idx
  ON public.vehicle_applications (status, published_in_catalog);

-- 3) Traer los carros del marketplace (idempotente: por placa y por id de origen)
INSERT INTO public.vehicle_applications (
  created_at, owner_name, owner_phone, owner_email, owner_city,
  plate, brand, line, model_year, fuel_type, transmission,
  is_brand_suggestion, is_line_suggestion,
  expected_daily_rent, sale_price, listing_type,
  has_all_risk_insurance, photos,
  status, status_reason,
  accepts_public_contact, published_in_catalog, legacy_marketplace_car_id
)
SELECT
  COALESCE(m.created_at, now()), m.owner_name, m.owner_phone, COALESCE(m.owner_email, ''), COALESCE(m.owner_city, 'Cali'),
  m.plate, m.brand, m.model, m.year, COALESCE(m.fuel_type, 'Gasolina'), m.transmission,
  false, false,
  NULLIF(m.price_per_day, 0), m.sale_price, COALESCE(m.listing_type, 'rent'),
  false,
  (
    SELECT COALESCE(jsonb_agg(p), '[]'::jsonb)
    FROM (
      SELECT jsonb_build_object('url', m.photo_exterior_url, 'kind', 'exterior', 'is_cover_worthy', true) AS p
      WHERE m.photo_exterior_url IS NOT NULL
      UNION ALL
      SELECT jsonb_build_object('url', m.photo_interior_url, 'kind', 'interior')
      WHERE m.photo_interior_url IS NOT NULL AND m.photo_interior_url IS DISTINCT FROM m.photo_exterior_url
    ) fotos
  ),
  CASE WHEN m.status IN ('approved', 'rented') THEN 'approved' ELSE COALESCE(m.status, 'pending') END,
  'Migrado desde marketplace_cars (#38)',
  -- Desde el ticket #6 el formulario /rent-your-car exigía autorizar el contacto público
  true,
  m.status = 'approved',
  m.id
FROM public.marketplace_cars m
WHERE NOT EXISTS (
  SELECT 1 FROM public.vehicle_applications v
  WHERE v.plate = m.plate OR v.legacy_marketplace_car_id = m.id
);
