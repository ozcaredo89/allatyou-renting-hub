-- ===============================================================================================
-- 🌌 THE ORACLE NODES - DATALAKE & ORGANIC CLUSTERING (Fase 4)
-- ===============================================================================================

-- 1. Crear Tabla del DataLake Crudo
-- Almacenará todas las coordenadas absolutas reportadas por la flota cada 3 minutos.
CREATE TABLE IF NOT EXISTS public.raw_telemetry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    imei TEXT NOT NULL,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    speed INTEGER NOT NULL,
    accstatus INTEGER NOT NULL, -- 0 = apagado, 1 = prendido
    report_time TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Índices cruciales para agrupar luego millones de registros velozmente
CREATE INDEX IF NOT EXISTS idx_raw_telemetry_time ON public.raw_telemetry(report_time);
CREATE INDEX IF NOT EXISTS idx_raw_telemetry_acc ON public.raw_telemetry(accstatus);

-- 2. Vista de Descubrimiento Orgánico (Organic Hotspots)
-- Este algoritmo agrupa puntos cercanos usando un "Grid" matemático de aproximadamente 111 metros.
-- Solo tomamos en cuenta vehículos apagados (accstatus = 0) para detectar paradas reales, no semáforos.

CREATE OR REPLACE VIEW public.organic_hotspots_view AS
SELECT
    -- Agrupamiento Espacial: Redondeamos Lat/Lng a 3 decimales (Aprox grid de 111m x 111m)
    ROUND(lat::numeric, 3) AS grid_lat,
    ROUND(lng::numeric, 3) AS grid_lng,
    
    -- Métricas del Hotspot
    COUNT(id) AS total_pings, -- Cuántas veces el oráculo vio un carro apagado ahí
    COUNT(DISTINCT imei) AS unique_vehicles, -- Cuántos carros distintos han estado en este hexágono
    
    -- Un aproximado del "Dwell Time" en horas basado en 1 ping = 3 minutos = 0.05 horas
    ROUND((COUNT(id) * 3.0 / 60.0), 1) as estimated_dwell_hours

FROM public.raw_telemetry
WHERE 
    accstatus = 0 -- Solo vehículos estacionados/descargando
    -- Opcional: Filtramos solo la historia reciente (ej. últimos 14 días) para no saturar
    AND report_time >= NOW() - INTERVAL '14 days' 

GROUP BY grid_lat, grid_lng
-- Filtro orgánico: Un hotspot real necesita al menos 3 horas de parqueo acumulado o varios carros
HAVING COUNT(id) >= 10 
ORDER BY total_pings DESC;

-- Revocar permisos por defecto y asegurar lectura
REVOKE ALL ON public.organic_hotspots_view FROM PUBLIC;
GRANT SELECT ON public.organic_hotspots_view TO authenticated;
GRANT SELECT ON public.organic_hotspots_view TO service_role;
