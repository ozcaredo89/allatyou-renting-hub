-- Tabla para el historial de kilometraje de los vehículos
-- Incluye campo imei para la trazabilidad con Protrack
CREATE TABLE IF NOT EXISTS public.vehicle_mileage_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    plate TEXT NOT NULL REFERENCES public.vehicles(plate) ON DELETE CASCADE,
    imei TEXT, -- Opcional, si viene de Protrack
    mileage_km NUMERIC NOT NULL,
    recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    source TEXT NOT NULL CHECK (source IN ('manual', 'protrack_api')),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Restricción para no duplicar lecturas de la API en el mismo día para el mismo GPS
    CONSTRAINT unique_daily_protrack_log UNIQUE (plate, source, recorded_at)
);

-- Índices para optimizar las consultas por periodos (día, semana, mes, fecha extendida)
CREATE INDEX IF NOT EXISTS idx_vehicle_mileage_plate ON public.vehicle_mileage_logs(plate);
CREATE INDEX IF NOT EXISTS idx_vehicle_mileage_date ON public.vehicle_mileage_logs(recorded_at DESC);

-- Opcional: Agregar el IMEI base al Vehículo si no lo tiene, para cruzar los datos
ALTER TABLE public.vehicles 
ADD COLUMN IF NOT EXISTS gps_imei TEXT;
