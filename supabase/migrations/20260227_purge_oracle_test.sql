-- ==============================================================================
-- 1. ELIMINAR EL SÚPER-NODO DE PRUEBA
-- ==============================================================================
DELETE FROM oracle_nodes WHERE name = 'Zona Cero Cali (Semillas de Prueba)';

-- ==============================================================================
-- 2. TRUNCAR EVENTOS BASURA PREVIOS 
-- (Borramos el historial de eventos que se generó de forma imprecisa con el nodo de 5km)
-- ==============================================================================
TRUNCATE TABLE oracle_events RESTART IDENTITY CASCADE;

-- Nota: Usamos CASCADE por precaución, aunque actualmente no haya llaves foráneas dependientes de events.
