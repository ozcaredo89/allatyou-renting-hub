-- Issue #75: Evidencia de kilometraje y gasolina por link de WhatsApp.
-- El admin genera un link único (token) por vehículo; el conductor digita el km
-- (debe ser mayor al odómetro anterior), elige el nivel de combustible y sube la
-- foto del tablero. Al completarse se inserta la lectura en vehicle_mileage_logs
-- (source = 'manual', lectura absoluta) y se referencia en mileage_log_id.
CREATE TABLE IF NOT EXISTS public.mileage_evidence_requests (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    token TEXT NOT NULL UNIQUE,
    plate TEXT NOT NULL REFERENCES public.vehicles(plate) ON DELETE CASCADE,
    driver_id TEXT,
    driver_name TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
    previous_mileage_km NUMERIC,
    mileage_km NUMERIC,
    fuel_level TEXT CHECK (fuel_level IS NULL OR fuel_level IN ('empty', '1/4', '1/2', '3/4', 'full')),
    photo_url TEXT,
    mileage_log_id UUID REFERENCES public.vehicle_mileage_logs(id) ON DELETE SET NULL,
    created_by TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_mileage_evidence_plate ON public.mileage_evidence_requests(plate, created_at DESC);
