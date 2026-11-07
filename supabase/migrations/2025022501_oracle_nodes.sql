-- ===============================================================================================
-- 🛰️ THE ORACLE NODES - v2.0 (Data-as-a-Service)
-- Migración SQL para Supabase - Tablas Core del Motor de Inteligencia de Negocios
-- ===============================================================================================

-- 1. Tabla de Geocercas Semilla (Los Nodos Comerciales)
-- Aquí se registrarán los puntos calientes de la ciudad (Ej: Zona Franca Yumbo, Puerto Seco, etc.)
CREATE TABLE IF NOT EXISTS public.oracle_nodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    name TEXT NOT NULL, -- Ej: "Bimbo Yumbo" o "Centro Comercial Chipichape"
    description TEXT,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    radius_meters INTEGER NOT NULL DEFAULT 150, -- Radio de tolerancia para el algoritmo de cruce
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Metadatos para filtrar por tipo de industria si empiezas a suscribir clientes distintos
    category TEXT DEFAULT 'logistica', -- Ej: 'logistica', 'retail', 'industrial'
    suggested_dwell_time_mins INTEGER DEFAULT 15 -- Minutos mínimos de motor apagado esperados aquí
);

-- Habilitar RLS (Row Level Security) para oracle_nodes
ALTER TABLE public.oracle_nodes ENABLE ROW LEVEL SECURITY;

-- Políticas de Seguridad para oracle_nodes (Solo Admins leen/escriben)
CREATE POLICY "Admins pueden gestionar nodos" ON public.oracle_nodes
    FOR ALL USING (auth.role() = 'authenticated');


-- 2. Tabla de Eventos de Facturación (Los "Clústeres de Permanencia")
-- Esta es la tabla que se vende. Registra el resultado cruzado del Oráculo.
CREATE TYPE oracle_event_type AS ENUM ('logistica', 'trafico', 'desconocido');

CREATE TABLE IF NOT EXISTS public.oracle_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Relación con el Nodo Físico
    node_id UUID REFERENCES public.oracle_nodes(id) ON DELETE SET NULL,
    
    -- Sonda (Vehículo) que disparó el evento
    imei TEXT NOT NULL,
    plate TEXT, -- Opcional: Para facilitar la visualización interna
    
    -- Clasificación del Algoritmo
    event_type oracle_event_type NOT NULL,
    
    -- Tiempos (Duración del evento)
    time_entered TIMESTAMP WITH TIME ZONE NOT NULL,
    time_exited TIMESTAMP WITH TIME ZONE,
    duration_minutes INTEGER, -- Calculado cuando el vehículo sale de la zona
    
    -- Evidencia Telemática (Los promedios durante la estadía)
    avg_speed INTEGER NOT NULL,
    engine_status INTEGER NOT NULL, -- 0 o 1
    
    -- Validaciones Económicas
    is_verified BOOLEAN DEFAULT FALSE -- Se marca a TRUE cuando el script WoWt certifica el aumento de volumen
);

-- Habilitar RLS para oracle_events
ALTER TABLE public.oracle_events ENABLE ROW LEVEL SECURITY;

-- Políticas de Seguridad para oracle_events
-- Permitir lectura pública (o a clientes suscritos más adelante mediante API keys)
CREATE POLICY "Lectura autenticada de eventos" ON public.oracle_events
    FOR SELECT USING (auth.role() = 'authenticated');
    
-- El Oráculo (Backend Service Role) tiene permisos completos para insertar y actualizar eventos
CREATE POLICY "Inserción mediante Service Role" ON public.oracle_events
    FOR ALL USING (TRUE); -- Asumimos que la inserción la hará Node.js usando la SUPABASE_SERVICE_ROLE.


-- 3. Índices de Rendimiento (Para cuando se llene el Dashboard de BI)
CREATE INDEX idx_oracle_events_node_id ON public.oracle_events(node_id);
CREATE INDEX idx_oracle_events_event_type ON public.oracle_events(event_type);
CREATE INDEX idx_oracle_events_time_entered ON public.oracle_events(time_entered);
