-- ===============================================================================================
-- 🛸 THE ORACLE NODES - v2.0
-- Script de Siembra (Seed) para el Nodo Falso de Pruebas
-- ===============================================================================================

-- Vamos a insertar un Nodo de prueba gigante (Radio de 5 kilómetros) 
-- En todo el medio del sur de Cali para asegurar que al menos atrape
-- a un vehículo parado y dispare el evento de Logística en un minuto.

INSERT INTO public.oracle_nodes (
    name, 
    description, 
    latitude, 
    longitude, 
    radius_meters, 
    category, 
    suggested_dwell_time_mins,
    is_active
) VALUES (
    'Zona Cero Cali (Macro Pruebas)', 
    'Nodo de validación del Oráculo. Cubre un gran porcentaje del tráfico del sur.', 
    3.405086,     -- Latitud promedio de la flota actual
    -76.479425,   -- Longitud promedio de la flota actual
    5000,         -- Súper Radio: 5 Kilómetros
    'test',       -- Categoría
    1,            -- ¡Solo 1 minuto apagado para disparar el evento!
    true
);
